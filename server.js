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

// NOVO: histórico recente para hidratar o front após reload
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
	logger.info(`   →		  http://localhost`);
	logger.info(`   →		  http://192.9.100.100`);
	logger.info(`   → API:	 http://192.9.100.100/api/units`);
	logger.info(`   → Metrics: http://192.9.100.100/api/metrics`);
});

const wss = new WebSocket.Server({ host: '0.0.0.0', port: WS_PORT });

logger.info(`🚀 WebSocket Bridge rodando em:`);
logger.info(`   → ws://localhost:${WS_PORT}`);
logger.info(`   → ws://192.9.100.100:${WS_PORT}`);
logger.info(`🔗 Redirecionando para ${TCP_HOST}:${TCP_PORT}\n`);

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;

async function saveEventFromTcp(op) {
    const cod = op.codigoEvento || 'N/A';
    const eventId = op.id;
    
    if (cod === '1412') {
        sendAckToViaweb(eventId);
        return { success: true, skipped: true };
    }
    
    const rawComplement = (op.zonaUsuario !== undefined ?  op.zonaUsuario : op.complemento);
    const hasComplemento = rawComplement !== undefined && rawComplement !== null;
    let zonaUsuario = hasComplemento ?  Number(rawComplement) : 0;
    if (Number.isNaN(zonaUsuario)) zonaUsuario = 0;
    
    const part = op.particao || 1;
    const local = op.isep || 'N/A';
    const clientId = op.isep || op.contaCliente || '';
    let ts = op.recepcao || Date.now();
    if (ts < 10000000000) ts *= 1000;
    
    const event = {
        codigoEvento: cod,
        codigo:  cod,
        complemento: hasComplemento ? zonaUsuario : 0,
        particao:  part,
        local: local,
        isep: local,
        clientId:  clientId,
        timestamp: ts,
        descricao:  op.descricao || null
    };
    
    // ========== Tenta salvar no banco ==========
    let dbSuccess = false;
    let savedId = null;
    
    try {
        savedId = await logsRepo.saveIncomingEvent(event);
        if (savedId) {
            dbSuccess = true;
            logger.info(`💾 Evento salvo:  ${cod} | ISEP: ${local} | ID: ${savedId}`);
        } else {
            dbSuccess = true; // Duplicado não é erro
            logger.debug(`⏭️ Evento duplicado ignorado: ${cod} | ISEP:  ${local}`);
        }
    } catch (dbErr) {
        dbSuccess = false;
        logger.error(`❌ FALHA ao salvar no banco: ${cod} | ISEP: ${local} | Erro: ${dbErr.message}`);
        metrics.recordError();
    }

    // Opção 2: Só envia ACK se salvou com sucesso (descomente se preferir)
    if (dbSuccess) {
        sendAckToViaweb(eventId);
    } else {
        logger.warn(`⚠️ ACK NÃO enviado (falha no BD): ${eventId}`);
    }

    return { success:  dbSuccess, savedId };
}

function sendAckToViaweb(eventId) {
    if (! eventId) return;
    
    const cleanId = String(eventId).replace(/-(evento|evento-)/g, '').replace(/\D/g, '');
    const ackPayload = JSON.stringify({ resp: [{ id:  cleanId }] });
    
    if (globalTcpClient && globalTcpClient.writable) {
        try {
            const encrypted = encrypt(ackPayload, globalKeyBuffer, globalIvSend);
            globalIvSend = encrypted.slice(-16);
            globalTcpClient. write(encrypted);
            logger.debug(`✅ ACK enviado:  ${cleanId}`);
        } catch (e) {
            logger.error('❌ Erro ao enviar ACK:  ' + e.message);
        }
    } else {
        logger.warn('⚠️ TCP não disponível para enviar ACK');
    }
}

function sendAckToViaweb(eventId) {
    if (! eventId) return;
    const cleanId = String(eventId).replace(/-(evento|evento-)/g, '').replace(/\D/g, '');
    
    const ackPayload = JSON.stringify({ resp: [{ id: cleanId }] });
    
    if (globalTcpClient && globalTcpClient.writable) {
        try {
            const encrypted = encrypt(ackPayload, globalKeyBuffer, globalIvSend);
            globalIvSend = encrypted.slice(-16);
            globalTcpClient. write(encrypted);
            logger.debug(`✅ ACK enviado para Viaweb: ${cleanId}`);
        } catch (e) {
            logger.error('❌ Erro ao enviar ACK:  ' + e.message);
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
					const identJson = {
						"a": randomNum,
						"oper": [{
							"id": "ident-1",
							"acao": "ident",
							"nome": "Viaweb Cotrijal",
							"serializado": 1,
							"retransmite": 60,
							"limite": 0
						}]
					};
					const encrypted = encrypt(JSON.stringify(identJson), globalKeyBuffer, globalIvSend);
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