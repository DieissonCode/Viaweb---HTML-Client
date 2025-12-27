# 📚 Documentação do Projeto Viaweb - HTML Client

## 🗂️ Estrutura de Arquivos

### Backend (Node.js)

#### `bridge.js`
**Função:** Servidor principal que atua como ponte entre navegador e servidor TCP Viaweb.

**Responsabilidades:**
- WebSocket Server (porta 8080) - Comunicação com navegador
- API REST (porta 3000) - Fornece lista de unidades do banco
- Servidor HTTP (porta 8000) - Serve arquivos estáticos
- Cliente TCP - Conecta ao servidor Viaweb (10.0.20.43:2700)
- Criptografia AES-256-CBC para comunicação TCP
- Gerenciamento de banco de dados MSSQL

**Principais Funções:**
- `encrypt(plainText, keyBuffer, ivBuffer)` - Criptografa dados para enviar ao TCP
- `decrypt(encryptedBuffer, keyBuffer, ivBuffer)` - Descriptografa dados recebidos do TCP
- `hexToBuffer(hexString)` - Converte string hex para Buffer
- `connectDatabase()` - Conecta ao banco SQL Server
- `startApiServer()` - Inicia API REST na porta 3000
- `startHttpServerAndOpenBrowser()` - Inicia servidor HTTP e abre navegador

**Fluxo de Dados:**
```
Navegador (WS) ↔ bridge.js (criptografa/descriptografa) ↔ Servidor TCP Viaweb
                      ↓
                 SQL Server (busca unidades)
```

---

#### `db-config.js`
**Função:** Configuração de conexão com banco de dados SQL Server.

**Configurações:**
- `user` - Usuário do banco (ahk)
- `password` - Senha do banco (123456)
- `server` - Endereço do servidor SQL (srvvdm-bd\viaweb)
- `database` - Nome do banco (Programação)
- `port` - Porta SQL Server (12346)
- `options` - Configurações de segurança e criptografia

---

#### `test-db.js`
**Função:** Script de teste para validar conexão com banco de dados.

**Funcionalidades:**
- Testa conexão com SQL Server
- Lista todas as unidades da tabela INSTALACAO
- Mostra erros detalhados com dicas de solução
- Útil para diagnóstico de problemas de conexão

**Como usar:**
```bash
node test-db.js
```

---

### Frontend (Navegador)

#### `index.html`
**Função:** Interface principal do sistema de monitoramento.

**Seções:**
1. **Header** - Status de conexão (conectado/desconectado)
2. **Controle de Centrais** - Seção recolhível com:
   - Seleção de unidade (dropdown com busca)
   - Botões Armar/Desarmar
   - Lista de partições (checkboxes)
   - Lista de zonas (checkboxes em colunas)
3. **Eventos** - Seção com:
   - Filtro de texto
   - Abas (Todos, Disparos, Pendentes, Sistema, Usuários, Histórico)
   - Tabela de eventos com cores por tipo

**Elementos principais:**
- `#status` - Indicador visual de conexão
- `#unit-select` - Dropdown de unidades
- `#unit-search` - Campo de busca de unidades
- `#partitions-list` - Container de partições
- `#zones-list` - Container de zonas
- `#events-table` - Tabela de eventos
- `#closeEventModal` - Modal para encerrar eventos

---

#### `main.js`
**Função:** Lógica principal do frontend - gerencia conexões, comandos e eventos.

**Variáveis Globais:**
- `units` - Array com todas as unidades carregadas
- `allEvents` - Array com até 300 eventos recentes
- `activeAlarms` - Map de alarmes ativos (código 1130)
- `activePendentes` - Map de eventos pendentes (falhas não resolvidas)
- `ws` - Conexão WebSocket
- `cryptoInstance` - Instância da classe de criptografia
- `pendingCommands` - Map de comandos aguardando resposta
- `currentClientId` - ID da unidade atualmente selecionada

**Principais Funções:**

**Inicialização:**
- `(async () => {...})()` - IIFE que carrega unidades ao iniciar
- `populateUnitSelect()` - Popula dropdown com unidades
- `initCrypto()` - Inicializa criptografia AES
- `connectWebSocket()` - Conecta ao WebSocket do bridge

**Visualização:**
- `updatePartitions(data)` - Atualiza lista de partições na UI
- `updateZones(data)` - Atualiza lista de zonas em colunas
- `updateEventList()` - Atualiza tabela de eventos conforme aba ativa
- `updateCounts()` - Atualiza contadores de alarmes e pendentes
- `getPartitionName(pos, clientId)` - Retorna nome da partição baseado no último dígito do ID

**Processamento de Eventos:**
- `processEvent(data)` - Processa evento recebido do servidor
  - Adiciona ao array `allEvents`
  - Detecta alarmes (1130) e adiciona a `activeAlarms`
  - Detecta falhas e restauros, gerencia `activePendentes`
  - Chama `updateEventList()` e `updateCounts()`

**Comunicação:**
- `sendEncrypted(data)` - Criptografa e envia comando via WebSocket
- `fetchPartitionsAndZones(idISEP)` - Busca partições e zonas de uma central
- `armarParticoes(idISEP, particoes, zonas)` - Envia comando de armação
- `desarmarParticoes(idISEP, particoes)` - Envia comando de desarmação

**Auxiliares:**
- `getSelectedPartitions()` - Retorna IDs das partições marcadas
- `getSelectedZones()` - Retorna IDs das zonas marcadas
- `openCloseModal(group, type)` - Abre modal para encerrar evento
- `filterEvents(term)` - Filtra eventos por termo de busca

**Event Listeners:**
- `unitSelect.change` - Quando seleciona unidade, carrega dados
- `armButton.click` - Arma partições selecionadas
- `disarmButton.click` - Desarma partições selecionadas
- `autoUpdateCheckbox.change` - Ativa/desativa atualização automática (30s)
- `.tab-btn.click` - Troca aba de eventos
- `eventsFilter.input` - Filtra eventos em tempo real

---

#### `crypto.js`
**Função:** Implementação de criptografia AES-256-CBC para o navegador.

**Classe: `ViawebCrypto`**

**Constructor:**
```javascript
constructor(hexKey, hexIV)
```
- Recebe chave e IV em hexadecimal
- Converte para Uint8Array
- Mantém IVs separados para envio (ivSend) e recepção (ivRecv)

**Métodos:**

**`async encrypt(plainText)`**
- Criptografa texto usando AES-256-CBC
- Adiciona padding PKCS7 (múltiplo de 16 bytes)
- Atualiza `ivSend` com últimos 16 bytes do criptografado
- Retorna Uint8Array criptografado

**`async decrypt(encryptedBuffer)`**
- Descriptografa dados usando AES-256-CBC
- Remove padding PKCS7
- Atualiza `ivRecv` com últimos 16 bytes do buffer
- Remove caracteres nulos do final
- Retorna string descriptografada

**`hexToBytes(hexStr)`**
- Converte string hexadecimal para Uint8Array
- Remove espaços automaticamente

**Características:**
- Usa Web Crypto API (window.crypto.subtle)
- CBC mode com IVs dinâmicos (Cipher Block Chaining)
- Compatível com a criptografia do servidor Viaweb

---

#### `config.js`
**Função:** Configurações globais e dicionários de eventos.

**Exports:**

**`CHAVE`** - Chave AES-256 em hexadecimal (32 bytes)

**`IV`** - Vetor de inicialização em hexadecimal (16 bytes)

**`partitionNames`** - Objeto mapeando último dígito do ID para nome:
```javascript
{
  1: "Balança",
  2: "Administrativo",
  3: "Defensivos",
  // ...
}
```

**`armDisarmCodes`** - Array de códigos de armação/desarmação:
- `"1401"` - Desativado Por Senha
- `"1402"` - Partição Desativada por Senha
- `"3401"` - Ativado Por Senha
- `"3402"` - Partição Ativada por Senha
- `"3403"` - Auto Ativação
- `"3456"` - Ativado Forçado

**`falhaCodes`** - Array de códigos de falha (começam com "1"):
- `"1142"` - Curto circuito no sensor
- `"1143"` - Falha de Módulo Expansor
- `"1144"` - Violação de Tamper
- `"1300"` - Falha de Fonte Auxiliar
- `"1301"` - Falha de Energia Elétrica
- `"1302"` - Falha de Bateria
- etc.

**`sistemaCodes`** - Array com códigos de falha + restauro (começam com "3"):
- Inclui todos os `falhaCodes`
- Mais códigos de restauro correspondentes (ex: "3142", "3143")

**`eventosDB`** - Objeto com descrições de todos os eventos:
```javascript
{
  "1130": "Disparo de alarme no sensor",
  "3130": "Restauro de sensor",
  "1144": "Violação de Tamper",
  // ... 50+ eventos
}
```

---

#### `units-db.js`
**Função:** Gerencia busca e cache de unidades da API.

**Variáveis Privadas:**
- `cachedUnits` - Cache das unidades
- `cacheTimestamp` - Timestamp do último carregamento
- `CACHE_DURATION` - 5 minutos (300000ms)
- `API_URL` - http://localhost:3000/api/units

**Funções Exportadas:**

**`async getUnits(forceRefresh = false)`**
- Busca unidades da API REST
- Usa cache se válido (menos de 5 min)
- Em caso de erro, retorna cache antigo ou fallback
- Mapeia dados para formato padronizado:
  ```javascript
  {
    value: "0572",
    local: "AGS [ ADM ]",
    label: "AGS [ ADM ]",
    sigla: "AGS"
  }
  ```

**`refreshUnits()`**
- Força atualização ignorando cache
- Útil para recarregar após mudanças no banco

**`clearCache()`**
- Limpa cache de unidades
- Próxima chamada busca do servidor

**`getFallbackUnits()` (privada)**
- Retorna 8 unidades de exemplo
- Usado quando API não está disponível
- Garante que sistema funcione mesmo sem banco

---

#### `viaweb-commands.js`
**Função:** Biblioteca de comandos do protocolo Viaweb - construtores de JSON.

**Funções de Comando:**

**`getPartitionsCommand(idISEP, commandId)`**
- Cria comando para buscar partições
- Retorna: `{oper: [{id, acao: "executar", idISEP, comando: [{cmd: "particoes"}]}]}`

**`getZonesCommand(idISEP, commandId)`**
- Cria comando para buscar zonas
- Retorna estrutura similar com `cmd: "zonas"`

**`armPartitionsCommand(idISEP, particoes, zonas, password, commandId)`**
- Cria comando de armação
- `particoes` - Array de números das partições
- `zonas` - Array de zonas a inibir (opcional)
- `password` - Senha (padrão: 8790)

**`disarmPartitionsCommand(idISEP, particoes, password, commandId)`**
- Cria comando de desarmação
- Similar ao armPartitionsCommand mas sem inibição de zonas

**`createIdentCommand(nome, serializado, retransmite, limite)`**
- Cria comando IDENT para identificação inicial
- Gera número aleatório para campo `a`
- Usado ao conectar pela primeira vez

**`getStatusCommand(idISEP, commandId)`**
- Busca status geral da central
- `cmd: "status"`

**`createAckCommand(eventId)`**
- Cria ACK (confirmação) de evento recebido
- Formato: `{resp: [{id: eventId}]}`

**`getInitialDataCommands(idISEP)`**
- Cria ambos os comandos (partições + zonas) de uma vez
- Retorna objeto com IDs e comandos separados

**Funções de Validação:**

**`isValidISEP(idISEP)`**
- Valida formato do ID ISEP
- Deve ser string de 4 caracteres hexadecimais
- Exemplo: "0572", "1A3F", "ABCD"

**`formatISEP(idISEP)`**
- ⚠️ REMOVIDA A CONVERSÃO DECIMAL→HEX
- Apenas garante 4 dígitos com zeros à esquerda
- Converte para maiúsculas
- Exemplo: "572" → "0572", "abc" → "0ABC"

---

#### `styles.css`
**Função:** Estilização completa da interface com tema dark mode.

**Variáveis CSS (`:root`):**
```css
--primary: #2563eb;        /* Azul primário */
--success: #10b981;        /* Verde sucesso */
--danger: #ef4444;         /* Vermelho perigo */
--warning: #f59e0b;        /* Laranja aviso */
--bg-dark: #0f172a;        /* Fundo escuro */
--bg-card: #1e293b;        /* Fundo de cards */
--text-primary: #f1f5f9;   /* Texto principal */
```

**Principais Classes:**

**Status:**
- `.connected` - Verde, pulsando
- `.disconnected` - Vermelho, pulsando
- `@keyframes pulse` - Animação de pulsação

**Partições e Zonas:**
- `.partition-item`, `.zone-item` - Containers com checkbox
- `.armado` / `.desarmado` - Status de partições
- `.ok`, `.aberto`, `.disparada`, `.inibida`, `.tamper` - Status de zonas
- `.mono-number` - Números com fonte monoespaçada

**Eventos:**
- `.event-row` - Linha de evento com hover
- `.alarm` - Vermelho (código 1130)
- `.restauro` - Verde (códigos 3xxx)
- `.falha` - Laranja (falhas de sistema)
- `.armedisarm` - Azul (armação/desarmação)
- `.teste` - Ciano (códigos 16xx)

**Layout:**
- `.container` - Grid 1fr 2fr (partições | zonas)
- `#zones-columns` - Grid auto-fit para zonas em colunas
- `.modal` - Overlay com blur para modais

**Responsividade:**
- `@media (max-width: 1200px)` - Container vira coluna única
- `@media (max-width: 768px)` - Mobile: zonas em coluna única

---

### Arquivos de Teste e Documentação

#### `test-api.html`
**Função:** Interface visual para testar API REST.

**Funcionalidades:**
- Botão "Testar Conexão" - Verifica se API está acessível
- Botão "Buscar Unidades" - Lista todas as unidades do banco
- Mostra headers HTTP da resposta
- Exibe JSON completo em formato expandível
- Diagnóstico de erros com dicas de solução
- Teste automático ao carregar página

**Útil para:**
- Verificar se bridge.js está rodando
- Confirmar conexão com banco de dados
- Ver estrutura exata dos dados retornados

---

#### `package.json`
**Função:** Manifesto do projeto Node.js.

**Dependências:**
- `ws@^8.18.3` - WebSocket para comunicação navegador
- `mssql@^12.2.0` - Driver SQL Server para Node.js

**Scripts:**
```json
{
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

---

## 🔄 Fluxo de Dados Completo

### 1. Inicialização
```
1. Usuário executa: node bridge.js
2. Bridge inicia:
   - WebSocket Server (8080)
   - API REST (3000)
   - HTTP Server (8000)
   - Conecta ao SQL Server
   - Conecta ao TCP Viaweb (10.0.20.43:2700)
   - Envia IDENT
3. Navegador abre automaticamente
4. Frontend conecta WebSocket
5. Frontend busca unidades da API
6. Popula dropdown
```

### 2. Seleção de Unidade
```
1. Usuário seleciona unidade no dropdown
2. main.js busca unit.value (ex: "0572")
3. Formata para 4 dígitos: "0572"
4. Cria comandos de partições e zonas
5. Criptografa comandos com AES-256-CBC
6. Envia via WebSocket para bridge
7. Bridge descriptografa
8. Bridge re-criptografa para TCP
9. Envia ao servidor Viaweb
10. Servidor responde
11. Bridge descriptografa resposta TCP
12. Bridge envia JSON puro via WebSocket
13. Frontend atualiza UI com partições e zonas
```

### 3. Armação/Desarmação
```
1. Usuário marca partições/zonas
2. Clica "Armar" ou "Desarmar"
3. main.js coleta selecionados
4. Cria comando com senha (8790)
5. Mesmo fluxo de criptografia/envio
6. Após 5s, busca status atualizado
```

### 4. Eventos
```
1. Servidor Viaweb envia evento via TCP
2. Bridge descriptografa
3. Bridge envia JSON via WebSocket
4. main.js processEvent(data):
   - Adiciona a allEvents
   - Se código 1130 → activeAlarms
   - Se código falha → activePendentes
   - Se código restauro → marca resolved
5. updateEventList() atualiza tabela
6. main.js envia ACK com ID limpo (só números)
```

---

## 🔐 Segurança e Criptografia

### AES-256-CBC
- **Chave:** 256 bits (32 bytes) - `CHAVE` em config.js
- **IV:** 128 bits (16 bytes) - Dinâmico, atualiza a cada mensagem
- **Modo:** CBC (Cipher Block Chaining)
- **Padding:** PKCS7

### Fluxo de IVs
```
Envio:
  ivSend inicial = IV fixo
  Após cada encrypt: ivSend = últimos 16 bytes do criptografado

Recepção:
  ivRecv inicial = IV fixo
  Após cada decrypt: ivRecv = últimos 16 bytes do recebido
```

Isso garante que cada mensagem use um IV diferente, aumentando segurança.

---

## 📊 Tipos de Eventos

### Códigos Principais
- **1130** - Disparo de alarme (🚨 vermelho)
- **3130** - Restauro de sensor (✅ verde)
- **1144** - Violação de Tamper (⚠️ laranja)
- **1401-1402** - Desarmação (🔓 azul)
- **3401-3403** - Armação (🛡️ azul)
- **14xx** - Falhas de sistema (⚠️ laranja)
- **34xx** - Restauros de falha (✅ verde)
- **16xx** - Testes (ℹ️ ciano)

### Sistema de Agrupamento
- Eventos com mesmo local + código + zona são agrupados
- Mostra "primeiro evento (X eventos)" na tabela
- Clique abre modal para encerrar grupo

---

## 🎨 UI/UX

### Cores por Status
- 🟢 Verde - OK, Armado, Restauro
- 🔴 Vermelho - Disparo, Aberto, Desarmado
- 🟠 Laranja - Falha, Tamper, Pendente
- 🔵 Azul - Ação de usuário, Primário
- ⚫ Cinza - Inibida, Desabilitado

### Seções Recolhíveis
- "Centrais de Alarme" - Começa fechada
- "Eventos" - Começa aberta
- Clique no header para expandir/recolher

### Responsividade
- Desktop: 2 colunas (partições | zonas)
- Tablet: 1 coluna
- Mobile: Interface adaptada, zonas em coluna única

---

## 🐛 Debug e Logs

### Console do Navegador
```javascript
🔄 Carregando unidades...
✅ 146 unidades carregadas
🔍 ===== SELEÇÃO DE UNIDADE =====
📤 idISEP que será enviado: 0572
🚀 fetchPartitionsAndZones chamada...
```

### Terminal do bridge.js
```
🚀 Servidor Bridge iniciado na porta 8080
📱 [08:00:00] Cliente WebSocket conectado
📤 WS→TCP (JSON recebido): {...}
📩 TCP→WS (JSON): {...}
```

### Níveis de Log
- 🔄 Carregamento
- ✅ Sucesso
- ❌ Erro
- 📤 Envio
- 📩 Recebimento
- 🔍 Debug

---

## 🚀 Performance

### Cache
- Unidades: 5 minutos
- Eventos: Máximo 300 na memória
- Comandos pendentes: Limpa após resposta

### Otimizações
- Debounce na busca de unidades (300ms)
- Auto-update opcional (30s)
- Lazy rendering de zonas (8 por coluna)
- CSS com will-change para animações

---

## 📱 Compatibilidade

### Navegado