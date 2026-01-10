# VIAWEB COTRIJAL

> Plataforma de monitoramento e controle de equipamentos de segurança conectados à rede Viaweb

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![SQL Server](https://img.shields.io/badge/SQL%20Server-%3E%3D2016-red)](https://www.microsoft.com/sql-server)

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Arquitetura](#-arquitetura)
- [Funcionalidades](#-funcionalidades)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Operações Suportadas](#-operações-suportadas)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Criptografia](#-criptografia)
- [Troubleshooting](#-troubleshooting)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)

---

## 🎯 Visão Geral

**Viaweb Cotrijal** é uma plataforma web que atua como intermediário entre interfaces de usuário (navegadores) e o sistema Viaweb Receiver, permitindo monitoramento e controle em tempo real de equipamentos de segurança (alarmes, sensores, partições).

### O que faz?

- ✅ Armamento/desarmamento de partições
- ✅ Leitura de status de zonas e partições
- ✅ Recepção e processamento de eventos em tempo real
- ✅ Criptografia AES-256-CBC em todas comunicações TCP
- ✅ Persistência de eventos em banco de dados
- ✅ API REST para integração externa
- ✅ WebSocket para comunicação bidirecional

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                      NAVEGADOR WEB                              │
│                   (Frontend HTML5 + JS)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
┌────────▼────────┐            ┌────────▼──────────┐
│   WebSocket     │            │    REST API       │
│  (porta 8090)   │            │  (porta 3000)     │
└────────┬────────┘            └────────┬──────────┘
         │                               │
         └───────────────┬───────────────┘
                         │
         ┌───────────────▼───────────────┐
         │       SERVER.JS (Node.js)     │
         │  - Gerenciador de conexões    │
         │  - Criptografia AES-256-CBC   │
         │  - Roteador de comandos       │
         │  - Persistência em banco      │
         └───────────────┬───────────────┘
                         │
         ┌───────────────▼───────────────┐
         │      Cliente TCP (2700)       │
         └───────────────┬───────────────┘
                         │
         ┌───────────────▼───────────────┐
         │     Viaweb Receiver           │
         │      (10.0.20.43)             │
         └───────────────┬───────────────┘
                         │
         ┌───────────────▼───────────────┐
         │     Equipamentos (Alarmes)    │
         └───────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SQL Server (Banco)                           │
│              - Logs de eventos                                  │
│              - Configurações                                    │
│              - Histórico de operações                           │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

#### 1. Inicialização
```
node server.js → Carrega configs → Conecta SQL Server → 
Inicia WebSocket (8090) → Inicia API REST (3000) → 
Inicia HTTP (8000) → Conecta Viaweb Receiver (TCP 2700) → 
Envia IDENT → Sistema pronto
```

#### 2. Envio de Comando
```
Frontend (WebSocket) → server.js (valida) → 
Criptografa AES-256-CBC → Viaweb Receiver → 
Equipamento (executa) → Resposta criptografada → 
server.js (descriptografa) → Salva em DB → 
Frontend (atualiza UI)
```

#### 3. Recepção de Evento
```
Equipamento (gera evento) → Viaweb Receiver → 
server.js (descriptografa) → Valida → 
SQL Server (persiste) → WebSocket (broadcast) → 
Frontend (exibe) → Envia ACK
```

---

## ⚡ Funcionalidades

### Gerenciamento de Partições
- Armar/desarmar partições individualmente ou em grupo
- Consultar status de armamento em tempo real
- Inibir zonas específicas durante armamento

### Monitoramento de Zonas
- Status em tempo real de todas as zonas
- Detecção de violação, falhas e restauração
- Tipos de zona (PIR, Porta, Vidro, etc.)

### Eventos em Tempo Real
- Recepção instantânea via WebSocket
- Persistência automática em banco de dados
- Códigos ContactID (ISO 8601)
- Notificações configuráveis

### Segurança
- Criptografia AES-256-CBC obrigatória
- IV dinâmico por mensagem
- Autenticação de comandos
- Logs detalhados de operações

---

## 📦 Instalação

### Pré-requisitos

- Node.js v14 ou superior
- SQL Server 2016 ou superior
- Acesso à rede do Viaweb Receiver (10.0.20.43:2700)
- Portas 8090, 3000, 8000 disponíveis

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/viaweb-cotrijal.git
cd viaweb-cotrijal

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
nano .env  # Edite com suas credenciais

# 4. Teste a conexão com o banco
node test-db.js

# 5. Inicie o servidor
node server.js
```

### Verificação

Após iniciar, você deve ver:

```
✅ Servidor WebSocket iniciado na porta 8090
✅ API REST iniciada na porta 3000
✅ Servidor HTTP iniciado na porta 8000
✅ Conectado ao SQL Server
✅ Cliente TCP conectado ao Viaweb Receiver (10.0.20.43:2700)
✅ IDENT enviado com sucesso
✅ Sistema pronto para receber comandos
```

---

## ⚙️ Configuração

### Arquivo `.env`

```env
# SQL Server
DB_SERVER=localhost
DB_DATABASE=viaweb_cotrijal
DB_USER=sa
DB_PASSWORD=sua_senha_aqui
DB_ENCRYPT=true
DB_TRUST_CERT=true

# Viaweb Receiver
VIAWEB_HOST=10.0.20.43
VIAWEB_PORT=2700

# Criptografia
CRYPTO_KEY=32_caracteres_chave_aes_256_aqui
CRYPTO_IV=16_caracteres_iv_aqui

# Servidor
WS_PORT=8090
REST_PORT=3000
HTTP_PORT=8000

# Logging
LOG_LEVEL=info
LOG_FILE=logs/server.log
```

### Arquivo `db-config.js`

```javascript
module.exports = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    connectionTimeout: 30000,
    requestTimeout: 30000
  }
};
```

---

## 🔌 Operações Suportadas

### 1. Identificação (IDENT)

**Descrição:** Identifica o cliente perante o Viaweb Receiver (automático na inicialização)

```json
{
  "oper": [{
    "id": "ident-1",
    "acao": "ident",
    "nome": "Viaweb Client HTML",
    "retransmite": 0,
    "limite": 20000,
    "serializado": 1,
    "limiteTestes": -1,
    "versaoProto": 1
  }]
}
```

### 2. Consultar Status de Partições

```json
{
  "oper": [{
    "id": "cmd-part-001",
    "acao": "executar",
    "idISEP": "0572",
    "timeout": 120,
    "comando": [{
      "cmd": "particoes"
    }]
  }]
}
```

**Resposta:**
```json
{
  "resp": [{
    "id": "cmd-part-001",
    "resposta": [
      { "cmd": "particoes", "pos": 1, "armado": 1 },
      { "cmd": "particoes", "pos": 2, "armado": 0 }
    ]
  }]
}
```

### 3. Armar Partições

```json
{
  "oper": [{
    "id": "cmd-armar-001",
    "acao": "executar",
    "idISEP": "0572",
    "timeout": 120,
    "comando": [{
      "cmd": "armar",
      "password": "8790",
      "particoes": [1, 2],
      "inibir": [5, 8]
    }]
  }]
}
```

### 4. Desarmar Partições

```json
{
  "oper": [{
    "id": "cmd-desarm-001",
    "acao": "executar",
    "idISEP": "0572",
    "timeout": 120,
    "comando": [{
      "cmd": "desarmar",
      "password": "8790",
      "particoes": [1, 2]
    }]
  }]
}
```

### 5. Consultar Zonas

```json
{
  "oper": [{
    "id": "cmd-zonas-001",
    "acao": "executar",
    "idISEP": "0572",
    "timeout": 120,
    "comando": [{
      "cmd": "zonas"
    }]
  }]
}
```

**Resposta:**
```json
{
  "resp": [{
    "id": "cmd-zonas-001",
    "resposta": [
      { "cmd": "zonas", "zona": 1, "status": "ok", "tipo": "PIR" },
      { "cmd": "zonas", "zona": 2, "status": "violada", "tipo": "Porta" }
    ]
  }]
}
```

### 6. Recepção de Eventos

**Formato de evento recebido:**
```json
{
  "oper": [{
    "id": "15-evt",
    "acao": "evento",
    "codigoEvento": "1130",
    "particao": 1,
    "zonaUsuario": 5,
    "isep": "0572",
    "dia": 10,
    "mes": 1,
    "hora": 14,
    "minuto": 30,
    "eventoInterno": 1
  }],
  "eventosPendentes": 3
}
```

**Confirmação obrigatória (ACK):**
```json
{
  "resp": [{ "id": "15-evt" }]
}
```

### Códigos de Evento ContactID

| Código | Descrição |
|--------|-----------|
| 1130   | Zona violada |
| 1400   | Zona restaurada |
| 1200   | Partição armada |
| 1300   | Partição desarmada |
| 1500   | Bateria baixa |
| 1600   | Falha de comunicação |

---

## 📁 Estrutura do Projeto

```
viaweb-cotrijal/
├── server.js              # Servidor principal
├── db-config.js           # Configuração SQL Server
├── test-db.js             # Teste de conexão
├── package.json           # Dependências Node.js
├── .env                   # Variáveis de ambiente (não commitar!)
├── .env.example           # Exemplo de variáveis
├── public/                # Arquivos estáticos (frontend)
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   └── websocket-client.js
│   └── assets/
│       ├── icons/
│       └── logos/
├── logs/                  # Arquivos de log (gerados)
│   ├── server.log
│   └── errors.log
└── docs/                  # Documentação
    ├── README.md
    ├── API.md
    └── PROTOCOLO_VIAWEB.md
```

---

## 🔐 Criptografia

Todas as mensagens TCP entre `server.js` e `Viaweb Receiver` são criptografadas com **AES-256-CBC**.

### IV Dinâmico

O Initialization Vector (IV) é atualizado a cada mensagem:

#### Envio
```
1. Inicializa ivSend com IV fixo (16 bytes)
2. Criptografa mensagem com ivSend
3. Atualiza ivSend = últimos 16 bytes do criptografado
4. Envia via TCP
```

#### Recepção
```
1. Inicializa ivRecv com IV fixo (16 bytes)
2. Recebe mensagem criptografada
3. Descriptografa com ivRecv
4. Atualiza ivRecv = últimos 16 bytes recebidos
```

### Implementação

```javascript
const crypto = require('crypto');

const CHAVE = Buffer.from('32_caracteres_chave_aes_256_aqui', 'utf8');
const IV_INICIAL = Buffer.from('16_caracteres_iv_', 'utf8');

let ivSend = Buffer.from(IV_INICIAL);
let ivRecv = Buffer.from(IV_INICIAL);

function criptografar(mensagem) {
    const cipher = crypto.createCipheriv('aes-256-cbc', CHAVE, ivSend);
    let criptografado = cipher.update(mensagem, 'utf8', 'hex');
    criptografado += cipher.final('hex');
    
    ivSend = Buffer.from(criptografado.slice(-32), 'hex');
    return criptografado;
}

function descriptografar(criptografado) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', CHAVE, ivRecv);
    let descriptografado = decipher.update(criptografado, 'hex', 'utf8');
    descriptografado += decipher.final('utf8');
    
    ivRecv = Buffer.from(criptografado.slice(-32), 'hex');
    return descriptografado;
}
```

---

## 🔧 Troubleshooting

### Conexão recusada ao Viaweb Receiver

**Causa:** IP/porta incorretos ou firewall bloqueando

**Solução:**
```bash
# Testar conectividade
ping 10.0.20.43
telnet 10.0.20.43 2700

# Verificar configuração
cat .env
```

### Erro ao conectar SQL Server

**Causa:** Credenciais incorretas ou banco indisponível

**Solução:**
```bash
# Executar teste de conexão
node test-db.js

# Testar conectividade SQL
sqlcmd -S localhost -U sa -P sua_senha
```

### Comando não recebe resposta

**Causa:** Timeout ou equipamento offline

**Solução:**
```javascript
// Aumentar timeout em server.js
const TIMEOUT_COMANDO = 300; // 300 segundos

// Verificar status do equipamento primeiro
// Enviar comando "status" antes de armar/desarmar
```

### Eventos não aparecem no frontend

**Causa:** WebSocket desconectado ou ACK não enviado

**Solução:**
```javascript
// Verificar conexão WebSocket
console.log('Clientes conectados:', wss.clients.size);

// Garantir envio de ACK
function enviarACK(idEvento) {
    const ack = { resp: [{ id: idEvento }] };
    socketViaweb.write(criptografar(JSON.stringify(ack)));
}
```

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

### Diretrizes

- Mantenha o código limpo e bem documentado
- Adicione testes para novas funcionalidades
- Atualize a documentação conforme necessário
- Siga o padrão de código existente

---

## 📝 Notas Importantes

1. **Segurança:** Nunca commitar `.env` com credenciais reais
2. **Backup:** Fazer backup regular do banco de dados
3. **Logs:** Monitorar `logs/server.log` para diagnósticos
4. **Atualizações:** Manter Node.js e dependências atualizadas
5. **Testes:** Executar `test-db.js` regularmente

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 📞 Suporte

- **Email:** dsantos.dev@gmail.com
- **Issues:** [GitHub Issues](https://github.com/seu-usuario/viaweb-cotrijal/issues)
- **Documentação:** [Wiki](https://github.com/seu-usuario/viaweb-cotrijal/wiki)

---

**Última atualização:** Janeiro 2026  
**Versão:** 1.0  
**Mantido por:** Equipe Viaweb Cotrijal

---

⭐ **Se este projeto foi útil, considere dar uma estrela!**
