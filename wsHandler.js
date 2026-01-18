// wsHandler.js – módulo responsável por toda a lógica do WebSocket Bridge
const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');
const logger = require('./logger');
const metrics = require('./metrics');
const ViawebCommands = require('./viaweb-commands');
const logsRepo = require('./logsRepository');

/* ============================
   DEBUG GLOBAL (liga/desliga)
   ============================ */
const VIAWEB_DEBUG = process.env.VIAWEB_DEBUG === '1';

function dbg(...args) {
    if (VIAWEB_DEBUG) logger.debug('[VIAWEB-DEBUG]', ...args);
}

function bufHex(buf, max = 160) {
    if (!Buffer.isBuffer(buf)) return '';
    const h = buf.toString('hex');
    return h.length > max ? h.slice(0, max) + '…' : h;
}

/* ============================
   Configurações padrão
   ============================ */
const DEFAULTS = {
    WS_PORT: 8090,
    WS_HOST: '0.0.0.0',
    TCP_HOST: '10.0.20.43',
    TCP_PORT: 2700,
    CHAVE_HEX: '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD',
    IV_HEX: '70FC01AA8FCA3900E384EA28A5B7BCEF',
    HEARTBEAT_INTERVAL: 30000,
    HEARTBEAT_TIMEOUT: 60000,
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_DELAY: 30000
};

/* ============================
   Criptografia AES-256-CBC
   ============================ */
function encrypt(plainText, keyBuffer, ivBuffer) {
    const plainBytes = Buffer.from(plainText, 'utf8');
    const blockSize = 16;
    const padLen = blockSize - (plainBytes.length % blockSize);
    const padded = Buffer.alloc(plainBytes.length + padLen);
    plainBytes.copy(padded);
    padded.fill(padLen, plainBytes.length);

    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    cipher.setAutoPadding(false);

    let encrypted = cipher.update(padded);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted;
}

function decrypt(encryptedBuffer, keyBuffer, ivBuffer) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    decipher.setAutoPadding(false);

    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const padLen = decrypted[decrypted.length - 1];
    return decrypted.slice(0, -padLen).toString('utf8');
}

function hexToBuffer(hex) {
    return Buffer.from(hex, 'hex');
}

/* ============================
   Deduplicação WS (ORIGINAL)
   ============================ */
const wsEventDedupeCache = new Map();
const WS_DEDUPE_TTL = 120000;

function pruneWsDedupeCache() {
    const now = Date.now();
    for (const [k, v] of wsEventDedupeCache.entries()) {
        if (now - v.ts > WS_DEDUPE_TTL) wsEventDedupeCache.delete(k);
    }
}

function shouldForwardToClients(op) {
    if (op.acao !== 'evento') return true;
    pruneWsDedupeCache();
    const key = `${op.codigoEvento||''}-${op.isep||''}-${op.zonaUsuario ?? op.complemento ?? 0}-${op.recepcao||Date.now()}`;
    if (wsEventDedupeCache.has(key)) return false;
    wsEventDedupeCache.set(key, { ts: Date.now() });
    return true;
}

/* ============================
   WebSocket Server
   ============================ */
function setupWebSocketServer(httpServer, options = {}) {
    const cfg = { ...DEFAULTS, ...options };

    let tcpClient = null;
    let tcpIdentSent = false;
    let tcpReady = false;

    let keyBuffer = hexToBuffer(cfg.CHAVE_HEX);
    let ivSend = hexToBuffer(cfg.IV_HEX);
    let ivRecv = hexToBuffer(cfg.IV_HEX);
    let tcpRecvBuf = Buffer.alloc(0);

    const wss = new WebSocket.Server({
        port: cfg.WS_PORT,
        host: cfg.WS_HOST
    });

    logger.info(`WebSocket Bridge running on ws://${cfg.WS_HOST}:${cfg.WS_PORT}`);

    /* ============================
       Heartbeat
       ============================ */
    const heartbeat = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) {
                logger.warn('WebSocket client did not respond to ping');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, cfg.HEARTBEAT_INTERVAL);

    /* ============================
       TCP Connection
       ============================ */
    function ensureTcpConnection() {
        if (tcpClient && !tcpClient.destroyed) return;

        logger.info('Establishing TCP connection to Viaweb...');
        tcpClient = net.createConnection(
            { host: cfg.TCP_HOST, port: cfg.TCP_PORT },
            () => {
                logger.info('TCP connected');

                ivSend = hexToBuffer(cfg.IV_HEX);
                ivRecv = hexToBuffer(cfg.IV_HEX);
                tcpRecvBuf = Buffer.alloc(0);
                tcpIdentSent = false;
                tcpReady = false;

                setTimeout(() => {
                    const ident = ViawebCommands.createIdentCommand(
                        'Viaweb Cotrijal', 1, 60, 0
                    );

                    const payload = JSON.stringify(ident);
                    dbg('IDENT PLAIN:', payload);

                    const enc = encrypt(payload, keyBuffer, ivSend);
                    dbg('IDENT ENCRYPTED HEX:', bufHex(enc));

                    ivSend = enc.slice(-16);
                    tcpClient.write(enc);

                    tcpIdentSent = true;
                    logger.info('IDENT sent to Viaweb server');
                }, 100);
            }
        );

        tcpClient.on('data', async data => {
            try {
                tcpRecvBuf = Buffer.concat([tcpRecvBuf, data]);

                const blockSize = 16;
                const fullLen = Math.floor(tcpRecvBuf.length / blockSize) * blockSize;
                if (fullLen === 0) return;

                const toDecrypt = tcpRecvBuf.slice(0, fullLen);
                tcpRecvBuf = tcpRecvBuf.slice(fullLen);

                dbg('TCP RAW HEX:', bufHex(toDecrypt));

                const plain = decrypt(toDecrypt, keyBuffer, ivRecv);
                dbg('TCP DECRYPTED RAW:', plain);

                ivRecv = toDecrypt.slice(-16);

                const jsonStr = plain.replace(/\x00/g, '').trim();
                if (!jsonStr) return;

                dbg('TCP JSON CLEAN:', jsonStr);

                // ✅ NOVO: Trata múltiplos JSONs separados por \u0001
                const jsonParts = jsonStr.split('\u0001').filter(s => s.trim());
                
                for (const part of jsonParts) {
                    try {
                        const parsed = JSON.parse(part);
                        
                        if (parsed?.resp && !tcpReady) {
                            tcpReady = true;
                            logger.info('IDENT confirmed – TCP session READY');
                        }

                        if (parsed.oper && Array.isArray(parsed.oper)) {
                            for (const op of parsed.oper) {
                                if (op.acao === 'evento') {
                                    if (cfg.onTcpEvent) await cfg.onTcpEvent(op);
                                    sendAck(op.id);
                                    if (!shouldForwardToClients(op)) continue;
                                }
                            }
                        }

                        wss.clients.forEach(ws => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(part);
                            }
                        });

                        metrics.recordEvent();
                        
                    } catch (parseErr) {
                        logger.warn('Failed to parse JSON part: ' + parseErr.message);
                        dbg('FAILED JSON:', part);
                    }
                }

            } catch (err) {
                logger.error('TCP processing error: ' + err.message);
                dbg('TCP ERROR CONTEXT:', {
                    bufferLength: tcpRecvBuf.length,
                    errorStack: err.stack
                });
                metrics.recordError();
                
                // ✅ Em caso de erro grave, limpa buffer para evitar loop
                if (err.message.includes('JSON') || err.message.includes('decrypt')) {
                    logger.warn('Clearing TCP buffer due to parse error');
                    tcpRecvBuf = Buffer.alloc(0);
                }
            }
        });

        tcpClient.on('error', err => {
            logger.error('TCP error: ' + err.message);
            metrics.recordError();
        });

        tcpClient.on('close', () => {
            logger.warn('TCP connection closed - will reconnect');
            tcpClient = null;
            tcpIdentSent = false;
            tcpReady = false;
            tcpRecvBuf = Buffer.alloc(0);
            scheduleTcpReconnect();
        });
    }

    /* ============================
       TCP Reconnect
       ============================ */
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    function scheduleTcpReconnect() {
        if (reconnectTimer) return;
        const delay = Math.min(
            cfg.RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
            cfg.MAX_RECONNECT_DELAY
        );
        reconnectTimer = setTimeout(() => {
            reconnectAttempts++;
            reconnectTimer = null;
            ensureTcpConnection();
        }, delay);
    }

    /* ============================
       WS CLIENT CONNECT
       ============================ */
    wss.on('connection', ws => {
        logger.info('WebSocket client connected');
        metrics.recordConnection();

        ws.isAlive = true;
        ws.on('pong', () => (ws.isAlive = true));

        ensureTcpConnection();

        ws.on('message', async data => {
            if (!tcpReady) {
                dbg('WS BLOCKED (IDENT not confirmed):', data.toString());
                return;
            }

            try {
                const txt = data.toString();
                dbg('WS PLAIN:', txt);

                const enc = encrypt(txt, keyBuffer, ivSend);
                dbg('WS ENCRYPTED HEX:', bufHex(enc));

                ivSend = enc.slice(-16);

                if (tcpClient && tcpClient.writable) {
                    tcpClient.write(enc);
                } else {
                    logger.warn('TCP unavailable when sending WS command');
                }

                metrics.recordCommand();
            } catch (e) {
                logger.error('WS→TCP error: ' + e.message);
                metrics.recordError();
            }
        });

        ws.on('close', () => {
            logger.info('WebSocket client disconnected');
            metrics.recordDisconnection();
        });

        ws.on('error', err => {
            logger.error('WS error: ' + err.message);
            metrics.recordError();
        });
    });

    wss.on('close', () => {
        clearInterval(heartbeat);
        if (tcpClient) tcpClient.destroy();
        logger.info('WebSocket server closed');
    });

    /* ============================
       ACK (RESTAURADO)
       ============================ */
    function sendAck(eventId) {
        if (!eventId || !tcpClient || !tcpClient.writable || !tcpReady) return false;

        try {
            const ackCmd = ViawebCommands.createAckCommand(eventId);
            const payload = JSON.stringify(ackCmd);

            dbg('ACK PLAIN:', payload);

            const enc = encrypt(payload, keyBuffer, ivSend);
            dbg('ACK ENCRYPTED HEX:', bufHex(enc));

            ivSend = enc.slice(-16);
            tcpClient.write(enc);

            logger.info(`ACK sent: ${eventId}`);
            return true;
        } catch (e) {
            logger.error('Error sending ACK: ' + e.message);
            return false;
        }
    }

    return {
        wss,
        getTcpClient: () => tcpClient,
        sendAck
    };
}

module.exports = { setupWebSocketServer };
