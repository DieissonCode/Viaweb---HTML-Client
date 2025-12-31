// server.js - Servidor unificado (HTTP + API + WebSocket Bridge)
const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');
const express = require('express');
const mssql = require('mssql');
const dbConfig = require('./db-config');

// Configurações
const HTTP_PORT = 80;          // HTTP + API juntos
const WS_PORT = 8090;          // WebSocket Bridge
const TCP_HOST = '10.0.20.43';
const TCP_PORT = 2700;

const CHAVE = '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD';
const IV = '70FC01AA8FCA3900E384EA28A5B7BCEF';

let globalTcpClient = null;
let globalKeyBuffer = null;
let globalIvSend = null;
let globalIvRecv = null;
let tcpIdentSent = false;
let dbPool = null;

// ==================== FUNÇÕES DE CRIPTOGRAFIA ====================
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

// ==================== BANCO DE DADOS ====================
async function connectDatabase() {
    try {
        if (!dbPool) {
            console.log('🔌 Conectando ao banco de dados...');
            dbPool = await mssql.connect(dbConfig);
            console.log('✅ Banco de dados conectado');
        }
        return dbPool;
    } catch (err) {
        console.error('❌ Erro ao conectar ao banco:', err.message);
        throw err;
    }
}

// ==================== SERVIDOR HTTP + API ====================
const app = express();

// CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// API de unidades
app.get('/api/units', async (req, res) => {
    try {
        const pool = await connectDatabase();
        const result = await pool.request().query(`
            SELECT [NUMERO] as value, [NOME] as local, [NOME] as label
            FROM [Programação].[dbo].[INSTALACAO]
            ORDER BY [NOME]
        `);
        
        res.json({
            success: true,
            data: result.recordset
        });
        console.log(`✅ API — Retornadas ${result.recordset.length} unidades`);
    } catch (err) {
        console.error('❌ API — Erro ao buscar unidades:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Arquivos estáticos (HTML, CSS, JS) - DEVE VIR DEPOIS das rotas da API
app.use(express.static(__dirname));

const httpServer = app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n🌐 Servidor HTTP rodando em:`);
    console.log(`   → http://localhost`);
    console.log(`   → http://192.9.100.100`);
    console.log(`   → API: http://192.9.100.100/api/units`);
});

// ==================== WEBSOCKET SERVER (Bridge) ====================
const wss = new WebSocket.Server({ host: '0.0.0.0', port: WS_PORT });

console.log(`🚀 WebSocket Bridge rodando em:`);
console.log(`   → ws://localhost:${WS_PORT}`);
console.log(`   → ws://192.9.100.100:${WS_PORT}`);
console.log(`🔗 Redirecionando para ${TCP_HOST}:${TCP_PORT}\n`);

wss.on('connection', (ws) => {
    const connTime = new Date().toLocaleTimeString();
    console.log(`📱 [${connTime}] Cliente WebSocket conectado`);

    let wsIvSend = hexToBuffer(IV);
    let wsIvRecv = hexToBuffer(IV);
    const wsKeyBuffer = hexToBuffer(CHAVE);

    if (!globalTcpClient || globalTcpClient.destroyed) {
        console.log('🔄 Criando conexão TCP única...');
        globalIvSend = hexToBuffer(IV);
        globalIvRecv = hexToBuffer(IV);
        globalKeyBuffer = hexToBuffer(CHAVE);
        
        globalTcpClient = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
            console.log('✅ TCP conectado');
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
                    console.log('✅ IDENT enviado ao servidor Viaweb');
                }, 100);
            }
        });
        
        globalTcpClient.on('data', (data) => {
            try {
                const decrypted = decrypt(data, globalKeyBuffer, globalIvRecv);
                globalIvRecv = data.slice(-16);
                console.log('📩 TCP→WS:', decrypted.substring(0, 100) + '...');
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(decrypted);
                    }
                });
            } catch (e) {
                console.error('❌ Erro ao descriptografar TCP→WS:', e.message);
            }
        });
        
        globalTcpClient.on('error', (err) => console.error('❌ Erro TCP:', err.message));
        globalTcpClient.on('close', () => {
            console.log('🔴 Conexão TCP fechada');
            globalTcpClient = null;
            tcpIdentSent = false;
        });
    }

    ws.on('message', (data) => {
        try {
            const jsonStr = data.toString();
            console.log('📤 WS→TCP:', jsonStr.substring(0, 100) + '...');
            if (globalTcpClient && globalTcpClient.writable) {
                const encrypted = encrypt(jsonStr, globalKeyBuffer, globalIvSend);
                globalIvSend = encrypted.slice(-16);
                globalTcpClient.write(encrypted);
                console.log('✅ Enviado para TCP');
            } else {
                console.error('❌ TCP não disponível');
            }
        } catch (e) {
            console.error('❌ Erro WS→TCP:', e.message);
        }
    });

    ws.on('close', () => console.log(`🔴 [${new Date().toLocaleTimeString()}] Cliente desconectado`));
    ws.on('error', (err) => console.error('❌ Erro WebSocket:', err.message));
});

wss.on('error', (err) => console.error('❌ Erro no servidor WebSocket:', err.message));

process.on('SIGINT', async () => {
    console.log('\n🛑 Encerrando servidor...');
    if (dbPool) {
        await dbPool.close();
        console.log('✅ Banco de dados fechado');
    }
    if (globalTcpClient) {
        globalTcpClient.destroy();
    }
    process.exit(0);
});

console.log('\n✅ Sistema Viaweb Cotrijal iniciado com sucesso!');
console.log('📊 Logs em tempo real ativados\n');