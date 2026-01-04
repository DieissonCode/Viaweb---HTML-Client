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

let unitStatus = null;
let unitStatusSince = null;

// Cache global de status por ISEP
// Map ISEP -> { status: 'online'|'offline', since: timestamp(ms) }
const statusCache = new Map();

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

function updateSearchIndices(event) {
    if (!eventsByLocal.has(event.local)) eventsByLocal.set(event.local, []);
    eventsByLocal.get(event.local).push(event);
    if (!eventsByCode.has(event.codigoEvento)) eventsByCode.set(event.codigoEvento, []);
    eventsByCode.get(event.codigoEvento).push(event);
    if (eventsByLocal.get(event.local).length > maxEvents) eventsByLocal.get(event.local).shift();
    if (eventsByCode.get(event.codigoEvento).length > maxEvents) eventsByCode.get(event.codigoEvento).shift();
}

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
    try { units = await window.getUnits(); populateUnitSelect(); }
    catch (err) { console.error('❌ Erro ao carregar unidades:', err); unitSelect.innerHTML = '<option value=\"\">Erro ao carregar unidades</option>'; }
})();

(async () => {
    try { users = await window.UsersDB.getUsers(); }
    catch (err) { console.error('❌ Erro ao carregar usuários:', err); }
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

function getPartitionName(pos, clientId) {
    const name = partitionNames[pos] || "";
    return name ? `[ ${pos} ] - ${name}` : pos;
}

function updatePartitions(data) {
    savedPartitions = getSelectedPartitions();
    partitionsList.innerHTML = '';
    data.forEach(p => {
        const cls = p.armado == 1 ? 'partition-status armado' : 'partition-status desarmado';
        const name = getPartitionName(p.pos, currentClientId);
        const statusText = p.armado == 1 ? 'Armada' : 'Desarmada';
        const div = document.createElement('div');
        div.className = 'partition-item';
        div.innerHTML = `
        <input type="checkbox" id="partition-${p.pos}" value="${p.pos}">
        <label for="partition-${p.pos}">
            <span class="${cls}">${statusText}</span> 
            ${name}
        </label>
        `;
        partitionsList.appendChild(div);
        if (savedPartitions.includes(p.pos)) document.getElementById(`partition-${p.pos}`).checked = true;
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
            let txt = z.inibida ? "Inibida" : z.excluida ? "Excluída" : z.aberta ? "Aberta" : z.tamper ? "Tamper" : z.disparada ? "Disparada" : "OK";
            let cls = z.inibida ? "inibida" : z.excluida ? "excluida" : z.aberta || z.disparada ? "aberto" : z.tamper ? "tamper" : "ok";
            const num = String(z.pos).padStart(2,'0');
            const div = document.createElement('div');
            div.className = 'zone-item';
            div.innerHTML = `<input type="checkbox" id="zone-${z.pos}" value="${z.pos}"><label for="zone-${z.pos}">Sensor <span class="mono-number">${num}</span>: <span class="zone-status ${cls}">${txt}</span></label>`;
            colDiv.appendChild(div);
        }
        zonesColumns.appendChild(colDiv);
    }
    savedZones.forEach(zoneNum => {
        const checkbox = document.getElementById(`zone-${zoneNum}`);
        if (checkbox) checkbox.checked = true;
    });
}

function processEvent(data) {
    const msg = data.oper?.[0] || data;
    const cod = msg.codigoEvento || 'N/A';
    if (cod === "1412") return;

    let id = (msg.id || '').replace(/-(evento|evento-)/g, '');
    const zonaUsuario = msg.zonaUsuario || 0;
    const part = msg.particao || 1;
    const local = msg.isep || 'N/A';
    const clientId = msg.isep || msg.contaCliente || currentClientId;
    let ts = msg.recepcao || Date.now();
    if (ts < 10000000000) ts *= 1000;
    const d = new Date(ts);
    const dia = d.getDate().toString().padStart(2,'0');
    const mes = (d.getMonth()+1).toString().padStart(2,'0');
    const ano = d.getFullYear();
    const hora = d.getHours().toString().padStart(2,'0');
    const min = d.getMinutes().toString().padStart(2,'0');
    const seg = d.getSeconds().toString().padStart(2,'0');

    let desc = eventosDB[cod] || `Evento ${cod}`;
    if (desc.includes('{zona}')) desc = desc.replace('{zona}', zonaUsuario);

    const isArmDisarm = armDisarmCodes.includes(cod);
    if (zonaUsuario > 0) desc += ` - ${isArmDisarm ? '' : 'Sensor ' + zonaUsuario}`;

    let extraClass = '';
    if (cod === '1570') extraClass = 'inibida';

    const ev = {
        id,
        local,
        data: `${dia}/${mes}/${ano}`,
        hora: `${hora}:${min}:${seg}`,
        complemento: zonaUsuario > 0 ? zonaUsuario : '-',
        particao: part,
        descricao: desc,
        codigoEvento: cod,
        clientId,
        timestamp: ts,
        extraClass
    };

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

    if (cod === '1130') {
        const key = local;
        if (!activeAlarms.has(key)) activeAlarms.set(key, {first: ev, events: []});
        activeAlarms.get(key).events.push(ev);
    }

    const isFalha = falhaCodes.includes(cod);
    const isRestauro = cod.startsWith('3') && sistemaCodes.includes(cod);

    if (isFalha || isRestauro) {
        const zona = zonaUsuario || 0;
        const key = `${local}-${cod}-${zona}`;
        if (isFalha) {
            if (!activePendentes.has(key)) activePendentes.set(key, {first: ev, events: [], resolved: false});
            activePendentes.get(key).events.push(ev);
        }
        if (isRestauro) {
            const falhaCod = cod.replace(/^3/, '1');
            const falhaKey = `${local}-${falhaCod}-${zona}`;
            if (activePendentes.has(falhaKey)) activePendentes.get(falhaKey).resolved = true;
        }
    }

    updateEventList();
    updateCounts();
}

function updateCounts() {
    alarmCount.textContent = activeAlarms.size;
    pendCount.textContent = Array.from(activePendentes.values()).filter(g => !g.resolved).length;
}

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

function updateEventList() {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const filterTerm = eventsFilter.value.toLowerCase();
    eventList.innerHTML = '';
    let sourceEvents = [];
    if (currentTab === 'all') sourceEvents = allEvents;
    else if (currentTab === 'alarms') activeAlarms.forEach(group => sourceEvents.push({group, type: 'alarm'}));
    else if (currentTab === 'pendentes') activePendentes.forEach(group => { if (!group.resolved) sourceEvents.push({group, type: 'pendente'}); });
    else if (currentTab === 'sistema') sourceEvents = allEvents.filter(ev => sistemaCodes.includes(ev.codigoEvento));
    else if (currentTab === 'usuarios') sourceEvents = allEvents.filter(ev => armDisarmCodes.includes(ev.codigoEvento));
    else if (currentTab === 'historico') sourceEvents = allEvents;

    let filtered = sourceEvents.slice(-300);
    if (filterTerm) {
        filtered = filtered.filter(item => {
            let ev = item.group ? item.group.first : item;
            const text = `${ev.local} ${ev.descricao} ${ev.data} ${ev.hora} ${ev.complemento}`.toLowerCase();
            return text.includes(filterTerm);
        });
    }

    const maxDisplayEvents = 100;
    const displayEvents = filtered.slice(-maxDisplayEvents).reverse();

    displayEvents.forEach(item => {
        let ev, count = 1;
        if (item.group) { ev = item.group.first; count = item.group.events.length + 1; }
        else ev = item;

        const tr = eventList.insertRow();
        tr.className = `event-row ${ev.extraClass || ''}`;
        const cod = ev.codigoEvento;
        const isArmDisarmCode = armDisarmCodes.includes(cod);

        if (cod === '1130') tr.classList.add('alarm');
        else if (cod === '1AA6' || cod === 'EAA6') tr.classList.add('offline');
        else if (cod === '3AA6') tr.classList.add('online');
        else if (cod.startsWith('3')) tr.classList.add('restauro');
        else if (falhaCodes.includes(cod)) tr.classList.add('falha');
        else if (isArmDisarmCode) tr.classList.add('armedisarm');
        else if (cod.startsWith('16')) tr.classList.add('teste');

        const partName = getPartitionName(ev.particao, ev.clientId);
        let desc = ev.descricao;
        if (count > 1) desc += ` (${count} eventos)`;

        const tipos = { 0: '[Horário Programado]',1: '[Monitoramento]', 2: '[Facilitador]', 3: '[Senha de Uso Único]', 4: '[Senha de Uso Único]', 5: '[Senha de Uso Único]', 6: '[TI - Manutenção]' };
        let complemento = ev.complemento;
        let userData = null;
        console.log(isArmDisarmCode && ev.complemento && ev.complemento !== '-' + ' | ' + ev.descricao);
        if (isArmDisarmCode && ev.complemento && ev.complemento !== '-') {
            const zonaUsuario = Number(ev.complemento);
            const isep = String(ev.local || ev.clientId);
            if (tipos[zonaUsuario]) desc += `${tipos[zonaUsuario]}`;
            else desc += `Usuário Não Cadastrado | ${ev.complemento}`;
            const usersByIsep = window.UsersDB.getUsersByIsep(isep) || [];
            userData = usersByIsep.find(u => Number(u.ID_USUARIO) === zonaUsuario) || null;
            console.log('Busca usuário para ISEP ' + isep + ' e ID_USUARIO ' + zonaUsuario + ':', userData + ' | ' + ev.descricao + ' | ' + desc);
            if (userData && !tipos[zonaUsuario]) desc = ev.descricao + window.UsersDB.formatUserName(userData);
        }

        tr.innerHTML = `<td>${ev.local||'N/A'}</td><td>${ev.data}</td><td>${ev.hora}</td><td>${complemento}</td><td>${partName}</td><td>${desc}</td>`;

        // Tooltip handlers (restaurado)
        if (userData) {
            let hoverTimer = null;
            tr.addEventListener('mouseenter', () => {
                hoverTimer = setTimeout(() => {
                    showTooltip(tr, userData);
                }, 2000);
            });
            tr.addEventListener('mouseleave', () => {
                if (hoverTimer) clearTimeout(hoverTimer);
                hideTooltip();
            });
        }

        tr.style.cursor = 'pointer';
        tr.onclick = () => {
            if (item.group) {
                openCloseModal(item.group, item.type);
            } else {
                selectClientFromEvent(ev);
            }
        };
    });

    if (filtered.length > maxDisplayEvents) {
        const infoRow = eventList.insertRow(0);
        infoRow.className = 'event-info';
        infoRow.innerHTML = `<td colspan="6" style="text-align: center; padding: 8px; background: var(--bg-hover); color: var(--text-secondary); font-size: 11px;">
            Mostrando últimos ${maxDisplayEvents} de ${filtered.length} eventos. Use o filtro para refinar a busca.
        </td>`;
    }
}

function openCloseModal(group, type) {
    selectedPendingEvent = { group, type };
    closeEventModal.style.display = 'block';
    const modalContent = closeEventModal.querySelector('.modal-content');
    if (modalContent) modalContent.scrollTop = 0;
    renderEventHistory(group, type); // mostra apenas em 'alarm'
    procedureText.focus();
}

function renderEventHistory(group, type) {
    const container = document.getElementById('event-history');
    const listEl = document.getElementById('event-history-list');
    const titleEl = document.getElementById('closeEventTitle');
    const badgeEl = document.getElementById('history-badge');
    if (!container || !listEl) return;

    // Apenas disparos
    if (type !== 'alarm') {
        container.style.display = 'none';
        listEl.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Encerrar Evento';
        if (badgeEl) badgeEl.textContent = '0 eventos';
        return;
    }

    container.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Encerrar Disparo';

    // Monta lista sem duplicar e ordena
    const seen = new Set();
    const events = [group.first, ...(group.events || [])]
        .filter(Boolean)
        .filter(ev => {
            const key = `${ev.timestamp}-${ev.codigoEvento}-${ev.complemento}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (badgeEl) badgeEl.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;

    listEl.innerHTML = '';
    if (events.length === 0) {
        listEl.innerHTML = '<div class="event-history-item">Nenhum evento encontrado para este disparo.</div>';
        return;
    }

    events.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'event-history-item';
        const partName = getPartitionName(ev.particao, ev.clientId);
        const complemento = ev.complemento && ev.complemento !== '-' ? ` • Zona/Usuário ${ev.complemento}` : '';

        item.innerHTML = `
            <div class="event-history-time">${ev.data} ${ev.hora}</div>
            <div class="event-history-desc">${ev.descricao}</div>
            <div class="event-history-meta">
                ISEP ${ev.local || ev.clientId || 'N/A'} • ${partName} • Código ${ev.codigoEvento}${complemento}
            </div>
        `;
        listEl.appendChild(item);
    });
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

function selectClientFromEvent(ev) {
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

function sendCommand(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) { console.error('❌ WebSocket não conectado'); return false; }
    if (ws.bufferedAmount > WS_BUFFER_LIMIT) { console.error('❌ Buffer WebSocket cheio, aguardando...'); return false; }
    try { ws.send(JSON.stringify(data)); return true; }
    catch (e) { console.error('❌ Erro ao enviar:', e); return false; }
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
        //alert(`Central offline ao consultar partições: ${data[0].mensagem || 'Erro'}`);
        return;
    }
    updatePartitions(data);
    setUnitStatus('online', null, currentClientId);
}

function handleZonesResponse(resp) {
    const data = resp?.resposta;
    if (!data || data.length === 0) return;
    if (data[0]?.cmd === 'erro') {
        setUnitStatus('offline', null, currentClientId); // sem alert
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

function parseJsonStream(raw) {
    if (typeof raw !== 'string') return [];
    const out = [];
    raw.split(/\u0001+/g).forEach(chunk => {
        const s = chunk.trim();
        if (!s) return;
        // encontra o primeiro '{' ou '[' para ignorar prefixos binários/lixo
        const idx = s.search(/[{\[]/);
        if (idx === -1) return;
        const candidate = s.slice(idx);
        try {
            out.push(JSON.parse(candidate));
        } catch (e) {
            // em vez de lançar erro, apenas loga de forma silenciosa
            //console.warn('[WS] Descarta chunk inválido (parse JSON falhou):', candidate);
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
        // Busca status de todos os clientes na conexão
        fetchAllClientStatuses();
    };

    ws.onmessage = async (event) => {
        try {
            const raw = typeof event.data === 'string' ? event.data : '';
            const payloads = raw ? parseJsonStream(raw) : [JSON.parse(event.data)];
            payloads.forEach(data => {
                if (data.oper && Array.isArray(data.oper)) {
                    for (const op of data.oper) {
                        if (op.acao === 'evento') {
                            processEvent(data);
                            ws.send(JSON.stringify({ resp: [{ id: op.id }] }));
                            return;
                        }
                    }
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
    const val = unitSelect.value;
    const unit = units.find(u => String(u.value) === String(val));
    if (unit) {
        selectedEvent = { idISEP: String(unit.value) };
        currentClientId = String(unit.value);
        clientNumber.textContent = unit.local || unit.label;

        // Aplica status do cache imediatamente (se existir)
        applyCachedStatus(String(unit.value).toUpperCase());

        // Se já sabemos que está offline, limpa listas (sem alert)
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

confirmCloseEvent.onclick = () => {
    if (selectedPendingEvent) {
        const {group, type} = selectedPendingEvent;
        if (type === 'alarm') activeAlarms.delete(group.first.local);
        else {
            const key = `${group.first.local}-${group.first.codigoEvento}-${group.first.complemento}`;
            activePendentes.delete(key);
        }
        updateCounts();
        updateEventList();
        closeEventModal.style.display = 'none';
        procedureText.value = '';
        selectedPendingEvent = null;
    }
};

cancelCloseEvent.onclick = () => {
    closeEventModal.style.display = 'none';
    procedureText.value = '';
    selectedPendingEvent = null;
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
window.updateCounts = updateCounts;
window.updateEventList = updateEventList;