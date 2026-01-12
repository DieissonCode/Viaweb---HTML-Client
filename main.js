// main.js - No ESM imports, uses global variables
const WS_HOST = window.location.hostname || 'localhost';
const WS_URL = `ws://${WS_HOST}:8090`;

const { CHAVE, IV, partitionNames, armDisarmCodes, falhaCodes, sistemaCodes, eventosDB } = window.ViawebConfig;
const VC = window.ViawebCommands || {};

const status = document.getElementById('status');
const clientNumber = document.getElementById('client-number');
const armButton = document.getElementById('arm-button');
const disarmButton = document.getElementById('disarm-button');
const partitionsList = document.getElementById('partitions-list');
const zonesColumns = document.getElementById('zones-columns');
const totalZones = document.getElementById('total-zones');
const autoUpdateCheckbox = document.getElementById('auto-update');
const unitSelect = document.getElementById('unit-select');
const unitSearch = document.getElementById('unit-search');
const closeEventModal = document.getElementById('closeEventModal');
const procedureText = document.getElementById('procedureText');
const confirmCloseEvent = document.getElementById('confirmCloseEvent');
const cancelCloseEvent = document.getElementById('cancelCloseEvent');
const eventsFilter = document.getElementById('events-filter');
const eventList = document.getElementById('eventList');
const alarmCount = document.getElementById('alarm-count');
const pendCount = document.getElementById('pend-count');
const togglePartitionsBtn = document.getElementById('toggle-partitions');
const toggleZonesBtn = document.getElementById('toggle-zones');
const armAllButton = document.getElementById('arm-all-button');
const disarmAllButton = document.getElementById('disarm-all-button');

// Status visual da central (online/offline)
let clientStatusEl = document.getElementById('client-status');
if (!clientStatusEl && clientNumber?.parentElement) {
    clientStatusEl = document.createElement('span');
    clientStatusEl.id = 'client-status';
    clientStatusEl.className = 'client-status';
    clientNumber.parentElement.appendChild(clientStatusEl);
}

// Bootstrap de usuário salvo antes de criar AuthManager
let currentUser = null;
let readOnly    = false;
(function bootstrapCurrentUserFromState() {
    try {
        const saved = sessionStorage.getItem('viawebState');
        if (saved) {
            const state = JSON.parse(saved);
            if (state && state.currentUser) {
                const norm = normalizeStoredUser(state.currentUser);
                if (norm) {
                    currentUser = norm;
                    window.currentUser = norm;
                    localStorage.setItem('currentUser', JSON.stringify(norm));
                    return;
                }
            }
        }
        const savedLocal = localStorage.getItem('currentUser');
        if (savedLocal) {
            const user = JSON.parse(savedLocal);
            const norm = normalizeStoredUser(user);
            if (norm) {
                currentUser = norm;
                window.currentUser = norm;
                localStorage.setItem('currentUser', JSON.stringify(norm));
            } else {
                localStorage.removeItem('currentUser');
            }
        }
    } catch (e) {
        console.warn('Auth bootstrap falhou:', e.message);
    }
})();

let unitStatus = null;
let unitStatusSince = null;

// Cache global de status por ISEP
// Map ISEP -> { status: 'online'|'offline', since: timestamp(ms) }
const statusCache = new Map();

// Dedup de eventos no front (TTL 5min)
const EVENT_DEDUPE_TTL = 5 * 60 * 1000;
const eventDedupeCache = new Map();
function pruneEventDedupeCache() {
    const now = Date.now();
    for (const [k, v] of eventDedupeCache.entries()) {
        if (!v || !v.ts || now - v.ts > EVENT_DEDUPE_TTL) eventDedupeCache.delete(k);
    }
}
function normalizeComplementoForDedupe(comp) {
    if (comp === undefined || comp === null || comp === '') return '0';
    const s = String(comp).trim();
    if (s === '-') return '0';
    return s;
}
function makeEventDedupeKey(cod, isep, comp, ts) {
    return `${cod}|${isep}|${normalizeComplementoForDedupe(comp)}|${ts}`;
}

// Bloqueio/desbloqueio de UI por autenticação (ou modo read‑only)
function setAuthLock(locked) {
    const ctrls = [
        unitSelect, unitSearch, autoUpdateCheckbox,
        armButton, disarmButton, armAllButton, disarmAllButton,
        togglePartitionsBtn, toggleZonesBtn, confirmCloseEvent, cancelCloseEvent
    ];
    ctrls.forEach(el => {
        if (el) el.disabled = locked;
    });

    // Desabilita checkboxes de partições e zonas
    document.querySelectorAll('#partitions-list input[type="checkbox"], #zones-columns input[type="checkbox"]')
        .forEach(cb => cb.disabled = locked);

    // Desabilita botões de abas
    document.querySelectorAll('.tab-btn')
        .forEach(btn => btn.disabled = locked);

}

setAuthLock(!currentUser);


function setUnitStatus(newStatus, sinceTs = null, isep = null) {
    const isChange = unitStatus !== newStatus || (sinceTs && unitStatusSince !== sinceTs);
    if (isChange) unitStatusSince = sinceTs || Date.now();
    unitStatus = newStatus;
    updateClientStatus();
    if (isep && isValidISEP(isep)) {
        const prev = statusCache.get(isep);
        if (!prev || prev.status !== newStatus || (sinceTs && prev.since !== sinceTs)) {
            statusCache.set(isep, { status: newStatus, since: unitStatusSince });
        }
    }
}

function updateClientStatus() {
    if (!clientStatusEl) return;
    const sinceStr = unitStatusSince ? ` — desde ${new Date(unitStatusSince).toLocaleString()}` : '';
    if (unitStatus === 'online') {
        clientStatusEl.textContent = `Online${sinceStr}`;
        clientStatusEl.classList.add('online');
        clientStatusEl.classList.remove('offline');
    } else if (unitStatus === 'offline') {
        clientStatusEl.textContent = `Offline${sinceStr}`;
        clientStatusEl.classList.add('offline');
        clientStatusEl.classList.remove('online');
    } else {
        clientStatusEl.textContent = '';
        clientStatusEl.classList.remove('online', 'offline');
    }
}

function clearPartitionsAndZones() {
    partitionsList.innerHTML = '';
    zonesColumns.innerHTML = '';
    totalZones.textContent = '0';
}

function applyCachedStatus(isep) {
    const cached = statusCache.get(isep);
    if (!cached) return;
    setUnitStatus(cached.status, cached.since, isep);
}

// Demais variáveis globais
let updateInterval;
const maxEvents = 300;
let allEvents = [];
let activeAlarms = new Map();
let activePendentes = new Map();
let selectedEvent = null;
let debounceTimeout;
let units = [];
let users = [];
let selectedPendingEvent = null;
let pendingCommands = new Map();
let currentClientId = null;
let ws = null;
let reconnectTimer = null;
const reconnectDelay = 3000;
let reconnectAttempts = 0;
const maxReconnectDelay = 30000;
let cryptoInstance = null;
let savedPartitions = [];
let savedZones = [];
let commandIdCounter = 0;
const COMMAND_ID_MOD = 1000;
const WS_BUFFER_LIMIT = 1024 * 1024;

let tooltipTimer = null;
let currentTooltip = null;

let eventsByLocal = new Map();
let eventsByCode = new Map();
let unitSelectDebounce = null;

const lockedEvents = new Map(); // eventKey -> { operador, lockedAt }
let lockKeepAliveInterval = null;

class DebouncedSelector { // Controller OO para debounce de seleção de unidade
    constructor(delayMs, onSelect) {
        this.delayMs = delayMs;
        this.onSelect = onSelect;
        this.timer = null;
    }

    schedule(value) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.onSelect(value), this.delayMs);
    }

    cancel() {
        clearTimeout(this.timer);
    }
}

// Helper: retorna todos eventos do mesmo ISEP a partir do horário do disparo
function getAssociatedEventsForAlarm(group) {
    if (!group || !group.first) return [];
    const local = group.first.local || group.first.clientId;
    const startTs = Number(group.first.timestamp) || 0;
    const seen = new Set();
    return allEvents
        .filter(ev =>
            (ev.local === local || ev.clientId === local) &&
            Number(ev.timestamp || 0) >= startTs
        )
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .filter(ev => {
            const key = `${ev.timestamp}-${ev.codigoEvento}-${ev.complemento}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

// Total de eventos associados a todos os disparos
function getTotalAlarmEvents() {
    let total = 0;
    activeAlarms.forEach(group => {
        const count = getAssociatedEventsForAlarm(group).length;
        total += count || 1; // garante pelo menos 1
    });
    return total;
}

class CloseEventModal {
    constructor() {
        this.container = document.getElementById('event-history');
        this.tbody = document.getElementById('event-history-body');
        this.titleEl = document.getElementById('closeEventTitle');
        this.badgeEl = document.getElementById('history-badge');
        this.modal = document.getElementById('closeEventModal');
        this.modalContent = this.modal?.querySelector('.modal-content');
        this.procedureText = document.getElementById('procedureText');
        this.currentEventKey = null;
    }

    async open(group, type) {
        selectedPendingEvent = { group, type };
        
        // Gera chave única do evento
        const ev = group?.first || {};
        const eventKey = `${ev.local}-${ev.codigoEvento}-${ev.complemento || 0}`;
        
        // Tenta adquirir lock
        const lockResult = await this.acquireLock(eventKey);
        
        if (!lockResult.success) {
            alert(`Este evento já está sendo atendido por: ${lockResult.lockedBy}\n\nAguarde o atendimento ser finalizado ou cancelado.`);
            selectedPendingEvent = null;
            return;
        }
        
        this.currentEventKey = eventKey;
        
        if (this.modal) {
            this.modal.style.display = 'block';
            if (this.modalContent) this.modalContent.scrollTop = 0;
        }
        this.render(group, type);
        this.procedureText?.focus();
        
        // Inicia keepalive do lock
        this.startLockKeepAlive();
    }

    async acquireLock(eventKey) {
        try {
            const resp = await fetch('/api/logs/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventKey,
                    operador: currentUser?.displayName || 'Anônimo'
                })
            });
            return await resp.json();
        } catch (err) {
            console.error('Erro ao adquirir lock:', err);
            return { success: false, error: 'Falha na comunicação' };
        }
    }

    async releaseLock() {
        if (!this.currentEventKey) return;
        
        try {
            await fetch('/api/logs/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventKey: this.currentEventKey,
                    operador: currentUser?.displayName || 'Anônimo'
                })
            });
        } catch (err) {
            console.error('Erro ao liberar lock:', err);
        }
        
        this.currentEventKey = null;
        this.stopLockKeepAlive();
    }

    startLockKeepAlive() {
        this.stopLockKeepAlive();
        
        // Renova lock a cada 30s
        lockKeepAliveInterval = setInterval(async () => {
            if (this.currentEventKey) {
                await this.acquireLock(this.currentEventKey);
            }
        }, 30000);
    }

    stopLockKeepAlive() {
        if (lockKeepAliveInterval) {
            clearInterval(lockKeepAliveInterval);
            lockKeepAliveInterval = null;
        }
    }

    close() {
        this.releaseLock();
        if (this.modal) this.modal.style.display = 'none';
        if (this.procedureText) this.procedureText.value = '';
        selectedPendingEvent = null;
    }

    render(group, type) {
        if (!this.container || !this.tbody) return;

        if (type !== 'alarm') {
            this.container.style.display = 'none';
            this.tbody.innerHTML = '';
            if (this.titleEl) this.titleEl.textContent = 'Encerrar Evento';
            if (this.badgeEl) this.badgeEl.textContent = '0 eventos';
            return;
        }

        this.container.style.display = 'block';
        if (this.titleEl) this.titleEl.textContent = 'Encerrar Disparo';

        const events = getAssociatedEventsForAlarm(group);
        if (this.badgeEl) this.badgeEl.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;

        this.tbody.innerHTML = '';
        if (events.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.textContent = 'Nenhum evento encontrado para este disparo.';
            tr.appendChild(td);
            this.tbody.appendChild(tr);
            return;
        }

        events.forEach(ev => {
            const tr = document.createElement('tr');
            const partName = getPartitionName(ev.particao, ev.clientId);
            const complemento = (ev.complemento !== undefined && ev.complemento !== null && ev.complemento !== '') ? ev.complemento : '-';
            tr.innerHTML = `
                <td>${ev.data}</td>
                <td>${ev.hora}</td>
                <td>${ev.descricao}</td>
                <td>${partName}</td>
                <td>${ev.codigoEvento}</td>
                <td>${complemento}</td>
                <td>${ev.local || ev.clientId || 'N/A'}</td>
            `;
            this.tbody.appendChild(tr);
        });
    }
}

const closeEventUI = new CloseEventModal();
let authManager = null;
document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();

    // Botão de login
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            authManager.show();
        });
    }

    // Atualiza visibilidade do botão e estado de bloqueio
    authManager.onAuthStateChanged = (user) => {
        if (loginBtn) {
            loginBtn.style.display = user ? 'none' : 'inline-flex';
        }
        setAuthLock(!user);
    };

    // Inicializa com o estado atual
    authManager.onAuthStateChanged(authManager.getCurrentUser());

    // Expondo globalmente
    window.authManager = authManager;
    window.currentUser = authManager.getCurrentUser();
});

// ---------- Índices e ingestão de eventos normalizados ----------
function updateSearchIndices(event) {
    if (!eventsByLocal.has(event.local)) eventsByLocal.set(event.local, []);
    eventsByLocal.get(event.local).push(event);
    if (!eventsByCode.has(event.codigoEvento)) eventsByCode.set(event.codigoEvento, []);
    eventsByCode.get(event.codigoEvento).push(event);
    if (eventsByLocal.get(event.local).length > maxEvents) eventsByLocal.get(event.local).shift();
    if (eventsByCode.get(event.codigoEvento).length > maxEvents) eventsByCode.get(event.codigoEvento).shift();
}

function ingestNormalizedEvent(ev) {
    allEvents.push(ev);
    updateSearchIndices(ev);

    if (allEvents.length > maxEvents) {
        const removed = allEvents.shift();
        const localEvents = eventsByLocal.get(removed.local);
        if (localEvents) {
            const idx = localEvents.indexOf(removed);
            if (idx > -1) localEvents.splice(idx, 1);
        }
        const codeEvents = eventsByCode.get(removed.codigoEvento);
        if (codeEvents) {
            const idx = codeEvents.indexOf(removed);
            if (idx > -1) codeEvents.splice(idx, 1);
        }
    }

    if (ev.codigoEvento === '1130') {
        const key = ev.local;
        if (!activeAlarms.has(key)) {
            activeAlarms.set(key, { first: ev, events: [] });
        } else {
            activeAlarms.get(key).events.push(ev);
        }
    }

    const isFalha = falhaCodes.includes(ev.codigoEvento);
    const isRestauro = ev.codigoEvento.startsWith('3') && sistemaCodes.includes(ev.codigoEvento);

    if (isFalha || isRestauro) {
        const zona = (ev.complemento !== '-' && ev.complemento !== '' && ev.complemento !== null && ev.complemento !== undefined)
            ? ev.complemento
            : 0;
        const key = `${ev.local}-${ev.codigoEvento}-${zona}`;
        if (isFalha) {
            if (!activePendentes.has(key)) activePendentes.set(key, { first: ev, events: [], resolved: false });
            activePendentes.get(key).events.push(ev);
        }
        if (isRestauro) {
            const falhaCod = ev.codigoEvento.replace(/^3/, '1');
            const falhaKey = `${ev.local}-${falhaCod}-${zona}`;
            if (activePendentes.has(falhaKey)) activePendentes.get(falhaKey).resolved = true;
        }
    }
}

// ---------- Normalização de evento recebido em tempo real ----------
function processEvent(data) {
    // data pode vir como {oper:[op]} ou op direto
    const msg = data.oper?.[0] || data;
    const cod = msg.codigoEvento || 'N/A';
    if (cod === "1412") return;

    const rawComplement = (msg.zonaUsuario !== undefined ? msg.zonaUsuario : msg.complemento);
    const hasComplemento = rawComplement !== undefined && rawComplement !== null;
    let zonaUsuario = hasComplemento ? Number(rawComplement) : 0;
    if (Number.isNaN(zonaUsuario)) zonaUsuario = 0;

    let id = (msg.id || '').replace(/-(evento|evento-)/g, '');
    const part = msg.particao || 1;
    const local = msg.isep || 'N/A';
    const clientId = msg.isep || msg.contaCliente || currentClientId;
    let ts = msg.recepcao || Date.now();
    if (ts < 10000000000) ts *= 1000;

    // Dedup em memória (front)
    pruneEventDedupeCache();
    const dedupeKey = makeEventDedupeKey(cod, clientId || local, zonaUsuario, ts);
    if (eventDedupeCache.has(dedupeKey)) {
        console.debug('[dedupe] evento ignorado (front):', dedupeKey);
        return;
    }
    eventDedupeCache.set(dedupeKey, { ts: Date.now() });

    const d = new Date(ts);
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const ano = d.getFullYear();
    const hora = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const seg = d.getSeconds().toString().padStart(2, '0');

    let desc = eventosDB[cod] || `Evento ${cod}`;
    if (desc.includes('{zona}')) desc = desc.replace('{zona}', zonaUsuario);

    const isArmDisarm = armDisarmCodes.includes(cod);

    if (zonaUsuario > 0) desc += ` - ${isArmDisarm ? '' : 'Sensor ' + zonaUsuario}`;

    let extraClass = '';
    if (cod === '1570') extraClass = 'inibida';

    const tipos = {
        0: '[Horário Programado]',
        1: '[Monitoramento]',
        2: '[Facilitador]',
        3: '[Senha de Uso Único]',
        4: '[Senha de Uso Único]',
        5: '[Senha de Uso Único]',
        6: '[TI - Manutenção]'
    };
    const appendTipo = (base, tipo) => {
        const baseTrim = (base || '').trimEnd();
        if (baseTrim.includes(tipo)) return baseTrim;
        return `${baseTrim} ${tipo}`.trim();
    };

    const baseDescricao = desc;
    let displayDesc = baseDescricao;
    let userName = null;
    let userId = null;
    let userMatricula = null;

    if (isArmDisarm && hasComplemento && window.UsersDB) {
        if (tipos[zonaUsuario]) {
            displayDesc = appendTipo(baseDescricao, tipos[zonaUsuario]);
        } else {
            displayDesc = `${baseDescricao.trimEnd()} Usuário Não Cadastrado | ${zonaUsuario}`;
        }

        const usersByIsep = window.UsersDB.getUsersByIsep(String(local)) || [];
        const userData = usersByIsep.find(u => Number(u.ID_USUARIO) === Number(zonaUsuario)) || null;

        if (userData && !tipos[zonaUsuario]) {
            userName = window.UsersDB.formatUserName(userData);
            userId = userData.ID_USUARIO || null;
            userMatricula = userData.matricula || null;
            displayDesc = `${baseDescricao}${userName}`;
        }
    }

    const complementoVal = hasComplemento ? zonaUsuario : 0;

    const ev = {
        id,
        local,
        data: `${dia}/${mes}/${ano}`,
        hora: `${hora}:${min}:${seg}`,
        complemento: complementoVal,
        particao: part,
        baseDescricao,
        descricao: displayDesc,
        codigoEvento: cod,
        clientId,
        timestamp: ts,
        extraClass,
        userId,
        userMatricula,
        userName
    };

    ingestNormalizedEvent(ev);
    updateEventList();

    updateCounts();
}

function hydrateEventFromDbRow(row) {
    let raw = {};
    try {
        raw = row.RawEvent ?  JSON.parse(row.RawEvent) : {};
    } catch (_) {
        raw = {};
    }
    const codigo = row.CodigoEvento || row.Codigo || raw.codigoEvento || raw.codigo || 'N/A';

    const timestamp = row.DataEvento ?  new Date(row.DataEvento).getTime() : (raw.timestamp || Date.now());
    const d = new Date(timestamp);
    const dia = d.getUTCDate().toString().padStart(2, '0');
    const mes = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const ano = d.getUTCFullYear();
    const hora = d.getUTCHours().toString().padStart(2, '0');
    const min = d.getUTCMinutes().toString().padStart(2, '0');
    const seg = d.getUTCSeconds().toString().padStart(2, '0');

    const complementoRaw = (row.Complemento !== undefined ?  row.Complemento : raw.complemento);
    const complementoDisplay = (complementoRaw === null || complementoRaw === undefined || complementoRaw === '') ? '0' : normalizeComplementoForDedupe(complementoRaw);
    const local = row.ISEP || row.Local || raw.local || raw.isep || raw.clientId || 'N/A';
    const particao = row.Particao || raw.particao || 1;

    const baseDesc = raw.descricao || row.Descricao || eventosDB[codigo] || `Evento ${codigo}`;
    const descFinal = (row.Descricao && row.Descricao.trim().length) ? row.Descricao : (raw.descricao || baseDesc);

    const userName = raw.userName || null;
    const userId = raw.userId || null;
    const userMatricula = raw.userMatricula || null;

    // Reconstrói descrição se for arm/disarm
    const armDisarmCodes = ['1401','1402','1403','1404','1405','1406','1407','1408','3401','3402','3403','3404','3405','3406','3407','3408'];
    const tipos = {
        0: '[Horário Programado]',
        1: '[Monitoramento]',
        2: '[Facilitador]',
        3: '[Senha de Uso Único]',
        4: '[Senha de Uso Único]',
        5: '[Senha de Uso Único]',
        6: '[TI - Manutenção]'
    };

    let finalDesc = descFinal;
    const complementoNum = Number(complementoDisplay) || 0;

    if (armDisarmCodes.includes(codigo) && window.UsersDB) {
        if (tipos[complementoNum]) {
            if (! finalDesc.includes(tipos[complementoNum])) {
                finalDesc = `${finalDesc.trimEnd()} ${tipos[complementoNum]}`;
            }
        } else if (! userName) {
            const usersByIsep = window.UsersDB.getUsersByIsep(String(local)) || [];
            const userData = usersByIsep.find(u => Number(u.ID_USUARIO) === complementoNum);
            if (userData) {
                finalDesc = `${baseDesc}${window.UsersDB.formatUserName(userData)}`;
            } else if (complementoNum > 6) {
                finalDesc = `${baseDesc.trimEnd()} Usuário ID ${complementoNum} Não Cadastrado`;
            }
        }
    }

    return {
        id: row.Id || raw.id || '',
        local,
        data: `${dia}/${mes}/${ano}`,
        hora: `${hora}:${min}:${seg}`,
        complemento: complementoDisplay,
        particao,
        baseDescricao: baseDesc,
        descricao: finalDesc,
        codigoEvento: codigo,
        clientId: local,
        timestamp,
        extraClass: raw.extraClass || '',
        userId,
        userMatricula,
        userName
    };
}

async function loadInitialHistory(limit = 300) {
    try {
        const resp = await fetch(`/api/logs/events?limit=${limit}`);
        const data = await resp.json();
        if (!data.success || !Array.isArray(data.data)) {
            console.warn('⚠️ Histórico não carregado: resposta inválida');
            return;
        }

        // Limpa estruturas antes de hidratar
        allEvents = [];
        activeAlarms = new Map();
        activePendentes = new Map();
        eventsByLocal = new Map();
        eventsByCode = new Map();

        const rows = data.data;
        // Processa em ordem cronológica (mais antigos primeiro)
        const ordered = [...rows].reverse().map(hydrateEventFromDbRow);
        ordered.forEach(ev => ingestNormalizedEvent(ev));

        updateEventList();
        updateCounts();
    } catch (err) {
        console.error('❌ Erro ao carregar histórico inicial:', err);
    }
}

// ---------- Funções auxiliares já existentes ----------
function generateCommandId() {
    const timestamp = Date.now();
    commandIdCounter = (commandIdCounter + 1) % COMMAND_ID_MOD;
    return timestamp * 1000 + commandIdCounter;
}

function isValidISEP(idISEP) {
    if (VC.isValidISEP) return VC.isValidISEP(idISEP);
    if (!idISEP) return false;
    const formatted = String(idISEP).trim().toUpperCase().padStart(4, '0');
    return /^[0-9A-F]{4}$/.test(formatted);
}

(async () => {
    try { 
        units = await window.getUnits(); 
        populateUnitSelect(); 
    } catch (err) { 
        console.error('❌ Erro ao carregar unidades:', err); 
        unitSelect.innerHTML = 'Erro ao carregar unidades'; 
    }
    
    try { 
        await window.UsersDB.getUsers(); 
        console.log('✅ Usuários carregados antes do histórico');
    } catch (err) { 
        console.error('❌ Erro ao carregar usuários:', err); 
    }
    
    // Só carrega histórico DEPOIS dos usuários
    loadInitialHistory(300);
})();

const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') { document.body.classList.add('light-mode'); themeToggle.textContent = '🌙'; }
else { themeToggle.textContent = '☀️'; }
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) { themeToggle.textContent = '🌙'; localStorage.setItem('theme', 'light'); }
    else { themeToggle.textContent = '☀️'; localStorage.setItem('theme', 'dark'); }
});

function setupToggle(headerId, contentId) {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    if (header && content) {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupToggle('control-header', 'control-content');
    setupToggle('events-header', 'events-content');
});

function populateUnitSelect() {
    unitSelect.innerHTML = '';
    units.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.value;
        opt.textContent = `${u.local} (${u.value})`;
        unitSelect.appendChild(opt);
    });
}

async function initCrypto() { cryptoInstance = new window.ViawebCrypto(CHAVE, IV); }

function sanitizeUsername(raw = '') {
    return String(raw).trim().replace(/@.*/i, ''); // remove tudo após @
}

function normalizeStoredUser(user) {
    if (!user) return null;
    const base = sanitizeUsername(user.username || user.displayName || '');
    if (!base) return null;
    return {
        ...user,
        username: base,
        displayName: `${base}@Cotrijal`
    };
}

function getPartitionName(pos, clientId) {
    const name = partitionNames[pos] || "";
    return name ? `[ ${pos} ] - ${name}` : pos;
}

function updatePartitions(data) {
    savedPartitions = getSelectedPartitions();
    partitionsList.innerHTML = '';
    data.forEach(p => {
        const statusText = p.armado == 1 ? 'Armada' : 'Desarmada';
        const statusCls = p.armado == 1 ? 'armado' : 'desarmado';
        const name = getPartitionName(p.pos, currentClientId);

        const div = document.createElement('div');
        div.className = 'partition-item';
        div.innerHTML = `
            <input type="checkbox" id="partition-${p.pos}" value="${p.pos}">
            <span class="partition-status ${statusCls}">${statusText}</span>
            <label for="partition-${p.pos}">${name}</label>
        `;
        partitionsList.appendChild(div);

        if (savedPartitions.includes(p.pos)) {
            const cb = document.getElementById(`partition-${p.pos}`);
            if (cb) cb.checked = true;
        }
    });
}

function updateZones(data) {
    savedZones = getSelectedZones();
    totalZones.textContent = data.length;
    zonesColumns.innerHTML = '';

    const perCol = 8;
    const cols = Math.ceil(data.length / perCol);

    for (let c = 0; c < cols; c++) {
        const colDiv = document.createElement('div');
        const start = c * perCol;
        const end = Math.min(start + perCol, data.length);

        for (let i = start; i < end; i++) {
            const z = data[i];
            const txt = z.inibida ? "Inibido"
                : z.excluida ? "Excluído"
                : z.aberta ? "Aberto"
                : z.tamper ? "Tamper"
                : z.disparada ? "Disparado"
                : "OK";
            const cls = z.inibida ? "inibido"
                : z.excluida ? "excluido"
                : (z.aberta || z.disparada) ? "aberto"
                : z.tamper ? "tamper"
                : "ok";
            const num = String(z.pos).padStart(2, '0');

            const div = document.createElement('div');
            div.className = 'zone-item';
            div.innerHTML = `
                <input type="checkbox" id="zone-${z.pos}" value="${z.pos}">
                <span class="zone-status ${cls}">${txt}</span>
                <label for="zone-${z.pos}">Sensor ${num}: ${txt}</label>
            `;
            colDiv.appendChild(div);
        }
        zonesColumns.appendChild(colDiv);
    }

    savedZones.forEach(zoneNum => {
        const checkbox = document.getElementById(`zone-${zoneNum}`);
        if (checkbox) checkbox.checked = true;
    });
}

// ---------- Contadores ----------
function updateCounts() {
    if (alarmCount) alarmCount.textContent = activeAlarms.size; // Disparos distintos por ISEP
    if (pendCount) pendCount.textContent = Array.from(activePendentes.values()).filter(g => !g.resolved).length;
}

window.updateCounts = updateCounts;

// ---------- Filtro ----------
function filterEvents(term) {
    const rows = eventList.querySelectorAll('.event-row');
    const lowerTerm = term.toLowerCase();
    if (term && !term.includes(' ')) {
        const upperTerm = term.toUpperCase();
        if (eventsByLocal.has(upperTerm) || eventsByCode.has(upperTerm)) {
            rows.forEach(row => {
                const localCell = row.cells[0]?.textContent || '';
                row.style.display = localCell.toUpperCase().includes(upperTerm) ? '' : 'none';
            });
            return;
        }
    }
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(lowerTerm) ? '' : 'none';
    });
}

// ---------- Render de lista ----------
function updateEventList() {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const filterTerm = eventsFilter.value.toLowerCase();
    eventList.innerHTML = '';

    let sourceEvents = [];
    if (currentTab === 'all') sourceEvents = allEvents;
    else if (currentTab === 'alarms') activeAlarms.forEach(group => sourceEvents.push({ group, type: 'alarm' }));
    else if (currentTab === 'pendentes') activePendentes.forEach(group => { if (!group.resolved) sourceEvents.push({ group, type: 'pendente' }); });
    else if (currentTab === 'sistema') sourceEvents = allEvents.filter(ev => sistemaCodes.includes(ev.codigoEvento));
    else if (currentTab === 'usuarios') sourceEvents = allEvents.filter(ev => armDisarmCodes.includes(ev.codigoEvento));
    else if (currentTab === 'historico') sourceEvents = allEvents;

    let filtered = sourceEvents.slice(-300);
    if (filterTerm) {
        filtered = filtered.filter(item => {
            const ev = item.group ? item.group.first : item;
            const text = `${ev.local} ${ev.descricao} ${ev.data} ${ev.hora} ${ev.complemento}`.toLowerCase();
            return text.includes(filterTerm);
        });
    }

    const maxDisplayEvents = 100;
    const displayEvents = filtered.slice(-maxDisplayEvents).reverse();

    const tipos = {
        0: '[Horário Programado]',
        1: '[Monitoramento]',
        2: '[Facilitador]',
        3: '[Senha de Uso Único]',
        4: '[Senha de Uso Único]',
        5: '[Senha de Uso Único]',
        6: '[TI - Manutenção]'
    };
    const appendTipo = (base, tipo) => {
        const baseTrim = (base || '').trimEnd();
        if (baseTrim.includes(tipo)) return baseTrim;
        return `${baseTrim} ${tipo}`.trim();
    };

    displayEvents.forEach(item => {
        let ev, count = 1;
        if (item.group) {
            ev = item.group.first;
            count = getAssociatedEventsForAlarm(item.group).length;
        } else {
            ev = item;
        }

        const tr = eventList.insertRow();
        tr.className = `event-row ${ev.extraClass || ''}`;
        const cod = ev.codigoEvento;
        const isArmDisarmCode = armDisarmCodes.includes(cod);
        const eventKey = `${ev.local}-${ev.codigoEvento}-${ev.complemento || 0}`;
        const lockInfo = lockedEvents.get(eventKey);

        if (lockInfo) {
            tr.classList.add('event-locked');
            tr.title = `Em atendimento por: ${lockInfo.operador}`;
        }

        if (cod === '1130') tr.classList.add('alarm');
        else if (cod === '1AA6' || cod === 'EAA6') tr.classList.add('offline');
        else if (cod === '3AA6') tr.classList.add('online');
        else if (cod.startsWith('3')) tr.classList.add('restauro');
        else if (falhaCodes.includes(cod)) tr.classList.add('falha');
        else if (isArmDisarmCode) tr.classList.add('armedisarm');
        else if (cod.startsWith('16')) tr.classList.add('teste');

        const partName = getPartitionName(ev.particao, ev.clientId);
        const descBase = ev.baseDescricao || ev.descricao || '';
        let desc = descBase;
        if (count > 1) desc += ` (${count} eventos)`;

        const complemento = ev.complemento;
        let userData = null;

        const shouldRebuildDesc =
            isArmDisarmCode &&
            complemento !== '-' &&
            complemento !== '' &&
            complemento !== null &&
            complemento !== undefined &&
            complemento !== 0 &&
            complemento !== '0' &&
            !ev.userName &&
            !(tipos[Number(complemento)] && descBase.includes(tipos[Number(complemento)]));

        if (shouldRebuildDesc) {
            const zonaUsuario = Number(complemento);
            if (ev.userName) {
                desc = `${descBase}${ev.userName}${count > 1 ? ` (${count} eventos)` : ''}`;
            } else if (tipos[zonaUsuario]) {
                desc = `${appendTipo(descBase, tipos[zonaUsuario])}${count > 1 ? ` (${count} eventos)` : ''}`;
            } else {
                desc = `${descBase.trimEnd()} Usuário Não Cadastrado | ${complemento}${count > 1 ? ` (${count} eventos)` : ''}`;
            }
            const usersByIsep = window.UsersDB.getUsersByIsep(String(ev.local || ev.clientId)) || [];
            userData = usersByIsep.find(u => Number(u.ID_USUARIO) === Number(zonaUsuario)) || null;
        } else if (isArmDisarmCode && complemento !== '-' && complemento !== '' && complemento !== null && complemento !== undefined) {
            // mantém descrição original e ainda tenta tooltip se for possível
            const zonaUsuario = Number(complemento);
            const usersByIsep = window.UsersDB.getUsersByIsep(String(ev.local || ev.clientId)) || [];
            userData = usersByIsep.find(u => Number(u.ID_USUARIO) === Number(zonaUsuario)) || null;
        }

        tr.innerHTML = `<td>${ev.local || 'N/A'}</td><td>${ev.data}</td><td>${ev.hora}</td><td>${complemento}</td><td>${partName}</td><td>${desc}${lockInfo ? ' 🔒' : ''}</td>`;

        if (userData) {
            let hoverTimer = null;
            tr.addEventListener('mouseenter', () => {
                hoverTimer = setTimeout(() => { showTooltip(tr, userData); }, 2000);
            });
            tr.addEventListener('mouseleave', () => {
                if (hoverTimer) clearTimeout(hoverTimer);
                hideTooltip();
            });
        }

       tr.style.cursor = lockInfo ? 'not-allowed' : 'pointer';
        tr.onclick = () => {
            if (lockInfo && lockInfo.operador !== (currentUser?.displayName || 'Anônimo')) {
                alert(`Este evento está sendo atendido por:\n${lockInfo.operador}\n\nAguarde o atendimento ser finalizado.`);
                return;
            }
            if (item.group) openCloseModal(item.group, item.type);
            else selectClientFromEvent(ev);
        };
    });

    if (filtered.length > maxDisplayEvents) {
        const infoRow = eventList.insertRow(0);
        infoRow.className = 'event-info';
        infoRow.innerHTML = `<td>
            Mostrando últimos ${maxDisplayEvents} de ${filtered.length} eventos. Use o filtro para refinar a busca.
        </td>`;
    }
}

// ---------- Modal e tooltip ----------
function openCloseModal(group, type) {
    closeEventUI.open(group, type);
}

function showTooltip(element, userData) {
    hideTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'user-tooltip';
    tooltip.textContent = window.UsersDB.formatUserInfo(userData);
    const rect = element.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    tooltip.style.zIndex = '10000';
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;
}

function hideTooltip() {
    if (currentTooltip) currentTooltip.remove();
    currentTooltip = null;
}

// ---------- Seleção de cliente ----------
function selectClientFromEvent(ev) {
    if (!currentUser) {
        authManager?.show?.();
        return;
    }
    const isep = ev.local || ev.clientId;
    if (!isep) return;
    unitSearch.value = '';
    populateUnitSelect();
    const unit = units.find(u => String(u.value) === String(isep));
    if (unit) {
        unitSelect.value = unit.value;
        unitSelect.dispatchEvent(new Event('change'));
        const controlHeader = document.getElementById('control-header');
        const controlContent = document.getElementById('control-content');
        if (controlHeader.classList.contains('collapsed')) { controlHeader.classList.remove('collapsed'); controlContent.classList.remove('collapsed'); }
        document.getElementById('control-panel-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        alert(`Cliente ${isep} não encontrado na lista de unidades`);
    }
}

// ---------- Envio de comandos ----------
function sendCommand(data) {
    if (!currentUser) {
        console.warn('❌ Comando bloqueado: usuário não autenticado');
        authManager?.show?.();
        return false;
    }

    // ---- NOVO BLOQUEIO ----
    if (readOnly) {
        console.warn('❌ Comando bloqueado: sessão somente‑leitura');
        // Opcional: exibir toast/alert rápido
        alert('⚠️ Você está em modo somente‑leitura e não pode enviar comandos.');
        return false;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('❌ WebSocket não conectado');
        return false;
    }
    if (ws.bufferedAmount > WS_BUFFER_LIMIT) {
        console.error('❌ Buffer WebSocket cheio, aguardando...');
        return false;
    }
    try {
        ws.send(JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('❌ Erro ao enviar:', e);
        return false;
    }
}

function getSelectedPartitions() {
    return Array.from(partitionsList.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
}

function getSelectedZones() {
    return Array.from(zonesColumns.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
}

function armarParticoes(idISEP, particoes, zonas) {
    if (!isValidISEP(idISEP)) { alert('ID ISEP inválido. Deve ter 4 dígitos hexadecimais.'); return; }
    if (!particoes || particoes.length === 0) { alert('Selecione ao menos uma partição'); return; }
    const cmdId = generateCommandId();
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    const cmd = VC.armPartitionsCommand
        ? VC.armPartitionsCommand(isepFormatted, particoes, zonas, 8790, cmdId)
        : { oper: [{ acao: "executar", idISEP: isepFormatted, id: cmdId, comando: [{ cmd: "armar", password: 8790, inibir: zonas.length ? zonas : undefined, particoes }] }] };
    pendingCommands.set(cmdId, () => fetchPartitionsAndZones(idISEP));
    sendCommand(cmd);
}

function desarmarParticoes(idISEP, particoes) {
    if (!isValidISEP(idISEP)) { alert('ID ISEP inválido. Deve ter 4 dígitos hexadecimais.'); return; }
    if (!particoes || particoes.length === 0) { alert('Selecione ao menos uma partição'); return; }
    const cmdId = generateCommandId();
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    const cmd = VC.disarmPartitionsCommand
        ? VC.disarmPartitionsCommand(isepFormatted, particoes, 8790, cmdId)
        : { oper: [{ acao: "executar", idISEP: isepFormatted, id: cmdId, comando: [{ cmd: "desarmar", password: 8790, particoes }] }] };
    pendingCommands.set(cmdId, () => fetchPartitionsAndZones(idISEP));
    sendCommand(cmd);
    setTimeout(() => fetchPartitionsAndZones(idISEP), 5000);
}

function fetchPartitionsAndZones(idISEP) {
    if (!isValidISEP(idISEP)) { console.error('❌ ISEP inválido:', idISEP); return; }
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    const id1 = generateCommandId();
    const id2 = generateCommandId();
    pendingCommands.set(id1, resp => handlePartitionsResponse(resp));
    pendingCommands.set(id2, resp => handleZonesResponse(resp));

    const cmd1 = VC.getPartitionsCommand ? VC.getPartitionsCommand(isepFormatted, id1) : { oper: [{ acao: "executar", idISEP: isepFormatted, id: id1, comando: [{ cmd: "particoes" }] }] };
    const cmd2 = VC.getZonesCommand ? VC.getZonesCommand(isepFormatted, id2) : { oper: [{ acao: "executar", idISEP: isepFormatted, id: id2, comando: [{ cmd: "zonas" }] }] };

    sendCommand(cmd1);
    sendCommand(cmd2);
}

function fetchAllClientStatuses() {
    const cmdId = generateCommandId();
    pendingCommands.set(cmdId, resp => handleListarClientesAllResponse(resp));
    const cmd = VC.createListarClientesCommand ? VC.createListarClientesCommand(undefined, cmdId) : { oper: [{ id: cmdId, acao: "listarClientes" }] };
    sendCommand(cmd);
}

function fetchClientStatus(idISEP) {
    if (!isValidISEP(idISEP)) { console.error('❌ ISEP inválido para listarClientes:', idISEP); return; }
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    const cmdId = generateCommandId();
    pendingCommands.set(cmdId, resp => handleListarClientesResponse(resp, isepFormatted));
    const cmd = VC.createListarClientesCommand
        ? VC.createListarClientesCommand([isepFormatted], cmdId)
        : { oper: [{ id: cmdId, acao: "listarClientes", idISEP: [isepFormatted] }] };
    sendCommand(cmd);
}

function handlePartitionsResponse(resp) {
    const data = resp?.resposta;
    if (!data || data.length === 0) return;
    if (data[0]?.cmd === 'erro') {
        setUnitStatus('offline', null, currentClientId);
        return;
    }
    updatePartitions(data);
    setUnitStatus('online', null, currentClientId);
}

function handleZonesResponse(resp) {
    const data = resp?.resposta;
    if (!data || data.length === 0) return;
    if (data[0]?.cmd === 'erro') {
        setUnitStatus('offline', null, currentClientId);
        return;
    }
    updateZones(data);
    setUnitStatus('online', null, currentClientId);
}

function applyStatusFromViaweb(viawebArr) {
    viawebArr.forEach(vw => {
        (vw.cliente || []).forEach(cli => {
            const isep = String(cli.idISEP || '').toUpperCase();
            if (!isValidISEP(isep)) return;

            let latestTs = null;
            let latestIsOnline = null;
            const meios = Array.isArray(cli.meio) ? cli.meio : [];
            meios.forEach(m => {
                const onTs = m?.online ? Number(m.online) * 1000 : null;
                const offTs = m?.offline ? Number(m.offline) * 1000 : null;
                if (onTs && (latestTs === null || onTs > latestTs)) { latestTs = onTs; latestIsOnline = true; }
                if (offTs && (latestTs === null || offTs > latestTs)) { latestTs = offTs; latestIsOnline = false; }
            });

            if (latestTs === null) {
                if (cli.online === 1) latestIsOnline = true;
                else if (cli.online === 0) latestIsOnline = false;
                latestTs = Date.now();
            }

            const prev = statusCache.get(isep);
            if (!prev || prev.since < latestTs || prev.status !== (latestIsOnline ? 'online' : 'offline')) {
                statusCache.set(isep, { status: latestIsOnline ? 'online' : 'offline', since: latestTs });
                if (currentClientId && String(currentClientId).toUpperCase() === isep) {
                    setUnitStatus(latestIsOnline ? 'online' : 'offline', latestTs, isep);
                }
            }
        });
    });
}

function handleListarClientesAllResponse(resp) {
    if (resp?.erro) { console.warn('listarClientes ALL erro:', resp.descricao || resp.erro); return; }
    const viawebArr = resp?.viaweb;
    if (!viawebArr || !Array.isArray(viawebArr)) return;
    applyStatusFromViaweb(viawebArr);
}

function handleListarClientesResponse(resp, isepFormatted) {
    if (resp?.erro) { console.warn('listarClientes erro:', resp.descricao || resp.erro); return; }
    const viawebArr = resp?.viaweb;
    if (!viawebArr || !Array.isArray(viawebArr)) return;
    applyStatusFromViaweb(viawebArr.filter(vw =>
        (vw.cliente || []).some(cli => String(cli.idISEP).toUpperCase() === isepFormatted.toUpperCase())
    ));
}

function updateStatus(connected) {
    status.classList.toggle('connected', connected);
    status.classList.toggle('disconnected', !connected);
    status.title = connected ? 'Conectado' : 'Desconectado';
    document.getElementById('status-text').textContent = 'Viaweb - Cotrijal';
}

function applyUnitSelection(val) { // Aplica a seleção de unidade (era o corpo do listener antigo)
    if (!currentUser) {
        authManager?.show?.();
        return;
    }
    const unit = units.find(u => String(u.value) === String(val));
    if (unit) {
        selectedEvent = { idISEP: String(unit.value) };
        currentClientId = String(unit.value);
        clientNumber.textContent = unit.local || unit.label;

        applyCachedStatus(String(unit.value).toUpperCase());

        const cached = statusCache.get(String(unit.value).toUpperCase());
        if (cached && cached.status === 'offline') {
            clearPartitionsAndZones();
        }

        armButton.disabled = false;
        disarmButton.disabled = false;
        armAllButton.disabled = false;
        disarmAllButton.disabled = false;
        togglePartitionsBtn.disabled = false;
        toggleZonesBtn.disabled = false;

        fetchPartitionsAndZones(String(unit.value));
        fetchClientStatus(String(unit.value));
        if (autoUpdateCheckbox.checked) {
            clearInterval(updateInterval);
            updateInterval = setInterval(() => {
                fetchPartitionsAndZones(String(unit.value));
                fetchClientStatus(String(unit.value));
            }, 30000);
        }
    } else {
        selectedEvent = null;
        currentClientId = null;
        clientNumber.textContent = "Nenhum selecionado";
        setUnitStatus(null);
        armButton.disabled = true;
        disarmButton.disabled = true;
        armAllButton.disabled = true;
        disarmAllButton.disabled = true;
        togglePartitionsBtn.disabled = true;
        toggleZonesBtn.disabled = true;
        clearPartitionsAndZones();
        clearInterval(updateInterval);
    }
}

function parseJsonStream(raw) {
    if (typeof raw !== 'string') return [];
    const out = [];
    raw.split(/\u0001+/g).forEach(chunk => {
        const s = chunk.trim();
        if (!s) return;
        const idx = s.search(/[{\[]/);
        if (idx === -1) return;
        const candidate = s.slice(idx);
        try {
            out.push(JSON.parse(candidate));
        } catch (e) {
            // silencioso
        }
    });
    return out;
}

function connectWebSocket() {
    if (ws) ws.close();
    ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';

    ws.onopen = async () => {
        clearTimeout(reconnectTimer);
        reconnectAttempts = 0;
        updateStatus(true);
        armButton.disabled = disarmButton.disabled = true;
        fetchAllClientStatuses();
    };

    ws.onmessage = async (event) => {
        try {
            const raw = typeof event.data === 'string' ? event.data : '';
            const payloads = raw ? parseJsonStream(raw) : [JSON.parse(event.data)];
            payloads.forEach(data => {
                // ========== NOVO: Processa notificações ==========
                if (data.type === 'closure') {
                    handleClosureNotification(data);
                    return;
                }
                
                if (data.type === 'event_locked') {
                    handleEventLocked(data);
                    return;
                }
                
                if (data.type === 'event_unlocked') {
                    handleEventUnlocked(data);
                    return;
              }
                if (data.oper && Array.isArray(data.oper)) {
                    for (const op of data.oper) {
                        if (op.acao === 'evento') {
                            processEvent({ oper: [op] });
                        } else if (op.resp && Array.isArray(op.resp)) {
                            op.resp.forEach(r => {
                                if (pendingCommands.has(r.id)) {
                                    pendingCommands.get(r.id)(r);
                                    pendingCommands.delete(r.id);
                                }
                            });
                        }
                    }
                    return;
                }
                if (data.resp && Array.isArray(data.resp)) {
                    data.resp.forEach(r => {
                        if (pendingCommands.has(r.id)) {
                            pendingCommands.get(r.id)(r);
                            pendingCommands.delete(r.id);
                        }
                    });
                }
            });
        } catch (e) { console.error('[WS] Erro ao processar mensagem:', e); }
    };

    ws.onclose = () => {
        updateStatus(false);
        armButton.disabled = disarmButton.disabled = true;
        clearPartitionsAndZones();
        cryptoInstance = null;
        setUnitStatus('offline', null, currentClientId);
        reconnectAttempts++;
        const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttempts - 1), maxReconnectDelay);
        reconnectTimer = setTimeout(connectWebSocket, delay);
    };

    ws.onerror = (e) => console.error('[WS] Erro WS:', e);
}

unitSelect.addEventListener('change', () => {
    if (!unitSelectDebounce) {
        unitSelectDebounce = new DebouncedSelector(300, applyUnitSelection);
    }
    unitSelectDebounce.schedule(unitSelect.value);
});

unitSearch.addEventListener('input', e => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        const term = e.target.value.toLowerCase();
        unitSelect.innerHTML = '';
        units.filter(u => (u.local||'').toLowerCase().includes(term) || (u.value||'').includes(term) || (u.sigla||'').toLowerCase().includes(term))
             .forEach(u => {
                 const opt = document.createElement('option');
                 opt.value = u.value;
                 opt.textContent = `${u.local} (${u.value})`;
                 unitSelect.appendChild(opt);
             });
    }, 300);
});

armButton.addEventListener('click', () => selectedEvent && getSelectedPartitions().length ? armarParticoes(selectedEvent.idISEP, getSelectedPartitions(), getSelectedZones()) : alert('Selecione partição'));
disarmButton.addEventListener('click', () => selectedEvent && getSelectedPartitions().length ? desarmarParticoes(selectedEvent.idISEP, getSelectedPartitions()) : alert('Selecione partição'));

autoUpdateCheckbox.addEventListener('change', () => {
    if (autoUpdateCheckbox.checked && selectedEvent) {
        updateInterval = setInterval(() => {
            fetchPartitionsAndZones(selectedEvent.idISEP);
            fetchClientStatus(selectedEvent.idISEP);
        }, 30000);
    } else clearInterval(updateInterval);
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateEventList();
    });
});
eventsFilter.addEventListener('input', () => updateEventList());

async function logClosureToServer(group, type, procedureText) {
    const ev = group?.first || {};
    const codigo = ev.codigoEvento || ev.codigo || ev.code || '';
    
    // ✅ CORRIGIDO: Garante timestamp válido
    let timestamp = ev.timestamp;
    if (!timestamp || timestamp === null || timestamp === undefined || isNaN(Number(timestamp))) {
        console.warn('⚠️ Timestamp inválido no evento:', {
            timestampRecebido: timestamp,
            eventoCompleto: ev
        });
        timestamp = Date.now();
    }
    
    // Converte para número e valida
    timestamp = Number(timestamp);
    if (isNaN(timestamp) || !isFinite(timestamp) || timestamp <= 0) {
        console.warn('⚠️ Timestamp não conversível, usando Date.now()');
        timestamp = Date.now();
    }
    
    console.log('📤 Enviando encerramento:', {
        codigo,
        isep: ev.local || ev.isep,
        complemento: ev.complemento,
        timestamp,
        timestampFormatado: new Date(timestamp).toLocaleString()
    });
    
    const payload = {
        event: {
            codigoEvento: codigo,
            codigo,
            complemento: ev.complemento ?? '',
            particao: ev.particao ?? '1',
            local: ev.local ?? '',
            isep: ev.local || ev.isep || ev.clientId || '',
            clientId: ev.clientId ?? '',
            descricao: ev.descricao ?? '',
            timestamp: timestamp // Garante número válido
        },
        closure: {
            type,
            procedureText,
            user: window.currentUser || null
        }
    };

    const resp = await fetch('/api/logs/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    const text = await resp.text();
    let data = {};
    try { 
        data = JSON.parse(text); 
    } catch (_) {
        console.error('❌ Resposta não é JSON válido:', text);
    }
    
    if (!resp.ok || data.success === false) {
        throw new Error(data.error || text || 'Falha ao salvar encerramento');
    }
    
    console.log('✅ Encerramento salvo com sucesso');
}

// Handler de encerramento
confirmCloseEvent.onclick = async () => {
    if (selectedPendingEvent) {
        const { group, type } = selectedPendingEvent;

        try {
            await logClosureToServer(group, type, procedureText.value || '');
        } catch (err) {
            console.error('❌ Registrar encerramento:', err);
            alert('Não foi possível registrar o encerramento no servidor. O evento permanece aberto.\n\nDetalhes: ' + err.message);
            return;
        }

        // Remove localmente (a notificação WS vai sincronizar outros clientes)
        if (type === 'alarm') {
            activeAlarms.delete(group.first.local);
        } else {
            const key = `${group.first.local}-${group.first.codigoEvento}-${group.first.complemento}`;
            activePendentes.delete(key);
        }
        
        updateCounts();
        updateEventList();
        closeEventUI.close();
    }
};

cancelCloseEvent.onclick = () => {
    closeEventUI.close();
};

togglePartitionsBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#partitions-list input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    if (allChecked) { checkboxes.forEach(cb => cb.checked = false); togglePartitionsBtn.innerHTML = '☑️ Todas'; }
    else { checkboxes.forEach(cb => cb.checked = true); togglePartitionsBtn.innerHTML = '☐ Nenhuma'; }
});

toggleZonesBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#zones-columns input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    if (allChecked) { checkboxes.forEach(cb => cb.checked = false); toggleZonesBtn.innerHTML = '☑️ Todas'; }
    else { checkboxes.forEach(cb => cb.checked = true); toggleZonesBtn.innerHTML = '☐ Nenhuma'; }
});

armAllButton.addEventListener('click', () => {
    if (!selectedEvent) { alert('Selecione uma unidade primeiro'); return; }
    document.querySelectorAll('#partitions-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    const partitions = getSelectedPartitions();
    const zones = getSelectedZones();
    if (partitions.length === 0) { alert('Nenhuma partição disponível'); return; }
    if (confirm(`Armar ${partitions.length} partição(ões)?`)) {
        armarParticoes(selectedEvent.idISEP, partitions, zones);
    }
});

disarmAllButton.addEventListener('click', () => {
    if (!selectedEvent) { alert('Selecione uma unidade primeiro'); return; }
    document.querySelectorAll('#partitions-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    const partitions = getSelectedPartitions();
    if (partitions.length === 0) { alert('Nenhuma partição disponível'); return; }
    if (confirm(`Desarmar ${partitions.length} partição(ões)?`)) {
        desarmarParticoes(selectedEvent.idISEP, partitions);
    }
});

function handleClosureNotification(data) {
    const { isep, codigo, complemento, closedBy } = data;
    
    console.log('🔔 Encerramento recebido:', { isep, codigo, complemento, closedBy });

    const myUsername = currentUser?.username || currentUser?.displayName;
    const isMyOwnClosure = closedBy && myUsername && 
        (closedBy === myUsername || closedBy === currentUser?.displayName);

    if (codigo === '1130') {
        if (activeAlarms.has(isep)) {
            console.log(`✅ Removendo alarme ${isep} da lista`);
            activeAlarms.delete(isep);
        }
    }

    const key = `${isep}-${codigo}-${complemento || 0}`;
    if (activePendentes.has(key)) {
        console.log(`✅ Removendo pendente ${key} da lista`);
        activePendentes.delete(key);
    }
    
    // Se estava com modal aberto para este evento e NÃO foi eu que encerrei, avisa
    if (selectedPendingEvent && !isMyOwnClosure) {
        const ev = selectedPendingEvent.group?.first;
        if (ev && ev.local === isep && ev.codigoEvento === codigo) {
            alert(`Este evento foi encerrado por:  ${closedBy || 'outro operador'}`);
            closeEventUI.close();
        }
    }
    
    updateCounts();
    updateEventList();
}

function handleEventLocked(data) {
    const { eventKey, operador } = data;
    lockedEvents.set(eventKey, { operador, lockedAt: Date.now() });
    console.log(`🔒 Evento ${eventKey} bloqueado por ${operador}`);
    updateEventList();
}

function handleEventUnlocked(data) {
    const { eventKey } = data;
    lockedEvents.delete(eventKey);
    console.log(`🔓 Evento ${eventKey} desbloqueado`);
    updateEventList();
}

window.addEventListener('beforeunload', () => {
    if (closeEventUI.currentEventKey) {
        closeEventUI.releaseLock();
    }
});

connectWebSocket();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('[SW] Service Worker registered:', registration.scope))
            .catch(error => console.log('[SW] Service Worker registration failed:', error));
    });
}

// HOT RELOAD exports
Object.defineProperty(window, 'allEvents', { get: () => allEvents, set: (val) => { allEvents = val; } });
Object.defineProperty(window, 'activeAlarms', { get: () => activeAlarms, set: (val) => { activeAlarms = val; } });
Object.defineProperty(window, 'activePendentes', { get: () => activePendentes, set: (val) => { activePendentes = val; } });
Object.defineProperty(window, 'currentClientId', { get: () => currentClientId, set: (val) => { currentClientId = val; } });
Object.defineProperty(window, 'selectedEvent', { get: () => selectedEvent, set: (val) => { selectedEvent = val; } });
Object.defineProperty(window, 'currentUser', { get: () => currentUser, set: (val) => { currentUser = val; } });
window.updateCounts = updateCounts;
window.updateEventList = updateEventList;