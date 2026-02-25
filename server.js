// server.js — Unified Server (HTTP + API + WebSocket Bridge)

// ==============================
// Core dependencies
const express = require('express');
const mssql = require('mssql');
const dbConfig = require('./db-config');
const logsDbConfig = require('./logsdbconfig');
const { spawn } = require('child_process'); // PowerShell for AD auth
const { LogsRepository } = require('./logsRepository');
const ViawebCommands = require('./viaweb-commands');
const WebSocket = require('ws');
const { setupWebSocketServer } = require('./wsHandler');

// ==============================
// Event locking & deduplication
// In-memory event locks: eventKey -> { operator, timestamp }
const eventLocks = new Map();
const LOCK_TIMEOUT = 60000; // 60s without keepalive = auto-release

// ==============================
// Logger (with safe fallback)
// Tries to load structured logger; falls back to console
let logger;
try {
  logger = require('./logger');
} catch (e) {
  logger = {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.log,
    http: console.log
  };
}

// ==============================
// Metrics (optional module)
// Tries to load metrics collector; no-op if unavailable
let metrics;
try {
  metrics = require('./metrics');
} catch (e) {
  metrics = {
    recordEvent: () => { },
    recordCommand: () => { },
    recordError: () => { },
    recordConnection: () => { },
    recordDisconnection: () => { },
    getMetrics: () => ({ error: 'Metrics module not available' })
  };
}

// ==============================
// Server configuration
const HTTP_PORT = 80;
const WS_PORT = 8090;
const TCP_HOST = '10.0.20.43';
const TCP_PORT = 2700;
// AES-256-CBC static key/IV (protocol requirement)
const CHAVE = '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD';
const IV = '70FC01AA8FCA3900E384EA28A5B7BCEF';
// ==============================
// CORS configuration
// Allowed origins (explicit whitelist)
const CORS_WHITELIST = [
  'http://localhost',
  'http://192.9.100.100',
  'http://127.0.0.1',
];

// ==============================
// Global runtime state
let dbPool = null;          // Main (ASM) DB pool
let logsDbPool = null;      // Logs DB pool
// Logs repository (lazy DB connection)
const logsRepo = new LogsRepository(connectLogsDatabase);

// ==============================
// Database connections
// Main ASM database pool (lazy initialization)
async function connectDatabase() {
  try {
    if (!dbPool) {
      logger.info('🔌 Connecting to main database...');
      dbPool = await mssql.connect(dbConfig);
      logger.info('✅ Main database connected');
    }
    return dbPool;
  } catch (err) {
    logger.error('❌ Failed to connect to main database: ' + err.message);
    metrics.recordError();
    throw err;
  }
}

// Logs database pool (lazy initialization)
async function connectLogsDatabase() {
  try {
    if (!logsDbPool) {
      logger.info('🔌 Connecting to logs database...');
      logsDbPool = await new mssql.ConnectionPool(logsDbConfig).connect();
      logger.info('✅ Logs database connected');
    }
    return logsDbPool;
  } catch (err) {
    logger.error('❌ Failed to connect to logs database: ' + err.message);
    metrics.recordError();
    throw err;
  }
}

// ==============================
// Express application bootstrap
const app = express();
// JSON body parser with strict size limit (security hardening)
app.use(express.json({ limit: '10kb' }));

// ==============================
// Rate limiting (in-memory, IP-based)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime + RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
  if (rateLimitMap.size > 0) {
    logger.debug(`Rate limit map cleaned, ${rateLimitMap.size} entries remaining`);
  }
}, 5 * 60 * 1000);

// Core rate limiter middleware
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  const record = rateLimitMap.get(ip);
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }
  record.count++;
  next();
}

// ==============================
// CORS middleware (whitelist-based)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || CORS_WHITELIST.includes(origin) || CORS_WHITELIST.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// ==============================
// Active Directory authentication helpers
function escapePw(str = '') {
  return String(str).replace(/'/g, "''");
}

function authenticateAd(username, password, domain = 'Cotrijal') {
  return new Promise((resolve, reject) => {
    const u = escapePw(username);
    const p = escapePw(password);
    const script = `
      $u='${u}'
      $p='${p}'
      Add-Type -AssemblyName System.DirectoryServices.AccountManagement
      $ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext('Domain','${domain}')
      if ($ctx.ValidateCredentials($u,$p)) { 'OK' } else { 'FAIL' }
    `;
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true }
    );
    let out = '', err = '';
    ps.stdout.on('data', d => out += d.toString());
    ps.stderr.on('data', d => err += d.toString());
    ps.on('close', () => {
      if (err) return reject(new Error(err.trim()));
      resolve(out.trim() === 'OK');
    });
    ps.on('error', reject);
  });
}

// ==============================
// Authentication API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Usuário e senha são obrigatórios'
    });
  }
  try {
    const ok = await authenticateAd(username, password, 'Cotrijal');
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Credenciais inválidas'
      });
    }
    return res.json({
      success: true,
      user: {
        username,
        domain: 'Cotrijal',
        displayName: `${username}@Cotrijal`
      }
    });
  } catch (e) {
    logger.error('❌ AD auth error: ' + e.message);
    return res.status(500).json({
      success: false,
      error: 'Falha ao autenticar no AD'
    });
  }
});

// ==============================
// Logs API — incoming event
app.post('/api/logs/event', async (req, res) => {
  const event = req.body || {};
  const codigo = event?.codigoEvento || event?.codigo || event?.code;
  const isep = event?.isep || event?.local || event?.clientId;
  if (!codigo || !isep) {
    return res.status(400).json({
      success: false,
      error: 'Dados obrigatórios ausentes'
    });
  }
  try {
    const eventId = await logsRepo.saveIncomingEvent(event);
    return res.json({ success: true, eventId });
  } catch (e) {
    logger.error('❌ API /api/logs/event: ' + e.message);
    metrics.recordError();
    return res.status(500).json({
      success: false,
      error: 'Falha ao salvar evento'
    });
  }
});

// ==============================
// Logs API — closure + WebSocket broadcast
app.post('/api/logs/close', async (req, res) => {
  const { event, closure } = req.body || {};
  const codigo = event?.codigoEvento || event?.codigo || event?.code;
  const isep = event?.isep || event?.local || event?.clientId;
  const tipo = closure?.type;

  if (!closure || !tipo || !codigo || !isep) {
    return res.status(400).json({
      success: false,
      error: 'Dados obrigatórios ausentes'
    });
  }

  try {
    // ✅ Chama saveEventAndClosure com retry automático
    const result = await logsRepo.saveEventAndClosure(event, closure);

    // ✅ Notifica via WebSocket apenas após sucesso
    const closureNotification = JSON.stringify({
      type: 'closure',
      isep,
      codigo,
      complemento: event?.complemento,
      timestamp: Date.now(),
      closedBy: closure?.user?.username
    });

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(closureNotification);
      }
    });

    logger.info(`📢 Encerramento salvo e notificado: ${isep}-${codigo}`);
    return res.json({
      success: true,
      eventId: result.eventId,
      closureId: result.closureId
    });

  } catch (e) {
    logger.error('❌ API /api/logs/close: ' + e.message);
    metrics.recordError();

    // ✅ Mensagem específica para o usuário
    const userMessage = e.message.includes('deadlock')
      ? 'Conflito temporário ao salvar. Por favor, tente novamente.'
      : 'Falha ao salvar encerramento';

    return res.status(500).json({
      success: false,
      error: userMessage
    });
  }
});

// ==============================
// Logs API — recent events (frontend hydration)
app.get('/api/logs/events', async (req, res) => {
  const limit = Number(req.query.limit) || 300; // Default safety limit
  try {
    const rows = await logsRepo.getRecentEvents(limit);
    return res.json({
      success: true,
      data: rows
    });
  } catch (e) {
    logger.error('❌ API /api/logs/events: ' + e.message);
    metrics.recordError();
    return res.status(500).json({
      success: false,
      error: 'Falha ao buscar eventos'
    });
  }
});

// ==============================
// Logs API — event lock (optimistic concurrency control)
app.post('/api/logs/lock', (req, res) => {
  const { eventKey, operador } = req.body || {};
  // Basic validation
  if (!eventKey || !operador) {
    return res.status(400).json({
      success: false,
      error: 'eventKey e operador são obrigatórios'
    });
  }
  const existing = eventLocks.get(eventKey);
  const now = Date.now();
  // If locked by another operator and not expired, deny
  if (
    existing &&
    existing.operador !== operador &&
    (now - existing.timestamp) < LOCK_TIMEOUT
  ) {
    return res.json({
      success: false,
      locked: true,
      lockedBy: existing.operador
    });
  }
  // Acquire or renew lock
  eventLocks.set(eventKey, {
    operador,
    timestamp: now
  });
  // Notify all WebSocket clients
  const lockNotification = JSON.stringify({
    type: 'event_locked',
    eventKey,
    operador
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(lockNotification);
    }
  });
  logger.info(`🔒 Lock adquirido: ${eventKey} por ${operador}`);
  return res.json({
    success: true,
    locked: true,
    lockedBy: operador
  });
});

// ==============================
// Logs API — event unlock
app.post('/api/logs/unlock', (req, res) => {
  const { eventKey, operador } = req.body || {};
  if (!eventKey) {
    return res.status(400).json({
      success: false,
      error: 'eventKey é obrigatório'
    });
  }
  const existing = eventLocks.get(eventKey);
  // Unlock only if same operator or lock expired
  if (
    existing &&
    (
      existing.operador === operador ||
      (Date.now() - existing.timestamp) >= LOCK_TIMEOUT
    )
  ) {
    eventLocks.delete(eventKey);
    // Notify all WebSocket clients
    const unlockNotification = JSON.stringify({
      type: 'event_unlocked',
      eventKey
    });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(unlockNotification);
      }
    });
    logger.info(`🔓 Lock liberado: ${eventKey}`);
    return res.json({ success: true });
  }
  return res.json({
    success: false,
    error: 'Lock não pertence a este operador'
  });
});

// ==============================
// Apply rate limiting to all /api routes (after auth/logs)
app.use('/api', rateLimiter);

// ==============================
// Units API — installations list
app.get('/api/units', async (req, res) => {
  try {
    const pool = await connectDatabase();
    const result = await pool.request().query(`
      SELECT
       e.[ID_EQTO] AS value,
       i.[NOME]   AS local,
       i.[NOME]   AS label
      FROM [viaweb].[Programação].[dbo].[INSTALACAO] i
	    LEFT JOIN [viaweb].[Programação].[dbo].[EQTO] e
      ON i.[ID_INSTALACAO] = e.[ID_INSTALACAO]
	    WHERE (e.[NOME] not like 'Exp%' and e.[NOME] not like 'teclado%') OR e.[NOME] is null
      ORDER BY i.[NOME]
    `);
    res.json({
      success: true,
      data: result.recordset
    });
    logger.info(`✅ API — Retornadas ${result.recordset.length} unidades`);
  } catch (err) {
    logger.error('❌ API — Erro ao buscar unidades: ' + err.message);
    metrics.recordError();
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ==============================
// Users API — enriched user list (ASM + colaboradores)
app.get('/api/users', async (req, res) => {
  try {
    const pool = await connectDatabase();
    const result = await pool.request().query(`
      SELECT 
       a.[ID_USUARIO],
       a.[NOME] AS matricula,
       b.[NUMERO] AS idIsep,
       c.[nome],
       c.[cargo],
       c.[telefone1],
       c.[telefone2],
       c.[ramal],
       c.[c_custo],
       c.[setor],
       c.[local],
       c.[situacao],
       b.[nome] AS unidade
      FROM [viaweb].[Programação].[dbo].[USUARIOS] a
      LEFT JOIN [viaweb].[Programação].[dbo].[INSTALACAO] b
       ON a.ID_INSTALACAO = b.[ID_INSTALACAO]
      LEFT JOIN [ASM].[dbo].[_colaboradores] c
       ON a.NOME = c.[matricula]
      WHERE ID_USUARIO > 6
       AND LEN(a.nome) > 0
       AND LEN(codigo) > 0
       AND ISNUMERIC(a.NOME) = 1
       AND LEN(c.nome) > 0
       AND b.[numero] IS NOT NULL
      ORDER BY 3, 2
    `);
    res.json({
      success: true,
      data: result.recordset
    });
    logger.info(`✅ API — Retornados ${result.recordset.length} usuários`);
  } catch (err) {
    logger.error('❌ API — Erro ao buscar usuários: ' + err.message);
    metrics.recordError();
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ==============================
// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==============================
// Metrics endpoint (if enabled)
app.get('/api/metrics', (req, res) => {
  res.json(metrics.getMetrics());
});

// ==============================
// Logs API — recent closures + edit endpoint
app.get('/api/logs/closures', async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  try {
    const pool = await connectLogsDatabase();
    const result = await pool.request()
      .input('Limit', mssql.Int, limit)
      .query(`
        SELECT TOP (@Limit)
          c.Id, c.EventId, c.ISEP, c.Codigo, c.Complemento, c.Particao,
          c.Descricao, c.DataEvento, c.Tipo, c.Procedimento,
          c.ClosedBy, c.ClosedByDisplay, c.ClosedAt,
          e.DataHora
        FROM LOGS.LOGS.Closures c
        LEFT JOIN LOGS.LOGS.Events e
          ON e.ClosureId = c.Id
        ORDER BY c.ClosedAt DESC;
      `);

    return res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    logger.error('❌ API /api/logs/closures: ' + err.message);
    return res.status(500).json({
      success: false,
      error: 'Falha ao buscar encerramentos'
    });
  }
});

// ==============================
// Edit closure procedure endpoint
app.post('/api/logs/closure/edit', async (req, res) => {
  const { closureId, newProcedure, editedBy } = req.body || {};

  if (!closureId || !newProcedure || !editedBy) {
    return res.status(400).json({
      success: false,
      error: 'Dados obrigatórios ausentes'
    });
  }

  try {
    const pool = await connectLogsDatabase();

    // Busca procedimento antigo
    const existing = await pool.request()
      .input('Id', mssql.Int, closureId)
      .query('SELECT Procedimento, ClosedBy, ClosedAt FROM LOGS.LOGS.Closures WHERE Id = @Id');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Encerramento não encontrado' });
    }

    const old = existing.recordset[0];
    const closedAt = new Date(old.ClosedAt);
    const now = new Date();
    const hoursDiff = (now - closedAt) / (1000 * 60 * 60);

    if (hoursDiff > 12) {
      return res.status(403).json({
        success: false,
        error: 'Prazo de 12 horas expirado'
      });
    }

    const editLog = `\n\n[EDITADO em ${now.toLocaleString('pt-BR')} por ${editedBy}]\nAnterior: ${old.Procedimento}`;

    await pool.request()
      .input('Id', mssql.Int, closureId)
      .input('NewProc', mssql.NVarChar(mssql.MAX), newProcedure + editLog)
      .query('UPDATE LOGS.LOGS.Closures SET Procedimento = @NewProc WHERE Id = @Id');

    return res.json({ success: true });
  } catch (err) {
    logger.error('❌ API /api/logs/closure/edit: ' + err.message);
    return res.status(500).json({
      success: false,
      error: 'Falha ao editar encerramento'
    });
  }
});

// ==============================
// Static file hosting (frontend assets)
app.use(express.static(__dirname));

// ==============================
// Periodic cleanup of expired event locks
setInterval(() => {
  const now = Date.now();
  for (const [key, lock] of eventLocks.entries()) {
    // Auto-release lock if timeout exceeded
    if (now - lock.timestamp >= LOCK_TIMEOUT) {
      eventLocks.delete(key);
      logger.info(`🔓 Lock expirado liberado: ${key}`);
      // Notify all WebSocket clients about unlock
      const unlockNotification = JSON.stringify({
        type: 'event_unlocked',
        eventKey: key
      });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(unlockNotification);
        }
      });
    }
  }
}, 60000);

// ==============================
// HTTP server bootstrap
const httpServer = app.listen(HTTP_PORT, '0.0.0.0', () => {
  logger.info(`🌐 Servidor HTTP rodando em:`);
  logger.info(`   →        http://localhost`);
  logger.info(`   →        http://192.9.100.100`);
  logger.info(`   → Units:        http://192.9.100.100/api/units`);
  logger.info(`   → Users:        http://192.9.100.100/api/users`);
  logger.info(`   → Metrics:    http://192.9.100.100/api/metrics`);
});

// ==============================
// WebSocket server bootstrap (bridge layer)
// Define configuração para o WebSocket
const cfg = {
  WS_HOST: '0.0.0.0',
  WS_PORT: WS_PORT,
  TCP_HOST: TCP_HOST,
  TCP_PORT: TCP_PORT,
  CHAVE_HEX: CHAVE,
  IV_HEX: IV
};

// Inicializa o WebSocket Server
const { wss, getTcpClient, sendAck } = setupWebSocketServer(null, { ...cfg, onTcpEvent: saveEventFromTcp });


// ==============================
// Database helper — fetch user by ISEP + ID_USUARIO
async function getUserFromDb(isep, idUsuario) {
  // Ignore system/internal users
  if (!idUsuario || idUsuario <= 6) return null;
  try {
    const pool = await connectDatabase();
    const result = await pool.request()
      .input('isep', mssql.NVarChar(10), String(isep))
      .input('idUsuario', mssql.Int, Number(idUsuario))
      .query(`
        SELECT TOP 1
          a.ID_USUARIO,
          a.NOME AS matricula,
          c.nome,
          c.cargo
        FROM [viaweb].[Programação].[dbo].[USUARIOS] a
        LEFT JOIN [viaweb].[Programação].[dbo].[INSTALACAO] b
          ON a.ID_INSTALACAO = b.ID_INSTALACAO
        LEFT JOIN [ASM].[dbo].[_colaboradores] c
          ON a.NOME = c.matricula
        WHERE b.NUMERO = @isep
          AND a.ID_USUARIO = @idUsuario
          AND LEN(c.nome) > 0
      `);
    return result.recordset[0] || null;
  } catch (err) {
    logger.error('❌ Erro ao buscar usuário:  ' + err.message);
    return null;
  }
}

// ==============================
// User display name formatter
function formatUserName(user) {
  if (!user) return null;
  const nome = user.nome || 'Sem nome';
  const cargo = user.cargo ? ` (${toTitleCase(user.cargo)})` : '';
  return `${nome}${cargo}`;
}

// ==============================
// String helper — Title Case normalization
function toTitleCase(str) {
  return String(str)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

async function saveEventFromTcp(op) {
  const cod = op.codigoEvento || 'N/A';
  const eventId = op.id;

  if (cod === '1412') {
    sendAckToViaweb(eventId);
    return { success: true, skipped: true };
  }

  const rawComplement = (op.zonaUsuario !== undefined ? op.zonaUsuario : op.complemento);
  const hasComplemento = rawComplement !== undefined && rawComplement !== null;
  let zonaUsuario = hasComplemento ? Number(rawComplement) : 0;
  if (Number.isNaN(zonaUsuario)) zonaUsuario = 0;

  const part = op.particao || 1;
  const local = op.isep || 'N/A';
  const clientId = op.isep || op.contaCliente || '';
  let ts = op.recepcao || Date.now();
  if (ts < 10000000000) ts *= 1000;

  const armDisarmCodes = [
    '1401', '1402', '1403', '1404', '1405', '1406', '1407', '1408',
    '3401', '3402', '3403', '3404', '3405', '3406', '3407', '3408'
  ];

  const tipos = {
    0: '[ Horário Programado ]',
    1: '[ Monitoramento ]',
    2: '[ Facilitador ]',
    3: '[ Senha Única ]',
    4: '[ Senha Única ]',
    5: '[ Senha Única ]',
    6: '[ TI - Manutenção ]'
  };

  // ✅ CORRIGIDO: Dicionário local (sem window)
  const eventosDB = {
    "1130": "Disparo",
    "3130": "Restauro",
    "1140": "Disparo",
    "3140": "Restauro",
    "1100": "Emergência Médica",
    "1110": "Incêndio",
    "1120": "Emergência Silenciosa",
    "1121": "Coação",
    "1144": "Violação de Tamper",
    "3144": "Restauro de Tamper",
    "1300": "Falha de Fonte Auxiliar",
    "3300": "Restauro de Fonte Auxiliar",
    "1301": "Falha de Energia Elétrica",
    "3301": "Restauro de Energia Elétrica",
    "1302": "Falha de Bateria",
    "3302": "Restauro de Falha de Bateria",
    "1333": "Falha de Tensão no Barramento",
    "3333": "Restauro de Falha de Tensão no Barramento",
    "1321": "Falha de Sirene 1",
    "3321": "Restauro de Sirene 1",
    "1143": "Falha de Módulo Expansor",
    "3143": "Restauro de Módulo Expansor",
    "1350": "Falha de Comunicação",
    "3350": "Restauro de Comunicação",
    "1351": "Falha de Linha Telefônica",
    "3351": "Restauro de Linha Telefônica",
    "1142": "Curto circuito no sensor",
    "3142": "Restauro de Curto Circuito",
    "1401": "Desarmado",
    "3401": "Armado",
    "1992": "Disparo de Gerador de Névoa",
    "3992": "Restauro de Gerador de Névoa",
    "1402": "Desarmado",
    "3402": "Armado",
    "3403": "Auto Ativação",
    "1410": "Acesso via Cabo Serial",
    "3456": "Armado Forçado",
    "1570": "Inibido sensor",
    "1412": "Acesso remoto VIAWEB",
    "3407": "Programação lacrada (nível)",
    "3408": "Programação liberada (nível)",
    "1602": "Teste Automático",
    "1603": "Teste Internet",
    "1384": "Falha de bateria sensor sem fio",
    "1386": "Falha de bateria controle remoto",
    "1381": "Falha supervisão sensor sem fio",
    "3381": "Restauro supervisão sensor sem fio",
    "1382": "Falha supervisão dispositivo sem fio",
    "3382": "Restauro supervisão dispositivo sem fio",
    "1383": "Falha supervisão controle remoto",
    "3384": "Restauro bateria sensor sem fio",
    "1385": "Falha de bateria dispositivo sem fio",
    "3386": "Restauro bateria controle remoto",
    "3385": "Restauro bateria dispositivo sem fio",
    "3383": "Restauro supervisão controle remoto",
    "0000": "Evento Não Cadastrado",
    "AA0": "Servidor VIAWEB iniciado",
    "AA1": "Servidor VIAWEB parado",
    "AA5": "Cliente solicita autorização",
    "3AA6": "Alarme online",
    "1AA6": "Alarme offline"
  };

  const isArmDisarm = armDisarmCodes.includes(cod);
  let descricao = null;
  let userName = null;
  let userId = null;
  let userMatricula = null;

  if (isArmDisarm) {
    const baseDesc = cod.startsWith('3') ? '[ Armado ] - ' : '[ Desarmado ] - ';
    if (tipos[zonaUsuario]) {
      descricao = `${baseDesc}${tipos[zonaUsuario]}`;
    } else if (zonaUsuario > 6) {
      const userData = await getUserFromDb(local, zonaUsuario);
      if (userData) {
        userName = formatUserName(userData);
        userId = userData.ID_USUARIO;
        userMatricula = userData.matricula;
        descricao = `${baseDesc}${userName}`;
      } else {
        descricao = `${baseDesc}Usuário ID ${zonaUsuario} não Cadastrado`;
      }
    }
  } else {
    descricao = eventosDB[cod] || op.descricao || `Evento ${cod}`;
    if (hasComplemento && zonaUsuario > 0) {
      descricao += ` - Sensor ${zonaUsuario}`;
    }
  }

  const event = {
    codigoEvento: cod,
    codigo: cod,
    complemento: hasComplemento ? zonaUsuario : 0,
    particao: part,
    local: local,
    isep: local,
    clientId: clientId,
    timestamp: ts,
    descricao: descricao,
    userName: userName,
    userId: userId,
    userMatricula: userMatricula
  };

  try {
    const savedId = await logsRepo.saveIncomingEvent(event);
    if (savedId) {
      logger.info(`💾 Event saved: ${cod} | ISEP: ${local} | ID: ${savedId}`);
    } else {
      logger.debug(`⏭️ Duplicate event ignored: ${cod} | ISEP: ${local}`);
    }
    sendAckToViaweb(eventId);
    return { success: true, savedId };
  } catch (err) {
    logger.error(`❌ DB FAILURE: ${cod} | ISEP: ${local} | ${err.message}`);
    metrics.recordError();
    return { success: false, error: err.message };
  }
}
// ==============================
// Sends encrypted ACK to Viaweb server via TCP
function sendAckToViaweb(eventId) {
  // Invalid event does not generate ACK
  if (!eventId) return;

  // Build ACK command
  const ackCommand = ViawebCommands.createAckCommand(eventId);

  // Envia através do módulo wsHandler
  if (sendAck) {
    try {
      sendAck(ackCommand);
      logger.info(`✅ ACK sent: ${eventId}`);
    } catch (e) {
      logger.error('❌ Error sending ACK: ' + e.message);
    }
  } else {
    logger.warn('⚠️ TCP command function not available');
  }
}

// =====================================================
// Graceful process shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Shutting down server...');
  if (dbPool) {
    await dbPool.close();
    logger.info('✅ Main database closed');
  }
  if (logsDbPool) {
    await logsDbPool.close();
    logger.info('✅ Logs database closed');
  }
  process.exit(0);
});

// =====================================================
// Initialization completed
logger.info('✅ Viaweb Cotrijal system successfully started!');
logger.info('📊 Real-time logs enabled');
