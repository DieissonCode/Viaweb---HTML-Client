// wsHandler.js – módulo responsável por toda a lógica do WebSocket Bridge
const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');
const logger = require('./logger');
const metrics = require('./metrics');
const ViawebCommands = require('./viaweb-commands');

// Configurações padrão
const DEFAULTS = {
    WS_PORT: 8090,
    WS_HOST: '0.0.0.0',
    TCP_HOST: '10.0.20.43',
    TCP_PORT: 2700,
    CHAVE_HEX: '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD',
    IV_HEX: '70FC01AA8FCA3900E384EA28A5B7BCEF',
    HEARTBEAT_INTERVAL: 30000,   // 30s
    HEARTBEAT_TIMEOUT: 60000,    // 60s sem ping → drop
    RECONNECT_DELAY: 3000,       // 3s entre tentativas
    MAX_RECONNECT_DELAY: 30000   // 30s (exponencial)
};

// Funções de criptografia
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

function hexToBuffer(hex) { return Buffer.from(hex, 'hex'); }

// Helpers de deduplicação
const wsEventDedupeCache = new Map();
const WS_DEDUPE_TTL = 120000; // 2 min

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

/**
 * @param {http.Server} httpServer - servidor HTTP já criado
 * @param {Object} options - sobrescreve valores de DEFAULTS
 */
function setupWebSocketServer(httpServer, options = {}) {
    const cfg = { ...DEFAULTS, ...options };

    // Estado global da ponte TCP
    let tcpClient = null;
    let tcpIdentSent = false;
    let keyBuffer = hexToBuffer(cfg.CHAVE_HEX);
    let ivSend = hexToBuffer(cfg.IV_HEX);
    let ivRecv = hexToBuffer(cfg.IV_HEX);
    let tcpRecvBuf = Buffer.alloc(0);

    // Cria o servidor WebSocket
    const wss = new WebSocket.Server({
        port: cfg.WS_PORT,
        host: cfg.WS_HOST
    });

    logger.info(`WebSocket Bridge running on ws://${cfg.WS_HOST}:${cfg.WS_PORT}`);

    // Heartbeat - detecta clientes "zumbi"
    const heartbeat = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) {
                logger.warn('WebSocket client did not respond to ping - terminating');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, cfg.HEARTBEAT_INTERVAL);

    // Função que garante a existência da conexão TCP
    function ensureTcpConnection() {
        if (tcpClient && !tcpClient.destroyed) return;

        logger.info('Establishing TCP connection to Viaweb...');
        tcpClient = net.createConnection({ host: cfg.TCP_HOST, port: cfg.TCP_PORT }, () => {
            logger.info('TCP connected');
            // Envia IDENT apenas uma vez (ou após reconexão)
            if (!tcpIdentSent) {
                setTimeout(() => {
                    const ident = ViawebCommands.createIdentCommand(
                        "Viaweb Cotrijal", 1, 60, 0
                    );
                    const payload = JSON.stringify(ident);
                    const enc = encrypt(payload, keyBuffer, ivSend);
                    ivSend = enc.slice(-16);
                    tcpClient.write(enc);
                    tcpIdentSent = true;
                    logger.info('IDENT sent to Viaweb server');
                }, 100);
            }
        });

        // Recepção de dados TCP → decrypt → parse → forward WS
        tcpClient.on('data', async (data) => {
            try {
                // Acumula até ter blocos de 16 bytes (AES-CBC)
                tcpRecvBuf = Buffer.concat([tcpRecvBuf, data]);
                const blockSize = 16;
                const fullLen = Math.floor(tcpRecvBuf.length / blockSize) * blockSize;
                if (fullLen === 0) return;

                const toDecrypt = tcpRecvBuf.slice(0, fullLen);
                tcpRecvBuf = tcpRecvBuf.slice(fullLen);

                const plain = decrypt(toDecrypt, keyBuffer, ivRecv);
                ivRecv = toDecrypt.slice(-16);

                const jsonStr = plain.replace(/\x00/g, '').trim();
                if (!jsonStr) return;

                const parsed = JSON.parse(jsonStr);
                // Se for evento, salva no DB e decide se repassa
                if (parsed.oper && Array.isArray(parsed.oper)) {
                    for (const op of parsed.oper) {
                        if (op.acao === 'evento') {
                            if (cfg.onTcpEvent) await cfg.onTcpEvent(op);
                            if (!shouldForwardToClients(op)) continue;
                        }
                    }
                }

                // Broadcast para todos os clientes WS
                wss.clients.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(jsonStr);
                });

                metrics.recordEvent();
            } catch (err) {
                logger.error('Error processing TCP data: ' + err.message);
                metrics.recordError();
            }
        });

        // Tratamento de erros / fechamento da conexão TCP
        tcpClient.on('error', err => {
            logger.error('TCP error: ' + err.message);
            metrics.recordError();
        });
        tcpClient.on('close', () => {
            logger.warn('TCP connection closed - will reconnect');
            tcpClient = null;
            tcpIdentSent = false;
            tcpRecvBuf = Buffer.alloc(0);
            scheduleTcpReconnect();
        });
    }

    // Reconexão automática da camada TCP
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

    // Quando um cliente WS se conecta
    wss.on('connection', ws => {
        logger.info('WebSocket client connected');
        metrics.recordConnection();

        // Flags de heartbeat
        ws.isAlive = true;
        ws.on('pong', () => (ws.isAlive = true));

        // Garante que a camada TCP está ativa
        ensureTcpConnection();

        // Mensagens vindas do cliente WS → encaminha ao TCP (encriptado)
        ws.on('message', async data => {
            try {
                const txt = data.toString();
                const enc = encrypt(txt, keyBuffer, ivSend);
                ivSend = enc.slice(-16);
                if (tcpClient && tcpClient.writable) {
                    tcpClient.write(enc);
                } else {
                    logger.warn('TCP unavailable when sending WS command');
                }
                metrics.recordCommand();
            } catch (e) {
                logger.error('Failed to send WS→TCP: ' + e.message);
                metrics.recordError();
            }
        });

        // Desconexão do cliente WS
        ws.on('close', () => {
            logger.info('WebSocket client disconnected');
            metrics.recordDisconnection();
        });
        ws.on('error', err => {
            logger.error('WS error: ' + err.message);
            metrics.recordError();
        });
    });

    // Limpeza ao encerrar o processo
    wss.on('close', () => {
        clearInterval(heartbeat);
        if (tcpClient) tcpClient.destroy();
        logger.info('WebSocket server closed');
    });

    // Função para enviar ACK para o servidor Viaweb
    function sendAck(eventId) {
        if (!eventId || !tcpClient || !tcpClient.writable) return false;

        try {
            const ackCmd = ViawebCommands.createAckCommand(eventId);
            const payload = JSON.stringify(ackCmd);
            const enc = encrypt(payload, keyBuffer, ivSend);
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
