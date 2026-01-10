// server.js — Unified Server (HTTP + API + WebSocket Bridge)

// ==============================
// Core dependencies
	const WebSocket = require('ws');          // WebSocket server
	const net = require('net');               // TCP client
	const crypto = require('crypto');         // AES encryption
	const express = require('express');       // HTTP/API framework
	const mssql = require('mssql');            // SQL Server driver
	const dbConfig = require('./db-config');   // Main DB config
	const logsDbConfig = require('./logs-db-config'); // Logs DB config
	const { spawn } = require('child_process'); // PowerShell for AD auth
	const { LogsRepository } = require('./logs-repository'); // Logs repository
	const ViawebCommands = require('./viaweb-commands');     // Viaweb protocol helpers

// ==============================
// Event locking & deduplication

	// In-memory event locks: eventKey -> { operator, timestamp }
	const eventLocks = new Map();
	const LOCK_TIMEOUT = 60000; // 60s without keepalive = auto-release

	// WebSocket event deduplication cache
	const wsEventDedupeCache = new Map();
	const WS_DEDUPE_TTL = 120000; // 2 minutes TTL

	// Removes expired entries from WS dedupe cache
	function pruneWsDedupeCache() {
		const now = Date.now();
		for (const [key, data] of wsEventDedupeCache.entries()) {
			if (now - data.ts > WS_DEDUPE_TTL) {
				wsEventDedupeCache.delete(key);
			}
		}
	}

	// Determines whether an event should be forwarded to WS clients
	function shouldSendToClients(op) {
		// Only deduplicate events
		if (op.acao !== 'evento') return true;

		pruneWsDedupeCache();

		const cod = op.codigoEvento || '';
		const isep = op.isep || '';
		const complemento = op.zonaUsuario ?? op.complemento ?? 0;
		const ts = op.recepcao || Date.now();

		// Unique key based on event identity + timestamp
		const key = `${cod}-${isep}-${complemento}-${ts}`;

		if (wsEventDedupeCache.has(key)) {
			return false; // Already sent to clients
		}

		wsEventDedupeCache.set(key, { ts: Date.now() });
		return true;
	}

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
			recordEvent: () => {},
			recordCommand: () => {},
			recordError: () => {},
			recordConnection: () => {},
			recordDisconnection: () => {},
			getMetrics: () => ({ error: 'Metrics module not available' })
		};
	}

// ==============================
// Server configuration
	const HTTP_PORT = 80;      // HTTP API port
	const WS_PORT = 8090;      // WebSocket port
	const TCP_HOST = '10.0.20.43'; // Viaweb TCP host
	const TCP_PORT = 2700;         // Viaweb TCP port

	// AES-256-CBC static key/IV (protocol requirement)
	const CHAVE = '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD';
	const IV    = '70FC01AA8FCA3900E384EA28A5B7BCEF';

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

	let globalTcpClient = null; // Single shared TCP connection
	let globalKeyBuffer = null; // AES key buffer
	let globalIvSend = null;    // AES IV for sending
	let globalIvRecv = null;    // AES IV for receiving
	let tcpIdentSent = false;   // IDENT command sent flag

	let dbPool = null;          // Main (ASM) DB pool
	let logsDbPool = null;      // Logs DB pool

	// Logs repository (lazy DB connection)
	const logsRepo = new LogsRepository(connectLogsDatabase);

	// TCP receive buffer (used to align AES 16-byte blocks)
	let tcpRecvBuffer = Buffer.alloc(0);

// ==============================
// Cryptography helpers

	// Encrypts plaintext using AES-256-CBC with manual PKCS#7 padding
	function encrypt(plainText, keyBuffer, ivBuffer) {
		const plainBytes = Buffer.from(plainText, 'utf8');
		const blockSize = 16;

		// Manual padding to block size
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

	// Decrypts AES-256-CBC buffer and removes manual padding
	function decrypt(encryptedBuffer, keyBuffer, ivBuffer) {
		const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
		decipher.setAutoPadding(false);

		let decrypted = decipher.update(encryptedBuffer);
		decrypted = Buffer.concat([decrypted, decipher.final()]);

		const padLen = decrypted[decrypted.length - 1];
		const unpaddedData = decrypted.slice(0, -padLen);
		return unpaddedData.toString('utf8');
	}

	// Converts hex string to Buffer
	function hexToBuffer(hexString) {
		return Buffer.from(hexString, 'hex');
	}

	// Formats a buffer as spaced hex string (for debug logs)
	function formatHex(buffer, maxBytes = 128) {
		if (!buffer) return '';
		const slice = buffer.slice(0, maxBytes);
		return slice.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
	}

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
				await logsRepo.saveEventAndClosure(event, closure);
				
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
				return res.status(500).json({
					success: false,
					error: 'Falha ao salvar encerramento'
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
						[NUMERO] AS value,
						[NOME]   AS local,
						[NOME]   AS label
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
	// Static file hosting (frontend assets)
		const path = require('path');
		app.use(express.static(path.join(__dirname, '..')));


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
			logger.info(`\n🌐 Servidor HTTP rodando em:`);
			logger.info(`   →		http://localhost`);
			logger.info(`   →		http://192.9.100.100`);
			logger.info(`   → Units:		http://192.9.100.100/api/units`);
			logger.info(`   → Users:		http://192.9.100.100/api/users`);
			logger.info(`   → Metrics:	http://192.9.100.100/api/metrics`);
		});

	// ==============================
	// WebSocket server bootstrap (bridge layer)
		const wss = new WebSocket.Server({
			host: '0.0.0.0',
			port: WS_PORT
		});

		logger.info(`🚀 WebSocket Bridge rodando em:`);
		logger.info(`   → ws://localhost:${WS_PORT}`);
		logger.info(`   → ws://192.9.100.100:${WS_PORT}`);
		logger.info(`🔗 Redirecionando para ${TCP_HOST}:${TCP_PORT}\n`);

	// ==============================
	// WebSocket heartbeat configuration
		const HEARTBEAT_INTERVAL = 30000; // Ping interval
		const HEARTBEAT_TIMEOUT  = 60000; // Max silence before drop

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
			
			const nome  = user.nome || 'Sem nome';
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

	// ==============================
	// Processing events received via TCP
	// Responsible for normalizing data, enriching description,
	// persisting into logs database and sending ACK to Viaweb
			async function saveEventFromTcp(op) {

				// Event code received (defensive fallback)
				const cod = op.codigoEvento || 'N/A';

				// Event ID (used for TCP ACK)
				const eventId = op.id;

				// Special event: only acknowledge (ACK) and skip persistence
				if (cod === '1412') {
					sendAckToViaweb(eventId);
					return { success: true, skipped: true };
				}

				// Complement may arrive in different fields depending on event type
				const rawComplement = (op.zonaUsuario !== undefined ? op.zonaUsuario : op.complemento);
				const hasComplemento = rawComplement !== undefined && rawComplement !== null;

				// Normalize user zone to a valid integer
				let zonaUsuario = hasComplemento ? Number(rawComplement) : 0;
				if (Number.isNaN(zonaUsuario)) zonaUsuario = 0;

				// Event partition (default = 1)
				const part = op.particao || 1;

				// Installation identifier (ISEP)
				const local = op.isep || 'N/A';

				// Client ID (fallback across possible fields)
				const clientId = op.isep || op.contaCliente || '';

				// Event timestamp (normalize to milliseconds)
				let ts = op.recepcao || Date.now();
				if (ts < 10000000000) ts *= 1000;

				// ==============================
				// Arm / Disarm event codes
				const armDisarmCodes = [
					'1401','1402','1403','1404','1405','1406','1407','1408',
					'3401','3402','3403','3404','3405','3406','3407','3408'
				];

				// Known activation types
				const tipos = {
					0: '[Horário Programado]',
					1: '[Monitoramento]',
					2: '[Facilitador]',
					3: '[Senha Única]',
					4: '[Senha Única]',
					5: '[Senha Única]',
					6: '[TI - Manutenção]'
				};

				// ==============================
				// Event description assembly
				const isArmDisarm = armDisarmCodes.includes(cod);

				let descricao = null;
				let userName = null;
				let userId = null;
				let userMatricula = null;

				if (isArmDisarm) {

					// Define prefix based on event type
					const baseDesc = cod.startsWith('3')
						? 'Armado - '
						: 'Desarmado - ';

					// Known type (fixed mapping)
					if (tipos[zonaUsuario]) {
						descricao = `${baseDesc}${tipos[zonaUsuario]}`;

					// Zone > 6 indicates registered user
					} else if (zonaUsuario > 6) {

						// Fetch user data from main database
						const userData = await getUserFromDb(local, zonaUsuario);

						if (userData) {
							userName = formatUserName(userData);
							userId = userData.ID_USUARIO;
							userMatricula = userData.matricula;
							descricao = `${baseDesc}${userName}`;
						} else {
							descricao = `${baseDesc}User ID ${zonaUsuario} Not Registered`;
						}
					}
				}

				// ==============================
				// Final event structure to be persisted
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

				// ==============================
				// Logs database persistence
				try {
					const savedId = await logsRepo.saveIncomingEvent(event);

					if (savedId) {
						logger.info(`💾 Event saved: ${cod} | ISEP: ${local} | ID: ${savedId}`);
					} else {
						logger.debug(`⏭️ Duplicate event ignored: ${cod} | ISEP: ${local}`);
					}

					// Send ACK after persistence
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
				const ackPayload = JSON.stringify(ackCommand);

				// Check TCP availability
				if (globalTcpClient && globalTcpClient.writable) {
					try {
						// Encrypt payload
						const encrypted = encrypt(ackPayload, globalKeyBuffer, globalIvSend);

						// Update send IV
						globalIvSend = encrypted.slice(-16);

						// Send to TCP server
						globalTcpClient.write(encrypted);

						logger.info(`✅ ACK sent: ${eventId}`);
					} catch (e) {
						logger.error('❌ Error sending ACK: ' + e.message);
					}
				} else {
					logger.warn('⚠️ TCP not available to send ACK');
				}
			}
	// ==============================
	// Processing events received via TCP
	// Responsible for normalizing data, enriching description,
	// persisting into logs database and sending ACK to Viaweb
			async function saveEventFromTcp(op) {

				// Event code received (defensive fallback)
				const cod = op.codigoEvento || 'N/A';

				// Event ID (used for TCP ACK)
				const eventId = op.id;

				// Special event: only acknowledge (ACK) and skip persistence
				if (cod === '1412') {
					sendAckToViaweb(eventId);
					return { success: true, skipped: true };
				}

				// Complement may arrive in different fields depending on event type
				const rawComplement = (op.zonaUsuario !== undefined ? op.zonaUsuario : op.complemento);
				const hasComplemento = rawComplement !== undefined && rawComplement !== null;

				// Normalize user zone to a valid integer
				let zonaUsuario = hasComplemento ? Number(rawComplement) : 0;
				if (Number.isNaN(zonaUsuario)) zonaUsuario = 0;

				// Event partition (default = 1)
				const part = op.particao || 1;

				// Installation identifier (ISEP)
				const local = op.isep || 'N/A';

				// Client ID (fallback across possible fields)
				const clientId = op.isep || op.contaCliente || '';

				// Event timestamp (normalize to milliseconds)
				let ts = op.recepcao || Date.now();
				if (ts < 10000000000) ts *= 1000;

				// ==============================
				// Arm / Disarm event codes
				const armDisarmCodes = [
					'1401','1402','1403','1404','1405','1406','1407','1408',
					'3401','3402','3403','3404','3405','3406','3407','3408'
				];

				// Known activation types
				const tipos = {
					0: '[Horário Programado]',
					1: '[Monitoramento]',
					2: '[Facilitador]',
					3: '[Senha Única]',
					4: '[Senha Única]',
					5: '[Senha Única]',
					6: '[TI - Manutenção]'
				};

				// ==============================
				// Event description assembly
				const isArmDisarm = armDisarmCodes.includes(cod);

				let descricao = null;
				let userName = null;
				let userId = null;
				let userMatricula = null;

				if (isArmDisarm) {

					// Define prefix based on event type
					const baseDesc = cod.startsWith('3')
						? 'Armado - '
						: 'Desarmado - ';

					// Known type (fixed mapping)
					if (tipos[zonaUsuario]) {
						descricao = `${baseDesc}${tipos[zonaUsuario]}`;

					// Zone > 6 indicates registered user
					} else if (zonaUsuario > 6) {

						// Fetch user data from main database
						const userData = await getUserFromDb(local, zonaUsuario);

						if (userData) {
							userName = formatUserName(userData);
							userId = userData.ID_USUARIO;
							userMatricula = userData.matricula;
							descricao = `${baseDesc}${userName}`;
						} else {
							descricao = `${baseDesc}User ID ${zonaUsuario} Not Registered`;
						}
					}
				}

				// ==============================
				// Final event structure to be persisted
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

				// ==============================
				// Logs database persistence
				try {
					const savedId = await logsRepo.saveIncomingEvent(event);

					if (savedId) {
						logger.info(`💾 Event saved: ${cod} | ISEP: ${local} | ID: ${savedId}`);
					} else {
						logger.debug(`⏭️ Duplicate event ignored: ${cod} | ISEP: ${local}`);
					}

					// Send ACK after persistence
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
				const ackPayload = JSON.stringify(ackCommand);

				// Check TCP availability
				if (globalTcpClient && globalTcpClient.writable) {
					try {
						// Encrypt payload
						const encrypted = encrypt(ackPayload, globalKeyBuffer, globalIvSend);

						// Update send IV
						globalIvSend = encrypted.slice(-16);

						// Send to TCP server
						globalTcpClient.write(encrypted);

						logger.info(`✅ ACK sent: ${eventId}`);
					} catch (e) {
						logger.error('❌ Error sending ACK: ' + e.message);
					}
				} else {
					logger.warn('⚠️ TCP not available to send ACK');
				}
			}

// =====================================================
// WebSocket server: client connection management
	// WebSocket connection handler
		wss.on('connection', (ws) => {
			const connTime = new Date().toLocaleTimeString();
			logger.info(`📱 WebSocket client connected`);
			metrics.recordConnection();

			// Per-client IVs and key (reserved for future use if needed)
				let wsIvSend = hexToBuffer(IV);
				let wsIvRecv = hexToBuffer(IV);
				const wsKeyBuffer = hexToBuffer(CHAVE);

			// Heartbeat flag
				ws.isAlive = true;

			// Pong response handler (heartbeat)
				ws.on('pong', () => {
					ws.isAlive = true;
				});

			// Global TCP connection creation (singleton)
				if (!globalTcpClient || globalTcpClient.destroyed) {
					logger.info('🔄 Creating single TCP connection...');

					// Reinitialize global IVs and key
					globalIvSend = hexToBuffer(IV);
					globalIvRecv = hexToBuffer(IV);
					globalKeyBuffer = hexToBuffer(CHAVE);

					// Connect to Viaweb TCP server
					globalTcpClient = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
						logger.info('✅ TCP connected');

						// Send IDENT only once
						if (!tcpIdentSent) {
							setTimeout(() => {
								const randomNum = Math.floor(Math.random() * 999999) + 1;

								// Build IDENT command
								const identCommand = ViawebCommands.createIdentCommand(
									"Viaweb Cotrijal",
									1,
									60,
									0
								);

								// Encrypt command
								const encrypted = encrypt(
									JSON.stringify(identCommand),
									globalKeyBuffer,
									globalIvSend
								);

								// Update IV with last block
								globalIvSend = encrypted.slice(-16);

								// Send to TCP
								globalTcpClient.write(encrypted);
								tcpIdentSent = true;

								logger.info('✅ IDENT sent to Viaweb server');
							}, 100);
						}
					});

					// =================================================
					// TCP data reception
					// =================================================
					globalTcpClient.on('data', async (data) => {
						try {
							// Accumulate received data into buffer
							tcpRecvBuffer = Buffer.concat([tcpRecvBuffer, data]);

							// AES operates on 16-byte blocks
							const blockSize = 16;
							const completeBlocksLength =
								Math.floor(tcpRecvBuffer.length / blockSize) * blockSize;

							// Wait until full blocks are available
							if (completeBlocksLength === 0) {
								logger.debug(
									`⏳ Buffer accumulating: ${tcpRecvBuffer.length} bytes (waiting for multiple of 16)`
								);
								return;
							}

							// Split decryptable portion
							const dataToDecrypt = tcpRecvBuffer.slice(0, completeBlocksLength);
							tcpRecvBuffer = tcpRecvBuffer.slice(completeBlocksLength);

							logger.debug(
								`🔓 Decrypting ${dataToDecrypt.length} bytes (${tcpRecvBuffer.length} bytes remaining in buffer)`
							);

							// Decrypt payload
							const decrypted = decrypt(
								dataToDecrypt,
								globalKeyBuffer,
								globalIvRecv
							);

							// Update IV with last received block
							globalIvRecv = dataToDecrypt.slice(-16);

							// Normalize JSON string
							const jsonStr = decrypted
								.toString('utf8')
								.replace(/\x00/g, '')
								.trim();

							if (!jsonStr) return;

							logger.debug('📥 TCP received: ' + jsonStr.substring(0, 200));

							let shouldForwardToClients = true;

							// Attempt to parse JSON and handle events
							try {
								const parsed = JSON.parse(jsonStr);

								if (parsed.oper && Array.isArray(parsed.oper)) {
									for (const op of parsed.oper) {
										if (op.acao === 'evento') {
											// Persist event into database
											await saveEventFromTcp(op);

											// Deduplication check
											if (!shouldSendToClients(op)) {
												shouldForwardToClients = false;
											}
										}
									}
								}
							} catch (parseErr) {
								logger.debug(
									'⚠️ TCP message is not a parseable event: ' + parseErr.message
								);
							}

							// Forward to WS clients only if allowed
							if (shouldForwardToClients) {
								wss.clients.forEach(client => {
									if (client.readyState === WebSocket.OPEN) {
										client.send(jsonStr);
									}
								});
							}

							metrics.recordEvent();
						} catch (e) {
							logger.error('❌ Error processing TCP: ' + e.message);
							metrics.recordError();
						}
					});

					// TCP error handler
					globalTcpClient.on('error', (err) => {
						logger.error('❌ TCP error: ' + err.message);
						metrics.recordError();
					});

					// TCP close handler
					globalTcpClient.on('close', () => {
						logger.warn('🔴 TCP connection closed');
						globalTcpClient = null;
						tcpIdentSent = false;
						tcpRecvBuffer = Buffer.alloc(0);
					});
				}

			// WebSocket client → TCP messages
				ws.on('message', (data) => {
					try {
						const jsonStr = data.toString();
						logger.debug('📤 WS→TCP: ' + jsonStr.substring(0, 100) + '...');
						metrics.recordCommand();

						if (globalTcpClient && globalTcpClient.writable) {
							const encrypted = encrypt(
								jsonStr,
								globalKeyBuffer,
								globalIvSend
							);

							// Update IV
							globalIvSend = encrypted.slice(-16);

							// Send to TCP
							globalTcpClient.write(encrypted);
							logger.debug('✅ Sent to TCP');
						} else {
							logger.error('❌ TCP not available');
						}
					} catch (e) {
						logger.error('❌ WS→TCP error: ' + e.message);
						metrics.recordError();
					}
				});

			// Client disconnected
				ws.on('close', () => {
					logger.info(`🔴 [${new Date().toLocaleTimeString()}] Client disconnected`);
					metrics.recordDisconnection();
				});

			// WebSocket client error
				ws.on('error', (err) => {
					logger.error('❌ WebSocket error: ' + err.message);
					metrics.recordError();
				});
		});
	// WebSocket server shutdown
		wss.on('close', () => {
			clearInterval(heartbeatInterval);
		});

	// Global WebSocket server error
		wss.on('error', (err) => {
			logger.error('❌ WebSocket server error: ' + err.message);
			metrics.recordError();
		});

// =====================================================
// Heartbeat: dead connection detection
	const heartbeatInterval = setInterval(() => {
		wss.clients.forEach((ws) => {
			if (ws.isAlive === false) {
				logger.warn('💔 Client did not respond to ping, terminating connection');
				return ws.terminate();
			}

			ws.isAlive = false;
			ws.ping();
		});
	}, HEARTBEAT_INTERVAL);

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

		if (globalTcpClient) {
			globalTcpClient.destroy();
		}

		process.exit(0);
	});
// =====================================================
// Initialization completed
	logger.info('\n✅ Viaweb Cotrijal system successfully started!');
	logger.info('📊 Real-time logs enabled\n');
// =====================================================
// End of server.js
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