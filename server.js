// server.js - Servidor unificado (HTTP + API + WebSocket Bridge)
const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');
const express = require('express');
const mssql = require('mssql');
const dbConfig = require('./db-config');

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
    // Add more allowed origins as needed
];

let globalTcpClient = null;
let globalKeyBuffer = null;
let globalIvSend = null;
let globalIvRecv = null;
let tcpIdentSent = false;
let dbPool = null;

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

const app = express();

// Rate limiting middleware (simple implementation)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

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
    
    // Allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin || CORS_WHITELIST.includes(origin) || CORS_WHITELIST.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Apply rate limiting to API routes
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
                SUBSTRING(b.[NUMERO],2,4) as idIsep,
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

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
    res.json(metrics.getMetrics());
});

app.use(express.static(__dirname));

const httpServer = app.listen(HTTP_PORT, '0.0.0.0', () => {
    logger.info(`\n🌐 Servidor HTTP rodando em:`);
    logger.info(`   → http://localhost`);
    logger.info(`   → http://192.9.100.100`);
    logger.info(`   → API: http://192.9.100.100/api/units`);
    logger.info(`   → Metrics: http://192.9.100.100/api/metrics`);
});

const wss = new WebSocket.Server({ host: '0.0.0.0', port: WS_PORT });

logger.info(`🚀 WebSocket Bridge rodando em:`);
logger.info(`   → ws://localhost:${WS_PORT}`);
logger.info(`   → ws://192.9.100.100:${WS_PORT}`);
logger.info(`🔗 Redirecionando para ${TCP_HOST}:${TCP_PORT}\n`);

// WebSocket heartbeat configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds

wss.on('connection', (ws) => {
    const connTime = new Date().toLocaleTimeString();
    logger.info(`📱 [${connTime}] Cliente WebSocket conectado`);
    metrics.recordConnection();

    let wsIvSend = hexToBuffer(IV);
    let wsIvRecv = hexToBuffer(IV);
    const wsKeyBuffer = hexToBuffer(CHAVE);
    
    // Setup heartbeat
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
        
        globalTcpClient.on('data', (data) => {
            try {
                const decrypted = decrypt(data, globalKeyBuffer, globalIvRecv);
                globalIvRecv = data.slice(-16);
                logger.debug('📩 TCP→WS: ' + decrypted.substring(0, 100) + '...');
                metrics.recordEvent();
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(decrypted);
                    }
                });
            } catch (e) {
                logger.error('❌ Erro ao descriptografar TCP→WS: ' + e.message);
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

// Heartbeat to detect dead connections
const heartbeatInterval = setInterval(() => {
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
    if (globalTcpClient) {
        globalTcpClient.destroy();
    }
    process.exit(0);
});

logger.info('\n✅ Sistema Viaweb Cotrijal iniciado com sucesso!');
logger.info('📊 Logs em tempo real ativados\n');