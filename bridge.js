// Servidor Bridge (atualizado: roda Python server + abre navegador)

const WebSocket = require('ws');
const net = require('net');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const WS_PORT = 8080;
const TCP_HOST = '10.0.20.43';
const TCP_PORT = 2700;

let globalTcpClient = null;
let globalKeyBuffer = null;
let globalIvSend = null;
let globalIvRecv = null;
let tcpIdentSent = false;

const CHAVE = '94EF1C592113E8D27F5BB4C5D278BF3764292CEA895772198BA9435C8E9B97FD';
const IV = '70FC01AA8FCA3900E384EA28A5B7BCEF';

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

// Inicia servidor HTTP simples e abre navegador
function startHttpServerAndOpenBrowser() {
    const projectDir = path.resolve(__dirname);
    const command = `python -m http.server 8000 --directory "${projectDir}"`;
    
    console.log('🌐 Iniciando servidor HTTP local na porta 8000...');
    const serverProcess = exec(command, (error) => {
        if (error) console.error('Erro ao iniciar servidor HTTP:', error);
    });

    serverProcess.stdout.on('data', (data) => console.log(data.trim()));
    serverProcess.stderr.on('data', (data) => console.error(data.trim()));

    // Abre navegador após 1 segundo
    setTimeout(() => {
        const openCommand = process.platform === 'win32' 
            ? `start http://localhost:8000/index.html`
            : process.platform === 'darwin'
            ? 'open http://localhost:8000/index.html'
            : 'xdg-open http://localhost:8000/index.html';
        
        exec(openCommand);
        console.log('🌍 Navegador aberto em http://localhost:8000/index.html');
    }, 1000);
}

const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`🚀 Servidor Bridge iniciado na porta ${WS_PORT}`);
console.log(`🔗 Redirecionando para ${TCP_HOST}:${TCP_PORT}`);
startHttpServerAndOpenBrowser();

wss.on('connection', (ws) => {
    const connTime = new Date().toLocaleTimeString();
    console.log(`\n📱 [${connTime}] Cliente WebSocket conectado`);

    let wsIvSend = hexToBuffer(IV);
    let wsIvRecv = hexToBuffer(IV);
    const wsKeyBuffer = hexToBuffer(CHAVE);

    if (!globalTcpClient || globalTcpClient.destroyed) {
        console.log('🔄 Criando NOVA conexão TCP única');
        globalIvSend = hexToBuffer(IV);
        globalIvRecv = hexToBuffer(IV);
        globalKeyBuffer = hexToBuffer(CHAVE);
        
        globalTcpClient = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
            console.log('✅ TCP ÚNICO conectado');
            if (!tcpIdentSent) {
                setTimeout(async () => {
                    const randomNum = Math.floor(Math.random() * 999999) + 1;
                    const identJson = {
                        "a": randomNum,
                        "oper": [{
                            "id": "ident-1",
                            "acao": "ident",
                            "nome": "Bridge Node.js",
                            "serializado": 1,
                            "retransmite": 60,
                            "limite": 0
                        }]
                    };
                    const encrypted = encrypt(JSON.stringify(identJson), globalKeyBuffer, globalIvSend);
                    globalIvSend = encrypted.slice(-16);
                    globalTcpClient.write(encrypted);
                    tcpIdentSent = true;
                    console.log('✅ IDENT enviado (1x)');
                }, 100);
            }
        });
        
        globalTcpClient.on('data', (data) => {
            try {
                const decrypted = decrypt(data, globalKeyBuffer, globalIvRecv);
                globalIvRecv = data.slice(-16);
                console.log('📩 TCP→WS (JSON):', decrypted);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(decrypted);
                    }
                });
            } catch (e) {
                console.error('❌ Decrypt TCP→WS falhou:', e.message);
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
            console.log('📤 WS→TCP (JSON recebido):', jsonStr);
            if (globalTcpClient && globalTcpClient.writable) {
                const encrypted = encrypt(jsonStr, globalKeyBuffer, globalIvSend);
                globalIvSend = encrypted.slice(-16);
                globalTcpClient.write(encrypted);
                console.log('✅ Enviado para TCP (criptografado)');
            } else {
                console.error('❌ TCP não disponível para envio');
            }
        } catch (e) {
            console.error('❌ Erro WS→TCP:', e.message);
        }
    });

    ws.on('close', () => console.log(`🔴 [${new Date().toLocaleTimeString()}] Cliente WebSocket desconectado`));
    ws.on('error', (err) => console.error('❌ Erro WebSocket:', err.message));
});

wss.on('error', (err) => console.error('❌ Erro no servidor:', err.message));

console.log('\n💡 No HTML, conecte em: ws://localhost:8080');
console.log('🌍 Página aberta automaticamente em http://localhost:8000/index.html');
console.log('📊 Logs detalhados ativados\n');