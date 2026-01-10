# VIAWEB COTRIJAL - PLATAFORMA DE MONITORAMENTO E CONTROLE

## 📋 ÍNDICE

1. VISÃO GERAL DO PROJETO
2. ARQUITETURA GERAL DO SISTEMA
3. COMPONENTES PRINCIPAIS
4. FLUXO DE DADOS E COMUNICAÇÃO
5. CONFIGURAÇÃO E INSTALAÇÃO
6. OPERAÇÕES SUPORTADAS
7. ESTRUTURA DE DIRETÓRIOS
8. VARIÁVEIS DE AMBIENTE
9. TROUBLESHOOTING
10. REFERÊNCIAS E DOCUMENTAÇÃO

---

## 1. VISÃO GERAL DO PROJETO

### O que é Viaweb Cotrijal?

**Viaweb Cotrijal** é uma plataforma web de **monitoramento e controle de equipamentos de segurança** (alarmes, sensores, partições) conectados à rede **Viaweb**. O sistema funciona como intermediário entre:

- **Frontend**: Navegador web (HTML5 + JavaScript)
- **Backend**: Servidor Node.js (`server.js`)
- **Viaweb Receiver**: Servidor TCP remoto (10.0.20.43:2700)
- **Banco de Dados**: SQL Server (configuração em `db-config.js`)

### Funcionalidades Principais

- ✅ Armamento/desarmamento de partições
- ✅ Leitura de status de zonas e partições
- ✅ Recepção e processamento de eventos em tempo real
- ✅ Criptografia AES-256-CBC em todas comunicações TCP
- ✅ Persistência de eventos em banco de dados
- ✅ API REST para integração externa
- ✅ WebSocket para comunicação bidirecional em tempo real
- ✅ Suporte a múltiplas unidades (equipamentos) simultâneas

---

Perfeito, Dieisson! Vou gerar o diagrama em Mermaid estilo "Node-centered" com server.js no centro conectando tudo — vai ficar limpo, profissional e 100% compatível com GitHub.

Aqui está pronto para você copiar e colar no README:

2. Arquitetura Geral do Sistema
A arquitetura do Viaweb HTML Client é organizada em 7 camadas, cada uma com responsabilidades claras e independentes.
Esse modelo facilita manutenção, escalabilidade e depuração.

🧩 1. Camada de Apresentação (Frontend – Navegador)
Responsável pela interface com o usuário.

Inclui:

index.html
main.js
styles.css
crypto.js
units-db.js
Funções:

Exibir status, partições, zonas e eventos
Enviar comandos ao servidor via WebSocket
Receber eventos em tempo real
Renderizar UI responsiva em tema escuro
Processar códigos de eventos
🔌 2. Camada de Comunicação (WebSocket / REST / HTTP)
Responsável por conectar o navegador ao backend.

Protocolos usados:

WebSocket (porta 8090) → tempo real
REST API (porta 3000) → listagem de unidades
HTTP (porta 8000) → arquivos estáticos
Esta camada garante:

Comunicação contínua com o front
Atualizações sem recarregar página
Transporte seguro e padronizado
⚙️ 3. Camada de Aplicação (server.js – Núcleo)
O cérebro do sistema.

Responsável por:

Roteamento de comandos
Processamento de respostas
Serialização/normalização JSON
Gerenciamento de conexões WebSocket
Manutenção de comandos pendentes
Envio/recebimento de ACKs
Gestão de sessões de unidades conectadas
Esta é a camada onde a lógica real do sistema vive.

🔐 4. Camada de Criptografia (AES-256-CBC)
Implementada dentro do server.js e espelhada no crypto.js no front.

Responsabilidades:

Criptografar mensagens enviadas ao Viaweb Receiver
Descriptografar mensagens recebidas
Gerenciar IV dinâmico:
ivSend → atualiza após cada encrypt
ivRecv → atualiza após cada decrypt
Garantias:

Integridade
Confidencialidade
Compatibilidade total com protocolo Viaweb
🔗 5. Camada de Integração (TCP + Banco de Dados)
Conecta o sistema a serviços externos.

Componentes:

Cliente TCP → 10.0.20.43:2700
Cliente SQL Server → definido em db-config.js
Funções:

Encaminhar comandos criptografados
Receber eventos do Viaweb Receiver
Persistir logs no banco
Consultar unidades para o frontend
💾 6. Camada de Dados (SQL Server)
Armazena:

Unidades (INSTALACAO)
Logs de eventos
Configurações internas
Histórico de operações
É acessada exclusivamente via server.js.

🚨 7. Camada de Dispositivos (Alarmes)
A camada mais externa.

Inclui:

Centrais de alarme
Partições
Zonas
Sensores diversos
Funções:

Gerar eventos
Responder a comandos de armar/desarmar
Reportar status
📤 Fluxo Simplificado
Comando (Armar/Desarmar):

Navegador → WebSocket → server.js → Criptografia AES → TCP → Viaweb Receiver → Equipamento
Evento (Disparo, Falha, Restauro):

Equipamento → Viaweb Receiver → TCP → server.js → WebSocket → Navegador
Persistência:

server.js → SQL Server

---

## 3. COMPONENTES PRINCIPAIS

### 3.1 server.js

**Arquivo**: `server.js`  
**Responsabilidade**: Servidor principal — ponte entre frontend e Viaweb Receiver  
**Porta WebSocket**: 8090  
**Porta REST**: 3000  
**Porta HTTP**: 8000  
**Conexão TCP**: 10.0.20.43:2700

#### Funcionalidades

- Gerenciamento de conexões WebSocket
- Criptografia/descriptografia AES-256-CBC
- Roteamento de comandos para Viaweb Receiver
- Persistência de eventos em SQL Server
- API REST para consultas
- Servidor HTTP para arquivos estáticos

#### Dependências

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">javascript</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-j8279umq3" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-javascript" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(127, 219, 202)">const</span><span> net </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;net&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>              </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Cliente TCP</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token maybe-class-name">WebSocket</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;ws&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>         </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// WebSocket</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> express </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;express&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>      </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// API REST</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> crypto </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;crypto&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>        </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Criptografia</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> sql </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;mssql&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>            </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// SQL Server</span><span>
</span></code></pre></div>

---

### 3.2 db-config.js

**Arquivo**: `db-config.js`  
**Responsabilidade**: Configuração de conexão com SQL Server

#### Variáveis de Configuração

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">javascript</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-k52qvar7q" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-javascript" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token literal-property" style="color:rgb(128, 203, 196)">server</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> string       </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// IP ou hostname do SQL Server</span><span>
</span><span></span><span class="token literal-property" style="color:rgb(128, 203, 196)">database</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> string     </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Nome do banco de dados</span><span>
</span><span></span><span class="token literal-property" style="color:rgb(128, 203, 196)">authentication</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token literal-property" style="color:rgb(128, 203, 196)">type</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> string       </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// &#x27;default&#x27; para SQL Auth</span><span>
</span><span>  </span><span class="token literal-property" style="color:rgb(128, 203, 196)">options</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token literal-property" style="color:rgb(128, 203, 196)">userName</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> string </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Usuário SQL</span><span>
</span><span>    </span><span class="token literal-property" style="color:rgb(128, 203, 196)">password</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> string </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Senha SQL</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span><span></span><span class="token literal-property" style="color:rgb(128, 203, 196)">options</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token literal-property" style="color:rgb(128, 203, 196)">encrypt</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> boolean   </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Usar SSL/TLS</span><span>
</span><span>  </span><span class="token literal-property" style="color:rgb(128, 203, 196)">trustServerCertificate</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> boolean
</span><span>  </span><span class="token literal-property" style="color:rgb(128, 203, 196)">connectionTimeout</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> number
</span><span>  </span><span class="token literal-property" style="color:rgb(128, 203, 196)">requestTimeout</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> number
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

### 3.3 test-db.js

**Arquivo**: `test-db.js`  
**Responsabilidade**: Ferramenta de diagnóstico de conexão com SQL Server

#### Uso

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">bash</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-l61nm8ed4" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-bash" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(130, 170, 255)">node</span><span> test-db.js
</span></code></pre></div>

#### Saída Esperada


✅ Conexão com SQL Server estabelecida ✅ Banco de dados 'viaweb_cotrijal' acessível ✅ Tabela 'Logs' encontrada ✅ Tabela 'Configuracoes' encontrada

---

## 4. OPERAÇÕES SUPORTADAS

### 4.1 Identificação (IDENT)

**Descrição**: Identifica o cliente perante o Viaweb Receiver

**Enviado por**: server.js (automaticamente na inicialização)

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-p6ooglvku" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;ident-1&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;ident&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;nome&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;Viaweb Client HTML&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;retransmite&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">0</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;limite&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">20000</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;serializado&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;limiteTestes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">-1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;versaoProto&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Resposta de Sucesso**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-h4qvzl6z1" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;ident-1&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;versao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">123</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;versaoProto&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

### 4.2 Executar Comando

**Descrição**: Envia comandos para equipamentos (armar, desarmar, status, etc)

**Enviado por**: Frontend via WebSocket → server.js → Viaweb Receiver

**Formato Geral**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-itx6lkpii" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;executar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;idISEP&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;timeout&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">120</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comando&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;COMANDO_AQUI&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;param1&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;valor1&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;param2&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;valor2&quot;</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

#### Comandos Disponíveis

##### 4.2.1 Particoes (Ler Status)

**Descrição**: Consulta o status de armamento das partições

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-xwacxtp0p" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-part-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;executar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;idISEP&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;timeout&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">120</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comando&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;particoes&quot;</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Resposta**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-hnygejji6" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-part-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resposta&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;particoes&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;pos&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;armado&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;particoes&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;pos&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;armado&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">0</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;particoes&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;pos&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">3</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;armado&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Campos**:
- `pos`: Número da partição (1-8 tipicamente)
- `armado`: 1 = armada, 0 = desarmada

---

##### 4.2.2 Armar Partições

**Descrição**: Arma uma ou mais partições

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-78658yjla" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-armar-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;executar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;idISEP&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;timeout&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">120</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comando&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;armar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;password&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;8790&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;particoes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;inibir&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(247, 140, 108)">5</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">8</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Campos**:
- `password`: Senha de armamento (obrigatório)
- `particoes`: Array de partições a armar (obrigatório)
- `inibir`: Array de zonas a inibir (opcional)

**Resposta de Sucesso**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-n892yhi4e" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-armar-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resposta&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;armar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;status&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;ok&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;particoes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Resposta de Erro**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-yjgco4r9o" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-armar-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;erro&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;Senha incorreta&quot;</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

##### 4.2.3 Desarmar Partições

**Descrição**: Desarma uma ou mais partições

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-wvqng9cwq" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-desarm-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;executar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;idISEP&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;timeout&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">120</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comando&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;desarmar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;password&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;8790&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;particoes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Campos**:
- `password`: Senha de desarmamento (obrigatório)
- `particoes`: Array de partições a desarmar (obrigatório)

---

##### 4.2.4 Status Geral

**Descrição**: Consulta status completo do equipamento

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-gugs68065" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-status-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;executar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;idISEP&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;timeout&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">120</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comando&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;status&quot;</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Resposta**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-h3y4xhcxt" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-status-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resposta&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;status&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;online&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;bateria&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">85</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;sinal&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">4</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;particoes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">0</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">0</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;zonas_ativas&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">12</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

##### 4.2.5 Zonas (Ler Status)

**Descrição**: Consulta o status de todas as zonas

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-ij5p44ult" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-zonas-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;executar&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;idISEP&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;timeout&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">120</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comando&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>      </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;zonas&quot;</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Resposta**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-4wduzv7nh" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cmd-zonas-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resposta&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;zonas&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;zona&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;status&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;ok&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;tipo&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;PIR&quot;</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;zonas&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;zona&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;status&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;violada&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;tipo&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;Porta&quot;</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>      </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;cmd&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;zonas&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;zona&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">3</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;status&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;ok&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;tipo&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;Vidro&quot;</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span><span>    </span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

### 4.3 Ler Configurações Gerais

**Descrição**: Lê as configurações gerais do Viaweb Receiver

**Enviado por**: server.js (sob demanda)

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-21yqgbxkf" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cfg-geral-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;lerGeral&quot;</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Resposta de Sucesso**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-78tav3qe4" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;cfg-geral-001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;comentarios&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;nivelLogGeral&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;dividirLog&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">24</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;apagarLogs&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">30</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;usarAcceptEx&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;nivelLogAlarmeNETcom&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">2</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoViawebIniciar&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9000&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoViawebParar&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9001&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoClienteAutorizar&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9010&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoClienteOnline&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9020&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoClienteOffline&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9021&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoMeioOnline&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9030&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codEventoMeioOffline&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;9031&quot;</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Campos**:
- `comentarios`: 1 = salva com comentários, 0 = sem comentários
- `nivelLogGeral`: Nível de log (0=Network, 1=Debug, 2=Info, 3=Operação, 4=Erro, 5=Nenhum)
- `dividirLog`: Divide arquivo de log a cada X horas (0 = um por dia)
- `apagarLogs`: Apaga logs a cada X dias (0 = indefinido)
- `usarAcceptEx`: 0=WSAAccept(), 1=AcceptEx() (Windows), -1 (Linux)
- `codEventoXXX`: Códigos de eventos internos (ContactID em hex)

---

### 4.4 Recepção de Eventos

**Descrição**: Eventos gerados pelos equipamentos (zonas violadas, armamento, etc)

**Enviado por**: Viaweb Receiver → server.js

**Formato**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-1ozre6pqo" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;oper&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;15-evt&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;acao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;evento&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;nomeViaweb&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;VIAWEB-COTRIJAL&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;portaViaweb&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(247, 140, 108)">2700</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;recepcao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1736524800</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;dia&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">10</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;mes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;hora&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">14</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;minuto&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">30</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;codigoEvento&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;1130&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;eventoInterno&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;particao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">1</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;zonaUsuario&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">5</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;contaCliente&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;supervisao&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0000&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;isep&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;0572&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;numSerie&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;12345678&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;modelo&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;AMT8000&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;meio&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;GPRS&quot;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>    </span><span class="token" style="color:rgb(128, 203, 196)">&quot;ip&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;192.168.1.100&quot;</span><span>
</span><span>  </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;eventosPendentes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">3</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;testesPendentes&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">0</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Campos Principais**:
- `id`: Identificador único do evento
- `codigoEvento`: Código ContactID em hexadecimal (ex: "1130" = zona violada)
- `eventoInterno`: 1=online, 2=offline, 3=autorização pendente
- `particao`: Partição afetada
- `zonaUsuario`: Zona afetada
- `isep`: ID do equipamento
- `recepcao`: Timestamp Unix do evento
- `eventosPendentes`: Quantidade de eventos ainda não processados

**Confirmação Obrigatória (ACK)**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">json</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-xtucimkvl" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-json" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>  </span><span class="token" style="color:rgb(128, 203, 196)">&quot;resp&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token" style="color:rgb(128, 203, 196)">&quot;id&quot;</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&quot;15-evt&quot;</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

**Códigos de Evento Comuns (ContactID)**:
| Código | Descrição |
|--------|-----------|
| 1130   | Zona violada |
| 1400   | Zona restaurada |
| 1200   | Partição armada |
| 1300   | Partição desarmada |
| 1500   | Bateria baixa |
| 1600   | Falha de comunicação |

---

## 5. CONFIGURAÇÃO E INSTALAÇÃO

### 5.1 Pré-requisitos

- Node.js v14+ instalado
- SQL Server 2016+ acessível
- Acesso à rede do Viaweb Receiver (10.0.20.43:2700)
- Portas 8090, 3000, 8000 disponíveis

### 5.2 Instalação

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">bash</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-z234ms4ap" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-bash" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># 1. Clonar/baixar o projeto</span><span>
</span><span></span><span class="token" style="color:rgb(255, 203, 139)">cd</span><span> viaweb-cotrijal
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># 2. Instalar dependências</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">npm</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">install</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># 3. Configurar variáveis de ambiente (ver seção 8)</span><span>
</span><span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Editar .env ou db-config.js</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># 4. Testar conexão com banco</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">node</span><span> test-db.js
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># 5. Iniciar servidor</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">node</span><span> server.js
</span></code></pre></div>

### 5.3 Verificação de Inicialização

Após executar `node server.js`, você deve ver:


✅ Servidor WebSocket iniciado na porta 8090 ✅ API REST iniciada na porta 3000 ✅ Servidor HTTP iniciado na porta 8000 ✅ Conectado ao SQL Server ✅ Cliente TCP conectado ao Viaweb Receiver (10.0.20.43:2700) ✅ IDENT enviado com sucesso ✅ Sistema pronto para receber comandos

---

## 6. ESTRUTURA DE DIRETÓRIOS


viaweb-cotrijal/ ├── server.js # Servidor principal ├── db-config.js # Configuração SQL Server ├── test-db.js # Teste de conexão ├── package.json # Dependências Node.js ├── .env # Variáveis de ambiente ├── public/ # Arquivos estáticos (frontend) │ ├── index.html │ ├── css/ │ │ └── style.css │ ├── js/ │ │ ├── app.js │ │ └── websocket-client.js │ └── assets/ │ ├── icons/ │ └── logos/ ├── logs/ # Arquivos de log (gerados) │ ├── server.log │ └── errors.log └── docs/ # Documentação ├── README.md ├── API.md └── PROTOCOLO_VIAWEB.md

---

## 7. VARIÁVEIS DE AMBIENTE

### 7.1 Arquivo .env

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">env</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-da88ibtly" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-env" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span># SQL Server
</span>DB_SERVER=localhost
<!-- -->DB_DATABASE=viaweb_cotrijal
<!-- -->DB_USER=sa
<!-- -->DB_PASSWORD=sua_senha_aqui
<!-- -->DB_ENCRYPT=true
<!-- -->DB_TRUST_CERT=true
<!-- -->
<!-- --># Viaweb Receiver
<!-- -->VIAWEB_HOST=10.0.20.43
<!-- -->VIAWEB_PORT=2700
<!-- -->
<!-- --># Criptografia
<!-- -->CRYPTO_KEY=32_caracteres_chave_aes_256_aqui
<!-- -->CRYPTO_IV=16_caracteres_iv_aqui
<!-- -->
<!-- --># Servidor
<!-- -->WS_PORT=8090
<!-- -->REST_PORT=3000
<!-- -->HTTP_PORT=8000
<!-- -->
<!-- --># Logging
<!-- -->LOG_LEVEL=info
<!-- -->LOG_FILE=logs/server.log
</code></pre></div>

### 7.2 Carregamento em server.js

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">javascript</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-n4qruilad" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-javascript" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;dotenv&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">config</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">DB_SERVER</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> process</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token property-access">env</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token" style="color:rgb(130, 170, 255)">DB_SERVER</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">DB_DATABASE</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> process</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token property-access">env</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token" style="color:rgb(130, 170, 255)">DB_DATABASE</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">VIAWEB_HOST</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> process</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token property-access">env</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token" style="color:rgb(130, 170, 255)">VIAWEB_HOST</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">VIAWEB_PORT</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> process</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token property-access">env</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token" style="color:rgb(130, 170, 255)">VIAWEB_PORT</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// ... etc</span><span>
</span></code></pre></div>

---

## 8. CRIPTOGRAFIA AES-256-CBC

### 8.1 Funcionamento

Todas as mensagens TCP entre `server.js` e `Viaweb Receiver` são criptografadas com **AES-256-CBC**.

### 8.2 Fluxo de IV (Initialization Vector)

O IV é **dinâmico** e atualiza a cada mensagem:

#### Envio (server.js → Viaweb Receiver)

Inicializa ivSend com IV fixo (16 bytes)
Criptografa mensagem com ivSend
Atualiza ivSend = últimos 16 bytes do criptografado
Envia criptografado via TCP
Repete para próxima mensagem
#### Recepção (Viaweb Receiver → server.js)

Inicializa ivRecv com IV fixo (16 bytes)
Recebe mensagem criptografada
Descriptografa com ivRecv
Atualiza ivRecv = últimos 16 bytes da mensagem recebida
Processa JSON descriptografado
Repete para próximo evento
### 8.3 Implementação em Node.js

<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">javascript</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-grxw3wwkf" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-javascript" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(127, 219, 202)">const</span><span> crypto </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">require</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;crypto&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Configuração</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">CHAVE</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token maybe-class-name">Buffer</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token module" style="color:rgb(127, 219, 202)">from</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;32_caracteres_chave_aes_256_aqui&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;utf8&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">IV_INICIAL</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token maybe-class-name">Buffer</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token module" style="color:rgb(127, 219, 202)">from</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;16_caracteres_iv_&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;utf8&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span></span><span class="token" style="color:rgb(127, 219, 202)">let</span><span> ivSend </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token maybe-class-name">Buffer</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token module" style="color:rgb(127, 219, 202)">from</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(130, 170, 255)">IV_INICIAL</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">let</span><span> ivRecv </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token maybe-class-name">Buffer</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token module" style="color:rgb(127, 219, 202)">from</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(130, 170, 255)">IV_INICIAL</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Criptografar</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">function</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">criptografar</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token parameter">mensagem</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> cipher </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> crypto</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">createCipheriv</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;aes-256-cbc&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">CHAVE</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> ivSend</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span>    </span><span class="token" style="color:rgb(127, 219, 202)">let</span><span> criptografado </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> cipher</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">update</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span>mensagem</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;utf8&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;hex&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span>    criptografado </span><span class="token" style="color:rgb(127, 219, 202)">+=</span><span> cipher</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">final</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;hex&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span>    </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Atualiza IV com últimos 16 bytes do criptografado</span><span>
</span><span>    ivSend </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token maybe-class-name">Buffer</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token module" style="color:rgb(127, 219, 202)">from</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span>criptografado</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">slice</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(127, 219, 202)">-</span><span class="token" style="color:rgb(247, 140, 108)">32</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;hex&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span>    </span><span class="token control-flow" style="color:rgb(127, 219, 202)">return</span><span> criptografado</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Descriptografar</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">function</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">descriptografar</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token parameter">criptografado</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> decipher </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> crypto</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">createDecipheriv</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;aes-256-cbc&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">CHAVE</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> ivRecv</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span>    </span><span class="token" style="color:rgb(127, 219, 202)">let</span><span> descriptografado </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> decipher</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">update</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span>criptografado</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;hex&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;utf8&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span>    descriptografado </span><span class="token" style="color:rgb(127, 219, 202)">+=</span><span> decipher</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">final</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;utf8&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span>    </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Atualiza IV com últimos 16 bytes do criptografado recebido</span><span>
</span><span>    ivRecv </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token maybe-class-name">Buffer</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token module" style="color:rgb(127, 219, 202)">from</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span>criptografado</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">slice</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(127, 219, 202)">-</span><span class="token" style="color:rgb(247, 140, 108)">32</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> </span><span class="token" style="color:rgb(173, 219, 103)">&#x27;hex&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span>    </span><span class="token control-flow" style="color:rgb(127, 219, 202)">return</span><span> descriptografado</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

## 9. TROUBLESHOOTING

### Problema: "Conexão recusada ao Viaweb Receiver"

**Causa**: IP/porta incorretos ou firewall bloqueando

**Solução**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">bash</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-j5cwxcms3" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-bash" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Testar conectividade</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">ping</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">10.0</span><span>.20.43
</span><span>telnet </span><span class="token" style="color:rgb(247, 140, 108)">10.0</span><span>.20.43 </span><span class="token" style="color:rgb(247, 140, 108)">2700</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Verificar configuração</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">cat</span><span> db-config.js  </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Conferir VIAWEB_HOST e VIAWEB_PORT</span><span>
</span></code></pre></div>

---

### Problema: "Erro ao conectar SQL Server"

**Causa**: Credenciais incorretas ou banco indisponível

**Solução**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">bash</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-tz9yn4pkr" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-bash" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Executar teste de conexão</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">node</span><span> test-db.js
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Verificar credenciais em .env</span><span>
</span><span></span><span class="token" style="color:rgb(130, 170, 255)">cat</span><span> .env
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic"># Testar conectividade SQL</span><span>
</span><span>sqlcmd </span><span class="token parameter" style="color:rgb(214, 222, 235)">-S</span><span> localhost </span><span class="token parameter" style="color:rgb(214, 222, 235)">-U</span><span> sa </span><span class="token parameter" style="color:rgb(214, 222, 235)">-P</span><span> sua_senha
</span></code></pre></div>

---

### Problema: "Comando não recebe resposta"

**Causa**: Timeout ou equipamento offline

**Solução**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">javascript</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-7fc6uxg5n" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-javascript" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Aumentar timeout em server.js</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">TIMEOUT_COMANDO</span><span> </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(247, 140, 108)">300</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span> </span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// 300 segundos</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Verificar status do equipamento</span><span>
</span><span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Enviar comando &quot;status&quot; antes de armar/desarmar</span><span>
</span></code></pre></div>

---

### Problema: "Eventos não aparecem no frontend"

**Causa**: WebSocket desconectado ou ACK não enviado

**Solução**:
<div class="widget code-container remove-before-copy"><div class="code-header non-draggable"><span class="iaf s13 w700 code-language-placeholder">javascript</span><div class="code-copy-button"><span class="iaf s13 w500 code-copy-placeholder">Copiar</span><img class="code-copy-icon" src="data:image/svg+xml;utf8,%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M10.8%208.63V11.57C10.8%2014.02%209.82%2015%207.37%2015H4.43C1.98%2015%201%2014.02%201%2011.57V8.63C1%206.18%201.98%205.2%204.43%205.2H7.37C9.82%205.2%2010.8%206.18%2010.8%208.63Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M15%204.42999V7.36999C15%209.81999%2014.02%2010.8%2011.57%2010.8H10.8V8.62999C10.8%206.17999%209.81995%205.19999%207.36995%205.19999H5.19995V4.42999C5.19995%201.97999%206.17995%200.999992%208.62995%200.999992H11.57C14.02%200.999992%2015%201.97999%2015%204.42999Z%22%20stroke%3D%22%23717C92%22%20stroke-width%3D%221.05%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A" /></div></div><pre id="code-12mugbggt" style="color:white;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none;padding:8px;margin:8px;overflow:auto;background:#011627;width:calc(100% - 8px);border-radius:8px;box-shadow:0px 8px 18px 0px rgba(120, 120, 143, 0.10), 2px 2px 10px 0px rgba(255, 255, 255, 0.30) inset"><code class="language-javascript" style="white-space:pre;color:#d6deeb;font-family:Consolas, Monaco, &quot;Andale Mono&quot;, &quot;Ubuntu Mono&quot;, monospace;text-align:left;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;font-size:1em;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none"><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Verificar conexão WebSocket</span><span>
</span><span></span><span class="token console" style="color:rgb(255, 203, 139)">console</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">log</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(173, 219, 103)">&#x27;Clientes conectados:&#x27;</span><span class="token" style="color:rgb(199, 146, 234)">,</span><span> wss</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token property-access">clients</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token property-access">size</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span>
<span></span><span class="token" style="color:rgb(99, 119, 119);font-style:italic">// Garantir envio de ACK</span><span>
</span><span></span><span class="token" style="color:rgb(127, 219, 202)">function</span><span> </span><span class="token" style="color:rgb(130, 170, 255)">enviarACK</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token parameter">idEvento</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span>
</span><span>    </span><span class="token" style="color:rgb(127, 219, 202)">const</span><span> ack </span><span class="token" style="color:rgb(127, 219, 202)">=</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token literal-property" style="color:rgb(128, 203, 196)">resp</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">[</span><span class="token" style="color:rgb(199, 146, 234)">{</span><span> </span><span class="token literal-property" style="color:rgb(128, 203, 196)">id</span><span class="token" style="color:rgb(127, 219, 202)">:</span><span> idEvento </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">]</span><span> </span><span class="token" style="color:rgb(199, 146, 234)">}</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span>    socketViaweb</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">write</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token" style="color:rgb(130, 170, 255)">criptografar</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span class="token known-class-name" style="color:rgb(255, 203, 139)">JSON</span><span class="token" style="color:rgb(199, 146, 234)">.</span><span class="token method property-access" style="color:rgb(130, 170, 255)">stringify</span><span class="token" style="color:rgb(199, 146, 234)">(</span><span>ack</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">)</span><span class="token" style="color:rgb(199, 146, 234)">;</span><span>
</span><span></span><span class="token" style="color:rgb(199, 146, 234)">}</span><span>
</span></code></pre></div>

---

## 10. REFERÊNCIAS E DOCUMENTAÇÃO

### Documentação Oficial Viaweb

- Manual de Operação e Configuração do Viaweb Receiver
- Especificação do Protocolo TCP/IP Viaweb
- Códigos de Evento ContactID (ISO 8601)

### Documentação do Projeto

- `docs/API.md` — Referência completa da API REST
- `docs/PROTOCOLO_VIAWEB.md` — Detalhes do protocolo TCP
- `docs/FLUXOGRAMAS.md` — Diagramas de fluxo de dados

### Dependências Node.js

- **ws**: WebSocket server
- **express**: Framework REST
- **mssql**: Driver SQL Server
- **crypto**: Criptografia (built-in)
- **dotenv**: Variáveis de ambiente

---

## 📝 NOTAS IMPORTANTES

1. **Segurança**: Nunca commitar `.env` com credenciais reais no Git
2. **Backup**: Fazer backup regular do banco de dados SQL Server
3. **Logs**: Monitorar `logs/server.log` para diagnosticar problemas
4. **Atualizações**: Manter Node.js e dependências atualizadas
5. **Testes**: Executar `test-db.js` regularmente para validar conectividade

---

**Última atualização**: Janeiro 2026  
**Versão**: 1.0  
**Mantido por**: Equipe Viaweb Cotrijal
