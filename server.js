// server.js - Servidor unificado (HTTP + API + WebSocket Bridge)
const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');
const express = require('express');
const mssql = require('mssql');
const dbConfig = require('./db-config');
const logsDbConfig = require('./logs-db-config');
const { spawn } = require('child_process');
const { LogsRepository } = require('./logs-repository');
const ViawebCommands = require('./viaweb-commands');
const eventLocks = new Map(); // key -> { operador, timestamp }
const LOCK_TIMEOUT = 60000; // 60s sem keepalive = auto-release
const wsEventDedupeCache = new Map();
const WS_DEDUPE_TTL = 120000; // 2 minutos

function pruneWsDedupeCache() {
    const now = Date.now();
    for (const [key, data] of wsEventDedupeCache. entries()) {
        if (now - data.ts > WS_DEDUPE_TTL) {
            wsEventDedupeCache.delete(key);
        }
    }
}

function shouldSendToClients(op) {
    if (op. acao !== 'evento') return true; // Só dedupa eventos
    
    pruneWsDedupeCache();
    
    const cod = op.codigoEvento || '';
    const isep = op.isep || '';
    const complemento = op.zonaUsuario ??  op.complemento ??  0;
    const ts = op.recepcao || Date.now();
    
    const key = `${cod}-${isep}-${complemento}-${ts}`;
    
    if (wsEventDedupeCache. has(key)) {
        return false; // Já enviou para clientes
    }
    
    wsEventDedupeCache.set(key, { ts:  Date.now() });
    return true;
}

// Try to use structured logger, fallback to console if winston not available
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

// Try to use metrics collector
let metrics;
try {
	metrics = require('./metrics');
} catch (e) {
	metrics = {
		recordEvent: () => {},
		recordCommand: () => {},
		recordError: () => {},
		recordConnection: () => {},
		recordDisconnection: () => {},
		getMetrics: () => ({ error: 'Metrics module not available' })
	};
}

// Configurações
const HTTP_PORT = 80;
const WS_PORT = 8090;
const TCP_HOST = '10.0.20.43';
const TCP_PORT = 2700;

const CHAVE = '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD';
const IV = '70FC01AA8FCA3900E384EA28A5B7BCEF';

// CORS whitelist - Replace '*' with specific origins
const CORS_WHITELIST = [
	'http://localhost',
	'http://192.9.100.100',
	'http://127.0.0.1',
];

let globalTcpClient = null;
let globalKeyBuffer = null;
let globalIvSend = null;
let globalIvRecv = null;
let tcpIdentSent = false;
let dbPool = null;	   // ASM
let logsDbPool = null;   // Logs
const logsRepo = new LogsRepository(connectLogsDatabase);

// Buffer de recepção para montar blocos completos (múltiplos de 16)
let tcpRecvBuffer = Buffer.alloc(0);

function encrypt(plainText, keyBuffer, ivBuffer) {
	const plainBytes = Buffer.from(plainText, 'utf8');
	const blockSize = 16;
	const padLen = blockSize - (plainBytes.length % blockSize);
	const paddedLength = plainBytes.length + padLen;
	const paddedData = Buffer.alloc(paddedLength);
	plainBytes.copy(paddedData, 0);
	for (let i = plainBytes.length; i < paddedLength; i++) {
		paddedData[i] = padLen;
	}
	const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
	cipher.setAutoPadding(false);
	let encrypted = cipher.update(paddedData);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return encrypted;
}

function decrypt(encryptedBuffer, keyBuffer, ivBuffer) {
	const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
	decipher.setAutoPadding(false);
	let decrypted = decipher.update(encryptedBuffer);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	const padLen = decrypted[decrypted.length - 1];
	const unpaddedData = decrypted.slice(0, -padLen);
	return unpaddedData.toString('utf8');
}

function hexToBuffer(hexString) {
	return Buffer.from(hexString, 'hex');
}

// Loga até maxBytes em hex, espaçado
function formatHex(buffer, maxBytes = 128) {
	if (!buffer) return '';
	const slice = buffer.slice(0, maxBytes);
	return slice.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
}

// Pool ASM (unidades/usuários)
async function connectDatabase() {
	try {
		if (!dbPool) {
			logger.info('🔌 Conectando ao banco de dados...');
			dbPool = await mssql.connect(dbConfig);
			logger.info('✅ Banco de dados conectado');
		}
		return dbPool;
	} catch (err) {
		logger.error('❌ Erro ao conectar ao banco: ' + err.message);
		metrics.recordError();
		throw err;
	}
}

// Pool Logs (encerramentos)
async function connectLogsDatabase() {
	try {
		if (!logsDbPool) {
			logger.info('🔌 Conectando ao banco Logs...');
			logsDbPool = await new mssql.ConnectionPool(logsDbConfig).connect();
			logger.info('✅ Banco Logs conectado');
		}
		return logsDbPool;
	} catch (err) {
		logger.error('❌ Erro ao conectar ao banco Logs: ' + err.message);
		metrics.recordError();
		throw err;
	}
}

const app = express();

app.use(express.json({ limit: '10kb' }));

// Rate limiting middleware (simple implementation)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

// Cleanup old rate limit records every 5 minutes
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

// CORS middleware with whitelist
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
		const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
		let out = '', err = '';
		ps.stdout.on('data', d => out += d.toString());
		ps.stderr.on('data', d => err += d.toString());
		ps.on('close', code => {
			if (err) return reject(new Error(err.trim()));
			resolve(out.trim() === 'OK');
		});
		ps.on('error', reject);
	});
}

app.post('/api/login', async (req, res) => {
	const { username, password } = req.body || {};
	if (!username || !password) {
		return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios' });
	}
	try {
		const ok = await authenticateAd(username, password, 'Cotrijal');
		if (!ok) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
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
		return res.status(500).json({ success: false, error: 'Falha ao autenticar no AD' });
	}
});

app.post('/api/logs/event', async (req, res) => {
	const event = req.body || {};
	const codigo = event?.codigoEvento || event?.codigo || event?.code;
	const isep = event?.isep || event?.local || event?.clientId;

	if (!codigo || !isep) {
		return res.status(400).json({
			success: false,
			error: 'Dados obrigatórios ausentes: codigoEvento/codigo e isep/local/clientId são obrigatórios'
		});
	}

	try {
		const eventId = await logsRepo.saveIncomingEvent(event);
		return res.json({ success: true, eventId });
	} catch (e) {
		logger.error('❌ API /api/logs/event: ' + e.message);
		metrics.recordError();
		return res.status(500).json({ success: false, error: 'Falha ao salvar evento' });
	}
});

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
		await logsRepo.saveEventAndClosure(event, closure);
		
		// ========== NOVO: Notifica todos os clientes WebSocket ==========
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
		
		logger.info(`📢 Encerramento notificado: ${isep}-${codigo}`);
		
		return res.json({ success: true });
	} catch (e) {
		logger.error('❌ API /api/logs/close: ' + e.message);
		metrics.recordError();
		return res.status(500).json({ success: false, error: 'Falha ao salvar encerramento' });
	}
});

app.get('/api/logs/events', async (req, res) => {
	const limit = Number(req.query.limit) || 300;
	try {
		const rows = await logsRepo.getRecentEvents(limit);
		return res.json({ success: true, data: rows });
	} catch (e) {
		logger.error('❌ API /api/logs/events: ' + e.message);
		metrics.recordError();
		return res.status(500).json({ success: false, error: 'Falha ao buscar eventos' });
	}
});

app.post('/api/logs/lock', (req, res) => {
	const { eventKey, operador } = req.body || {};
	if (!eventKey || !operador) {
		return res.status(400).json({ success: false, error: 'eventKey e operador são obrigatórios' });
	}
	
	const existing = eventLocks.get(eventKey);
	const now = Date.now();
	
	// Se já está locked por outro operador e não expirou, nega
	if (existing && existing.operador !== operador && (now - existing.timestamp) < LOCK_TIMEOUT) {
		return res.json({ 
			success: false, 
			locked: true, 
			lockedBy: existing.operador 
		});
	}
	
	// Adquire/renova o lock
	eventLocks.set(eventKey, { operador, timestamp: now });
	
	// Notifica outros clientes sobre o lock
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
	return res.json({ success: true, locked: true, lockedBy: operador });
});

app.post('/api/logs/unlock', (req, res) => {
	const { eventKey, operador } = req.body || {};
	if (!eventKey) {
		return res.status(400).json({ success: false, error: 'eventKey é obrigatório' });
	}
	
	const existing = eventLocks.get(eventKey);
	
	// Só desbloqueia se for o mesmo operador ou se expirou
	if (existing && (existing.operador === operador || (Date.now() - existing.timestamp) >= LOCK_TIMEOUT)) {
		eventLocks.delete(eventKey);
		
		// Notifica outros clientes sobre o unlock
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
	
	return res.json({ success: false, error: 'Lock não pertence a este operador' });
});

app.use('/api', rateLimiter);

app.get('/api/units', async (req, res) => {
	try {
		const pool = await connectDatabase();
		const result = await pool.request().query(`
			SELECT [NUMERO] as value, [NOME] as local, [NOME] as label
			FROM [viaweb].[Programação].[dbo].[INSTALACAO]
			ORDER BY [NOME]
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

app.get('/api/users', async (req, res) => {
	try {
		const pool = await connectDatabase();
		
		const result = await pool.request().query(`
			SELECT 
				a.[ID_USUARIO],
				a.[NOME] AS matricula,
				b.[NUMERO] as idIsep,
				c.[nome],
				c.[cargo],
				c.[telefone1],
				c.[telefone2],
				c.[ramal],
				c.[c_custo],
				c.[setor],
				c.[local],
				c.[situacao],
				b.[nome] as unidade
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
				AND b.[numero] is not null
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

app.get('/api/health', (req, res) => {
	res.json({ 
		status: 'ok', 
		timestamp: new Date().toISOString(),
		uptime: process.uptime()
	});
});

app.get('/api/metrics', (req, res) => {
	res.json(metrics.getMetrics());
});

app.use(express.static(__dirname));

setInterval(() => {
	const now = Date.now();
	for (const [key, lock] of eventLocks.entries()) {
		if (now - lock.timestamp >= LOCK_TIMEOUT) {
			eventLocks.delete(key);
			logger.info(`🔓 Lock expirado liberado: ${key}`);
			
			// Notifica clientes
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

const httpServer = app.listen(HTTP_PORT, '0.0.0.0', () => {
	logger.info(`\n🌐 Servidor HTTP rodando em:`);
	logger.info(`   →		http://localhost`);
	logger.info(`   →		http://192.9.100.100`);
	logger.info(`   → Units:		http://192.9.100.100/api/units`);
	logger.info(`   → Users:		http://192.9.100.100/api/users`);
	logger.info(`   → Metrics:	http://192.9.100.100/api/metrics`);
});

const wss = new WebSocket.Server({ host: '0.0.0.0', port: WS_PORT });

logger.info(`🚀 WebSocket Bridge rodando em:`);
logger.info(`   → ws://localhost:${WS_PORT}`);
logger.info(`   → ws://192.9.100.100:${WS_PORT}`);
logger.info(`🔗 Redirecionando para ${TCP_HOST}:${TCP_PORT}\n`);

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;
async function getUserFromDb(isep, idUsuario) {
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
                    ON a. NOME = c.matricula
                WHERE b. NUMERO = @isep
                  AND a.ID_USUARIO = @idUsuario
                  AND LEN(c.nome) > 0
            `);
        
        return result.recordset[0] || null;
    } catch (err) {
        logger.error('❌ Erro ao buscar usuário:  ' + err.message);
        return null;
    }
}

function formatUserName(user) {
    if (!user) return null;
    const nome = user.nome || 'Sem nome';
    const cargo = user.cargo ?  ` (${toTitleCase(user.cargo)})` : '';
    return `${nome}${cargo}`;
}

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
    
    const rawComplement = (op.zonaUsuario !== undefined ?  op.zonaUsuario : op.complemento);
    const hasComplemento = rawComplement !== undefined && rawComplement !== null;
    let zonaUsuario = hasComplemento ? Number(rawComplement) : 0;
    if (Number.isNaN(zonaUsuario)) zonaUsuario = 0;
    
    const part = op.particao || 1;
    const local = op. isep || 'N/A';
    const clientId = op.isep || op.contaCliente || '';
    let ts = op.recepcao || Date.now();
    if (ts < 10000000000) ts *= 1000;
    
    // Códigos de arm/disarm
    const armDisarmCodes = ['1401','1402','1403','1404','1405','1406','1407','1408','3401','3402','3403','3404','3405','3406','3407','3408'];
    const tipos = {
        0: '[Horário Programado]',
        1: '[Monitoramento]',
        2: '[Facilitador]',
        3: '[Senha de Uso Único]',
        4: '[Senha de Uso Único]',
        5: '[Senha de Uso Único]',
        6: '[TI - Manutenção]'
    };
    
    // Monta descrição base
    const isArmDisarm = armDisarmCodes. includes(cod);
    let descricao = null;
    let userName = null;
    let userId = null;
    let userMatricula = null;
    
    if (isArmDisarm) {
        const baseDesc = cod. startsWith('3') ? 'Armado - ' : 'Desarmado - ';
        
        if (tipos[zonaUsuario]) {
            descricao = `${baseDesc}${tipos[zonaUsuario]}`;
        } else if (zonaUsuario > 6) {
            // Busca usuário no banco
            const userData = await getUserFromDb(local, zonaUsuario);
            
            if (userData) {
                userName = formatUserName(userData);
                userId = userData.ID_USUARIO;
                userMatricula = userData.matricula;
                descricao = `${baseDesc}${userName}`;
            } else {
                descricao = `${baseDesc}Usuário ID ${zonaUsuario} Não Cadastrado`;
            }
        }
    }
    
    const event = {
        codigoEvento:  cod,
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
            logger.info(`💾 Evento salvo:  ${cod} | ISEP:  ${local} | ID: ${savedId}`);
        } else {
            logger.debug(`⏭️ Evento duplicado ignorado: ${cod} | ISEP: ${local}`);
        }
        
        sendAckToViaweb(eventId);
        return { success:  true, savedId };
        
    } catch (err) {
        logger.error(`❌ FALHA BD: ${cod} | ISEP: ${local} | ${err.message}`);
        metrics.recordError();
        return { success: false, error:  err.message };
    }
}

function sendAckToViaweb(eventId) {
    if (!eventId) return;

    const ackCommand = ViawebCommands.createAckCommand(eventId);
    const ackPayload = JSON.stringify(ackCommand);
    
    if (globalTcpClient && globalTcpClient.writable) {
        try {
            const encrypted = encrypt(ackPayload, globalKeyBuffer, globalIvSend);
            globalIvSend = encrypted.slice(-16);
            globalTcpClient.write(encrypted);
            logger.info(`✅ ACK enviado: ${eventId}`); // ← INFO para ver nos logs
        } catch (e) {
            logger.error('❌ Erro ao enviar ACK: ' + e.message);
        }
    } else {
        logger.warn('⚠️ TCP não disponível para enviar ACK');
    }
}

wss.on('connection', (ws) => {
	const connTime = new Date().toLocaleTimeString();
	logger.info(`📱 [${connTime}] Cliente WebSocket conectado`);
	metrics.recordConnection();

	let wsIvSend = hexToBuffer(IV);
	let wsIvRecv = hexToBuffer(IV);
	const wsKeyBuffer = hexToBuffer(CHAVE);
	
	ws.isAlive = true;
	ws.on('pong', () => {
		ws.isAlive = true;
	});

	if (!globalTcpClient || globalTcpClient.destroyed) {
		logger.info('🔄 Criando conexão TCP única...');
		globalIvSend = hexToBuffer(IV);
		globalIvRecv = hexToBuffer(IV);
		globalKeyBuffer = hexToBuffer(CHAVE);
		
		globalTcpClient = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
			logger.info('✅ TCP conectado');
			if (!tcpIdentSent) {
				setTimeout(() => {
					const randomNum = Math.floor(Math.random() * 999999) + 1;
					const identCommand = ViawebCommands.createIdentCommand("Viaweb Cotrijal", 1, 60, 0);
					const encrypted = encrypt(JSON.stringify(identCommand), globalKeyBuffer, globalIvSend);
					globalIvSend = encrypted.slice(-16);
					globalTcpClient.write(encrypted);
					tcpIdentSent = true;
					logger.info('✅ IDENT enviado ao servidor Viaweb');
				}, 100);
			}
		});

		globalTcpClient.on('data', async (data) => {
			try {
				// ========== CORREÇÃO: Acumula dados até ter blocos completos ==========
				tcpRecvBuffer = Buffer.concat([tcpRecvBuffer, data]);
				
				// Processa apenas se temos múltiplos de 16 bytes
				const blockSize = 16;
				const completeBlocksLength = Math.floor(tcpRecvBuffer.length / blockSize) * blockSize;
				
				if (completeBlocksLength === 0) {
					logger.debug(`⏳ Buffer acumulando: ${tcpRecvBuffer.length} bytes (aguardando múltiplo de 16)`);
					return; // Aguarda mais dados
				}
				
				// Separa blocos completos do restante
				const dataToDecrypt = tcpRecvBuffer.slice(0, completeBlocksLength);
				tcpRecvBuffer = tcpRecvBuffer.slice(completeBlocksLength);
				
				logger.debug(`🔓 Descriptografando ${dataToDecrypt.length} bytes (${tcpRecvBuffer.length} bytes no buffer)`);
				
				const decrypted = decrypt(dataToDecrypt, globalKeyBuffer, globalIvRecv);
				globalIvRecv = dataToDecrypt.slice(-16);
				
				const jsonStr = decrypted.toString('utf8').replace(/\x00/g, '').trim();
				if (!jsonStr) return;
				
				logger.debug('📥 TCP recebido: ' + jsonStr.substring(0, 200));
				
				let shouldForwardToClients = true;
				
				try {
					const parsed = JSON.parse(jsonStr);
					if (parsed.oper && Array.isArray(parsed.oper)) {
						for (const op of parsed.oper) {
							if (op.acao === 'evento') {
								await saveEventFromTcp(op);
								
								// Verifica se deve enviar para clientes (dedup)
								if (!shouldSendToClients(op)) {
									shouldForwardToClients = false;
								}
							}
						}
					}
				} catch (parseErr) {
					logger.debug('⚠️ Mensagem TCP não é evento parseável: ' + parseErr.message);
				}
				
				// Envia para clientes WebSocket somente se não for duplicado
				if (shouldForwardToClients) {
					wss.clients.forEach(client => {
						if (client.readyState === WebSocket.OPEN) {
							client.send(jsonStr);
						}
					});
				}
				
				metrics.recordEvent();
			} catch (e) {
				logger.error('❌ Erro ao processar TCP: ' + e.message);
				metrics.recordError();
			}
		});

		globalTcpClient.on('error', (err) => {
			logger.error('❌ Erro TCP: ' + err.message);
			metrics.recordError();
		});
		globalTcpClient.on('close', () => {
			logger.warn('🔴 Conexão TCP fechada');
			globalTcpClient = null;
			tcpIdentSent = false;
			tcpRecvBuffer = Buffer.alloc(0); // Limpa buffer ao fechar conexão
		});
	}

	ws.on('message', (data) => {
		try {
			const jsonStr = data.toString();
			logger.debug('📤 WS→TCP: ' + jsonStr.substring(0, 100) + '...');
			metrics.recordCommand();
			if (globalTcpClient && globalTcpClient.writable) {
				const encrypted = encrypt(jsonStr, globalKeyBuffer, globalIvSend);
				globalIvSend = encrypted.slice(-16);
				globalTcpClient.write(encrypted);
				logger.debug('✅ Enviado para TCP');
			} else {
				logger.error('❌ TCP não disponível');
			}
		} catch (e) {
			logger.error('❌ Erro WS→TCP: ' + e.message);
			metrics.recordError();
		}
	});

	ws.on('close', () => {
		logger.info(`🔴 [${new Date().toLocaleTimeString()}] Cliente desconectado`);
		metrics.recordDisconnection();
	});
	ws.on('error', (err) => {
		logger.error('❌ Erro WebSocket: ' + err.message);
		metrics.recordError();
	});
});

const heartbeatInterval = setInterval(() => { // Heartbeat to detect dead connections
	wss.clients.forEach((ws) => {
		if (ws.isAlive === false) {
			logger.warn('💔 Cliente não respondeu ao ping, terminando conexão');
			return ws.terminate();
		}

		ws.isAlive = false;
		ws.ping();
	});
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
	clearInterval(heartbeatInterval);
});

wss.on('error', (err) => {
	logger.error('❌ Erro no servidor WebSocket: ' + err.message);
	metrics.recordError();
});

process.on('SIGINT', async () => {
	logger.info('\n🛑 Encerrando servidor...');
	if (dbPool) {
		await dbPool.close();
		logger.info('✅ Banco de dados fechado');
	}
	if (logsDbPool) {
		await logsDbPool.close();
		logger.info('✅ Banco Logs fechado');
	}
	if (globalTcpClient) {
		globalTcpClient.destroy();
	}
	process.exit(0);
});

logger.info('\n✅ Sistema Viaweb Cotrijal iniciado com sucesso!');
logger.info('📊 Logs em tempo real ativados\n');

/*						DOCUMENTAÇÃO DO server.js
	================================================================================

	📋 ÍNDICE:
		---------
		1. VARIÁVEIS GLOBAIS
		2. FUNÇÕES DE CRIPTOGRAFIA
		3. FUNÇÕES DE BANCO DE DADOS
		4. MIDDLEWARE EXPRESS
		5. AUTENTICAÇÃO
		6. ROTAS API
		7. FUNÇÕES TCP/VIAWEB
		8. HANDLERS WEBSOCKET
		9. INICIALIZAÇÃO


	================================================================================
	1. VARIÁVEIS GLOBAIS

		eventLocks: Map()
			- Armazena locks de eventos sendo atendidos
			- Estrutura: eventKey -> { operador, timestamp }
			- Usado para prevenir atendimentos simultâneos

		wsEventDedupeCache: Map()
			- Cache de deduplicação de eventos no WebSocket
			- Evita enviar eventos duplicados aos clientes
			- TTL: 2 minutos (WS_DEDUPE_TTL)

		globalTcpClient: net.Socket
			- Conexão TCP única compartilhada com servidor Viaweb
			- Reutilizada por todos os clientes WebSocket

		globalKeyBuffer: Buffer
			- Chave AES-256 em formato binário para criptografia
			- Derivada da constante CHAVE (hex)

		globalIvSend: Buffer
			- IV (Initialization Vector) para envio de dados
			- Atualizado a cada criptografia (CBC mode)

		globalIvRecv: Buffer
			- IV para recepção de dados
			- Atualizado a cada descriptografia

		tcpRecvBuffer: Buffer
			- Buffer de acumulação para dados TCP fragmentados
			- Garante blocos completos de 16 bytes antes de descriptografar

		dbPool: mssql.ConnectionPool
			- Pool de conexões para banco ASM (unidades/usuários)

		logsDbPool: mssql.ConnectionPool
			- Pool de conexões para banco Logs (eventos/encerramentos)

		logsRepo: LogsRepository
			- Instância do repositório de logs
			- Gerencia salvamento de eventos e encerramentos


	================================================================================
	2. FUNÇÕES DE CRIPTOGRAFIA

		encrypt(plainText, keyBuffer, ivBuffer): Buffer
			- Criptografa texto usando AES-256-CBC
			- Adiciona padding PKCS7 manualmente
			- Retorna: dados criptografados em Buffer
			- Exemplo: encrypt('{"resp":[{"id":"123"}]}', key, iv)

		decrypt(encryptedBuffer, keyBuffer, ivBuffer): String
			- Descriptografa dados AES-256-CBC
			- Remove padding PKCS7
			- Retorna: string JSON descriptografada
			- Exemplo: decrypt(buffer, key, iv) -> '{"oper":[...]}'

		hexToBuffer(hexString): Buffer
			- Converte string hexadecimal para Buffer binário
			- Usado para converter CHAVE e IV de config
			- Exemplo: hexToBuffer('94EF1C59...') -> Buffer

		formatHex(buffer, maxBytes=128): String
			- Formata Buffer como string hex legível (espaçada)
			- Usado para debug/logging
			- Exemplo: '94 ef 1c 59 21 13 e8 d2 ...'


	================================================================================
	3. FUNÇÕES DE BANCO DE DADOS

		connectDatabase(): Promise<ConnectionPool>
			- Conecta ao banco ASM (unidades/usuários)
			- Singleton: retorna pool existente ou cria novo
			- Usado por: /api/units, /api/users

		connectLogsDatabase(): Promise<ConnectionPool>
			- Conecta ao banco Logs (eventos/encerramentos)
			- Singleton: retorna pool existente ou cria novo
			- Usado por: logsRepo, rotas /api/logs/*

		getUserFromDb(isep, idUsuario): Promise<Object|null>
			- Busca dados de usuário no banco ASM
			- Retorna: { ID_USUARIO, matricula, nome, cargo }
			- Usado por: saveEventFromTcp para enriquecer eventos arm/disarm
			- Exemplo: getUserFromDb('0066', 21) -> { nome: 'João Silva', cargo: 'Fiscal' }

		formatUserName(user): String|null
			- Formata nome de usuário com cargo em Title Case
			- Retorna: "Nome Completo (Cargo Formatado)"
			- Exemplo: formatUserName(userData) -> "João Silva (Fiscal De Caixa)"

		toTitleCase(str): String
			- Converte string para Title Case
			- Exemplo: "fiscal de caixa" -> "Fiscal De Caixa"


	================================================================================
	4. MIDDLEWARE EXPRESS

		express.json({ limit: '10kb' })
			- Parser de JSON para requests
			- Limite de 10KB por segurança

		rateLimiter(req, res, next)
			- Limita requisições por IP
			- 100 requests por minuto por IP
			- Retorna 429 (Too Many Requests) se exceder

		CORS middleware
			- Controla origens permitidas (CORS_WHITELIST)
			- Permite: GET, POST, OPTIONS
			- Headers: Content-Type


	================================================================================
	5. AUTENTICAÇÃO

		escapePw(str): String
			- Escapa aspas simples em senhas
			- Previne SQL injection no PowerShell
			- Exemplo: "pass'word" -> "pass''word"

		authenticateAd(username, password, domain='Cotrijal'): Promise<Boolean>
			- Valida credenciais no Active Directory
			- Usa PowerShell + System.DirectoryServices.AccountManagement
			- Retorna: true se credenciais válidas, false caso contrário
			- Exemplo: authenticateAd('joao.silva', 'senha123') -> true


	================================================================================
	6. ROTAS API

		POST /api/login
			- Autentica usuário no AD
			- Body: { username, password }
			- Retorna: { success: true, user: {...} }

		POST /api/logs/event
			- Salva evento único no banco Logs
			- Body: { codigoEvento, isep, complemento, ... }
			- Retorna: { success: true, eventId: 123 }

		POST /api/logs/close
			- Salva encerramento de evento
			- Notifica todos os clientes WebSocket
			- Body: { event: {...}, closure: {...} }
			- Retorna: { success: true }

		GET /api/logs/events?limit=300
			- Retorna últimos N eventos do banco
			- Usado para hidratar interface após reload
			- Retorna: { success: true, data: [...] }

		POST /api/logs/lock
			- Adquire lock em evento para atendimento
			- Impede atendimentos simultâneos
			- Body: { eventKey, operador }
			- Retorna: { success: true, locked: true, lockedBy: 'Operador' }

		POST /api/logs/unlock
			- Libera lock de evento
			- Body: { eventKey, operador }
			- Retorna: { success: true }

		GET /api/units
			- Lista todas as unidades cadastradas
			- Query: SELECT * FROM INSTALACAO
			- Retorna: { success: true, data: [...] }

		GET /api/users
			- Lista usuários com JOIN de colaboradores
			- Combina dados de Viaweb + ASM
			- Retorna: { success: true, data: [...] }

		GET /api/health
			- Health check do servidor
			- Retorna: { status: 'ok', timestamp, uptime }

		GET /api/metrics
			- Métricas do servidor (se disponível)
			- Retorna: eventos, comandos, conexões, erros


	================================================================================
	7. FUNÇÕES TCP/VIAWEB

		saveEventFromTcp(op): Promise<Object>
			- Processa evento recebido do servidor Viaweb via TCP
			- Enriquece com dados de usuário se for arm/disarm
			- Salva no banco via logsRepo.saveIncomingEvent()
			- Envia ACK de volta ao Viaweb
			- Retorna: { success: true, savedId: 123 } ou { success: false, error: '...' }
			
			Fluxo:
			1. Valida código do evento (1412 = skip)
			2. Normaliza complemento/zona/usuário
			3. Se arm/disarm: busca dados do usuário no BD
			4. Monta objeto event com todos os campos
			5. Salva no banco
			6. Envia ACK
			
			Exemplo de event:
			{
				codigoEvento: '3401',
				complemento: 21,
				particao: 1,
				local: '0066',
				timestamp: 1767883588000,
				descricao: 'Armado - João Silva (Fiscal)',
				userName: 'João Silva (Fiscal)',
				userId: 21,
				userMatricula: '16694'
			}

		sendAckToViaweb(eventId)
			- Envia ACK ao servidor Viaweb
			- Confirma recebimento de evento
			- Remove sufixos '-evento' do ID
			- Usa ViawebCommands.createAckCommand()
			- Criptografa e envia via TCP
			- Exemplo: sendAckToViaweb('4860-evento') -> envia {"resp":[{"id":"4860"}]}

		pruneWsDedupeCache()
			- Remove entradas expiradas do cache de deduplicação WS
			- Roda automaticamente antes de verificar duplicatas
			- Libera memória de eventos antigos

		shouldSendToClients(op): Boolean
			- Verifica se evento já foi enviado aos clientes WS
			- Previne duplicatas usando cache
			- Retorna: true se deve enviar, false se é duplicata
			- Key format: "codigo-isep-complemento-timestamp"


	================================================================================
	8. HANDLERS WEBSOCKET

		wss.on('connection', (ws) => {...})
			- Handler de nova conexão WebSocket
			- Cria conexão TCP com Viaweb se não existir
			- Envia IDENT ao Viaweb
			- Configura IVs individuais por cliente (não usado atualmente)
			
			Sub-handlers:
			
			ws.on('pong')
				- Marca cliente como ativo (heartbeat)
			
			globalTcpClient.on('data')
				- Recebe dados criptografados do Viaweb via TCP
				- Acumula em buffer até ter blocos completos (múltiplos de 16)
				- Descriptografa quando tem blocos completos
				- Processa eventos (saveEventFromTcp)
				- Verifica deduplicação (shouldSendToClients)
				- Encaminha para clientes WebSocket
				
				Fluxo do buffer:
				1. Dados chegam fragmentados: [23 bytes]
				2. Acumula: tcpRecvBuffer = [23 bytes]
				3. Não é múltiplo de 16, aguarda
				4. Mais dados: [16 bytes]
				5. Total: 39 bytes
				6. Processa 32 bytes (2 blocos completos)
				7. Guarda 7 bytes para próxima iteração
			
			globalTcpClient.on('error')
				- Loga erros TCP
				- Registra métrica de erro
			
			globalTcpClient.on('close')
				- Limpa estado ao fechar TCP
				- Reseta tcpRecvBuffer
				- Marca tcpIdentSent = false
			
			ws.on('message')
				- Recebe comando do cliente WebSocket
				- Criptografa e envia ao Viaweb via TCP
				- Usado para: armar, desarmar, consultar status
			
			ws.on('close')
				- Loga desconexão de cliente
				- Registra métrica
			
			ws.on('error')
				- Loga erros WebSocket

		heartbeatInterval
			- Verifica conexões WebSocket a cada 30s
			- Termina conexões que não responderam ao ping
			- Previne conexões "zumbi"


	================================================================================
	9. INICIALIZAÇÃO

		setInterval(lock cleanup, 60s)
			- Libera locks expirados (sem keepalive por 60s)
			- Notifica clientes WS sobre unlock

		app.listen(HTTP_PORT, '0.0.0.0')
			- Inicia servidor HTTP na porta 80
			- Serve arquivos estáticos (HTML/CSS/JS)
			- Expõe rotas API

		wss = new WebSocket.Server({ host: '0.0.0.0', port: WS_PORT })
			- Inicia servidor WebSocket na porta 8090
			- Aceita conexões de clientes
			- Bridge entre clientes e servidor Viaweb TCP

		process.on('SIGINT')
			- Handler de shutdown gracioso (Ctrl+C)
			- Fecha pools de banco
			- Destrói conexão TCP
			- Exit com código 0


	================================================================================
	FLUXO DE UM EVENTO COMPLETO

		1. RECEPÇÃO
		Viaweb TCP → globalTcpClient.on('data')
		
		2. BUFFER
		Acumula em tcpRecvBuffer até ter múltiplos de 16 bytes
		
		3. DESCRIPTOGRAFIA
		decrypt(dataToDecrypt, globalKeyBuffer, globalIvRecv)
		
		4. PARSE
		JSON.parse(decrypted) → { oper: [{ acao: 'evento', ... }] }
		
		5. PROCESSAMENTO
		saveEventFromTcp(op):
			- Busca usuário no BD (se arm/disarm)
			- Enriquece descrição
			- logsRepo.saveIncomingEvent()
			- sendAckToViaweb()
		
		6. DEDUPLICAÇÃO WS
		shouldSendToClients(op) → verifica cache
		
		7. BROADCAST
		wss.clients.forEach() → envia para todos clientes WebSocket
		
		8. FRONTEND
		Cliente recebe evento → processEvent() → updateEventList()


	================================================================================
	DEPENDÊNCIAS

		Módulos Node.js:
		- ws: WebSocket server
		- net: Conexões TCP raw
		- crypto: AES-256-CBC encryption
		- express: Servidor HTTP + API REST
		- mssql: Driver SQL Server
		- child_process: Executar PowerShell (AD auth)

		Módulos locais:
		- ./db-config: Config banco ASM
		- ./logs-db-config: Config banco Logs
		- ./logs-repository: CRUD de eventos/encerramentos
		- ./logger: Winston logger (opcional)
		- ./metrics: Coletor de métricas (opcional)
		- ./viaweb-commands: Comandos protocolo Viaweb


	================================================================================
	VARIÁVEIS DE AMBIENTE / CONSTANTES

		HTTP_PORT: 80
			- Porta do servidor HTTP

		WS_PORT: 8090
			- Porta do servidor WebSocket

		TCP_HOST: '10.0.20.43'
			- IP do servidor Viaweb

		TCP_PORT: 2700
			- Porta do servidor Viaweb

		CHAVE: String (hex)
			- Chave AES-256 para criptografia

		IV: String (hex)
			- IV inicial para AES-CBC

		CORS_WHITELIST: Array
			- Origens permitidas para CORS

		LOCK_TIMEOUT: 60000 (ms)
			- Timeout de lock de eventos

		WS_DEDUPE_TTL: 120000 (ms)
			- TTL do cache de deduplicação WS

		HEARTBEAT_INTERVAL: 30000 (ms)
			- Intervalo de ping aos clientes WS

		RATE_LIMIT_WINDOW: 60000 (ms)
			- Janela de rate limiting

		MAX_REQUESTS_PER_WINDOW: 100
			- Máximo de requests por IP por minuto


	================================================================================
*/