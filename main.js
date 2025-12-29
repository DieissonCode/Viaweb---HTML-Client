// main.js
import { getUnits } from './units-db.js';
import { ViawebCrypto } from './crypto.js';
import { CHAVE, IV, partitionNames, armDisarmCodes, falhaCodes, sistemaCodes, eventosDB } from './config.js';

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

let updateInterval;
const maxEvents = 300;
let allEvents = [];
let activeAlarms = new Map();
let activePendentes = new Map();
let selectedEvent = null;
let debounceTimeout;
let units = []; // DECLARAÇÃO DA VARIÁVEL UNITS
let selectedPendingEvent = null;
let pendingCommands = new Map();
let currentClientId = null;
let ws = null;
let reconnectTimer = null;
const reconnectDelay = 3000;
let cryptoInstance = null;

// Carregar unidades ao iniciar
(async () => {
    try {
        console.log('🔄 Carregando unidades...');
        units = await getUnits();
        console.log(`✅ ${units.length} unidades carregadas`);
        console.log('📋 UNITS COMPLETAS:', JSON.stringify(units, null, 2));
        populateUnitSelect();
    } catch (err) {
        console.error('❌ Erro ao carregar unidades:', err);
        // Mostra mensagem de erro para o usuário
        unitSelect.innerHTML = '<option value="">Erro ao carregar unidades - Verifique a conexão</option>';
    }
})();

function populateUnitSelect() {
    unitSelect.innerHTML = '<option value="">Selecione uma unidade</option>';
    units.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.value;
        opt.textContent = `${u.local} (${u.value})`;
        unitSelect.appendChild(opt);
    });
    console.log(`✅ ${units.length} unidades adicionadas ao select`);
}

async function initCrypto() {
    cryptoInstance = new ViawebCrypto(CHAVE, IV);
}

function getLastDigit(id) {
    return parseInt(String(id).slice(-1)) || 0;
}

function getPartitionName(pos, clientId) {
    // Usa APENAS a posição da partição (1-8) para nomear
    // O clientId é usado SOMENTE nos eventos
    const name = partitionNames[pos] || "";
    return name ? `${pos} - ${name}` : pos;
}

function updatePartitions(data) {
    partitionsList.innerHTML = '';
    data.forEach(p => {
        const cls = p.armado === 1 ? 'partition-status armado' : 'partition-status desarmado';
        const name = getPartitionName(p.pos, currentClientId);
        const div = document.createElement('div');
        div.className = 'partition-item';
        div.innerHTML = `<input type="checkbox" id="partition-${p.pos}" value="${p.pos}"><label for="partition-${p.pos}">Partição <span class="mono-number">${name}</span>: <span class="${cls}">${p.armado === 1 ? "Armada" : "Desarmada"}</span></label>`;
        partitionsList.appendChild(div);
    });
}

function updateZones(data) {
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
            div.innerHTML = `<input type="checkbox" id="zone-${z.pos}" value="${z.pos}"><label for="zone-${z.pos}">Zona <span class="mono-number">${num}</span>: <span class="zone-status ${cls}">${txt}</span></label>`;
            colDiv.appendChild(div);
        }
        zonesColumns.appendChild(colDiv);
    }
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
    if (zonaUsuario > 0) {
        desc += ` - ${isArmDisarm ? 'Usuário' : 'Zona'} ${zonaUsuario}`;
    }

    let extraClass = '';
    if (cod === '1570') extraClass = 'inibida';

    const ev = { id, local, data: `${dia}/${mes}/${ano}`, hora: `${hora}:${min}:${seg}`, complemento: zonaUsuario > 0 ? zonaUsuario : '-', particao: part, descricao: desc, codigoEvento: cod, clientId, timestamp: ts, extraClass };

    allEvents.push(ev);
    if (allEvents.length > maxEvents) allEvents.shift();

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
            if (!activePendentes.has(key)) {
                activePendentes.set(key, {first: ev, events: [], resolved: false});
            }
            activePendentes.get(key).events.push(ev);
        }

        if (isRestauro) {
            const falhaCod = cod.replace(/^3/, '1');
            const falhaKey = `${local}-${falhaCod}-${zona}`;
            if (activePendentes.has(falhaKey)) {
                activePendentes.get(falhaKey).resolved = true;
            }
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
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term.toLowerCase()) ? '' : 'none';
    });
}

function updateEventList() {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const filterTerm = eventsFilter.value.toLowerCase();
    eventList.innerHTML = '';
    let sourceEvents = [];

    if (currentTab === 'all') sourceEvents = allEvents;
    else if (currentTab === 'alarms') {
        activeAlarms.forEach(group => sourceEvents.push({group, type: 'alarm'}));
    } else if (currentTab === 'pendentes') {
        activePendentes.forEach(group => {
            if (!group.resolved) sourceEvents.push({group, type: 'pendente'});
        });
    } else if (currentTab === 'sistema') sourceEvents = allEvents.filter(ev => sistemaCodes.includes(ev.codigoEvento));
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

    const displayEvents = filtered.reverse();

    displayEvents.forEach(item => {
        let ev, count = 1;
        if (item.group) {
            ev = item.group.first;
            count = item.group.events.length + 1;
        } else ev = item;

        const tr = eventList.insertRow();
        tr.className = `event-row ${ev.extraClass || ''}`;
        const cod = ev.codigoEvento;
        if (cod === '1130') tr.classList.add('alarm');
        else if (cod === '1AA6' || cod === 'EAA6') tr.classList.add('offline'); // Cliente offline
        else if (cod === '3AA6') tr.classList.add('online'); // Cliente online
        else if (cod.startsWith('3')) tr.classList.add('restauro');
        else if (falhaCodes.includes(cod)) tr.classList.add('falha');
        else if (armDisarmCodes.includes(cod)) tr.classList.add('armedisarm');
        else if (cod.startsWith('16')) tr.classList.add('teste');

        const partName = getPartitionName(ev.particao, ev.clientId);
        let desc = ev.descricao;
        if (count > 1) desc += ` (${count} eventos)`;

        tr.innerHTML = `<td>${ev.id||'-'}</td><td>${ev.local||'N/A'}</td><td>${ev.data}</td><td>${ev.hora}</td><td>${ev.complemento}</td><td>${partName}</td><td>${desc}</td>`;

        // Click no evento seleciona o cliente automaticamente
        tr.style.cursor = 'pointer';
        tr.onclick = () => {
            if (item.group) {
                openCloseModal(item.group, item.type);
            } else {
                // Seleciona cliente do evento
                selectClientFromEvent(ev);
            }
        };
    });
}

function openCloseModal(group, type) {
    selectedPendingEvent = {group, type};
    closeEventModal.style.display = 'block';
    procedureText.focus();
}

function selectClientFromEvent(ev) {
    const isep = ev.local || ev.clientId;
    if (!isep) return;
    
    console.log('🎯 Selecionando cliente do evento:', isep);
    
    // Procura unidade com esse ISEP
    const unit = units.find(u => String(u.value) === String(isep));
    
    if (unit) {
        // Seleciona no dropdown
        unitSelect.value = unit.value;
        // Dispara evento change para carregar dados
        unitSelect.dispatchEvent(new Event('change'));
        
        // Expande seção de controle se estiver fechada
        const controlHeader = document.getElementById('control-header');
        const controlContent = document.getElementById('control-content');
        if (controlHeader.classList.contains('collapsed')) {
            controlHeader.classList.remove('collapsed');
            controlContent.classList.remove('collapsed');
        }
        
        // Scroll suave até o controle
        document.getElementById('control-panel-section').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
        
        console.log('✅ Cliente selecionado:', unit.local);
    } else {
        console.warn('⚠️ Cliente não encontrado na lista:', isep);
        alert(`Cliente ${isep} não encontrado na lista de unidades`);
    }
}

function sendCommand(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('❌ WebSocket não conectado');
        return false;
    }
    try {
        ws.send(JSON.stringify(data));
        console.log('📤 Comando enviado para bridge:', JSON.stringify(data));
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
    const cmdId = Date.now();
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    const cmd = { oper: [{ acao: "executar", idISEP: isepFormatted, id: cmdId, comando: [{ cmd: "armar", password: 8790, inibir: zonas.length ? zonas : undefined, particoes }] }] };
    pendingCommands.set(cmdId, () => fetchPartitionsAndZones(idISEP));
    sendCommand(cmd);
}

function desarmarParticoes(idISEP, particoes) {
    const cmdId = Date.now();
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    const cmd = { oper: [{ acao: "executar", idISEP: isepFormatted, id: cmdId, comando: [{ cmd: "desarmar", password: 8790, particoes }] }] };
    pendingCommands.set(cmdId, () => fetchPartitionsAndZones(idISEP));
    sendCommand(cmd);
    setTimeout(() => fetchPartitionsAndZones(idISEP), 5000);
}

function fetchPartitionsAndZones(idISEP) {
    console.log('🚀 fetchPartitionsAndZones chamada com idISEP:', idISEP, '| Tipo:', typeof idISEP);
    
    // Garante que idISEP seja string de 4 dígitos (sem conversão!)
    const isepFormatted = String(idISEP).padStart(4, '0').toUpperCase();
    console.log('📝 idISEP formatado (sem conversão):', isepFormatted);
    
    const id1 = Date.now();
    const id2 = id1 + 1;
    pendingCommands.set(id1, resp => resp.resposta && updatePartitions(resp.resposta));
    pendingCommands.set(id2, resp => resp.resposta && updateZones(resp.resposta));
    
    const cmd1 = { oper: [{ acao: "executar", idISEP: isepFormatted, id: id1, comando: [{ cmd: "particoes" }] }] };
    const cmd2 = { oper: [{ acao: "executar", idISEP: isepFormatted, id: id2, comando: [{ cmd: "zonas" }] }] };
    
    console.log('📤 Comando 1 (partições):', JSON.stringify(cmd1));
    console.log('📤 Comando 2 (zonas):', JSON.stringify(cmd2));
    
    sendCommand(cmd1);
    sendCommand(cmd2);
}

function updateStatus(connected) {
    status.classList.toggle('connected', connected);
    status.classList.toggle('disconnected', !connected);
    status.title = connected ? 'Conectado' : 'Desconectado';
    document.getElementById('status-text').textContent = 'Viaweb - Cotrijal';
}

function connectWebSocket() {
    if (ws) ws.close();
    ws = new WebSocket('ws://localhost:8080');
    ws.binaryType = 'arraybuffer';

    ws.onopen = async () => {
        console.log('[WS] Conectado');
        clearTimeout(reconnectTimer);
        updateStatus(true);
        armButton.disabled = disarmButton.disabled = true;
        // Não precisa mais inicializar crypto - bridge faz isso
        console.log('[WS] Pronto para enviar');
    };

    ws.onmessage = async (event) => {
        console.log('[WS] Mensagem recebida:', event.data);
        try {
            // Bridge já descriptografou - recebe JSON puro
            const data = JSON.parse(event.data);
            console.log('[WS] Dados recebidos:', data);

            if (data.oper && Array.isArray(data.oper)) {
                for (const op of data.oper) {
                    if (op.acao === 'evento') {
                        processEvent(data);
                        ws.send(JSON.stringify({ resp: [{ id: op.id }] }));
                        console.log('[WS] ACK enviado para evento', op.id);
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
        } catch (e) {
            console.error('[WS] Erro ao processar mensagem:', e);
        }
    };

    ws.onclose = () => {
        console.log('[WS] Desconectado');
        updateStatus(false);
        armButton.disabled = disarmButton.disabled = true;
        partitionsList.innerHTML = zonesColumns.innerHTML = '';
        totalZones.textContent = '0';
        cryptoInstance = null;
        reconnectTimer = setTimeout(connectWebSocket, reconnectDelay);
        console.log(`[WS] Reconectando em ${reconnectDelay/1000}s...`);
    };

    ws.onerror = (e) => console.error('[WS] Erro WS:', e);
}

unitSelect.addEventListener('change', () => {
    const val = unitSelect.value; // Mantém como string
    console.log('🔍 ===== SELEÇÃO DE UNIDADE =====');
    console.log('📌 Value do select:', val, '| Tipo:', typeof val);
    
    const unit = units.find(u => String(u.value) === String(val));
    console.log('📌 Unidade encontrada:', unit);
    
    if (unit) {
        selectedEvent = { idISEP: String(unit.value) };
        currentClientId = String(unit.value);
        clientNumber.textContent = unit.local || unit.label;
        armButton.disabled = disarmButton.disabled = false;
        
        console.log('📤 idISEP que será enviado:', unit.value);
        console.log('🔍 Tipo do idISEP:', typeof unit.value);
        console.log('🔍 selectedEvent:', selectedEvent);
        
        fetchPartitionsAndZones(String(unit.value));
        if (autoUpdateCheckbox.checked) {
            clearInterval(updateInterval);
            updateInterval = setInterval(() => fetchPartitionsAndZones(String(unit.value)), 30000);
        }
    } else {
        selectedEvent = null;
        currentClientId = null;
        clientNumber.textContent = "Nenhum selecionado";
        armButton.disabled = disarmButton.disabled = true;
        partitionsList.innerHTML = zonesColumns.innerHTML = '';
        totalZones.textContent = '0';
        clearInterval(updateInterval);
        console.log('❌ Nenhuma unidade encontrada para o value:', val);
    }
});

unitSearch.addEventListener('input', e => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        const term = e.target.value.toLowerCase();
        unitSelect.innerHTML = '<option value="">Selecione uma unidade</option>';
        units.filter(u => (u.local||'').toLowerCase().includes(term) || (u.value||'').includes(term) || (u.sigla||'').toLowerCase().includes(term))
             .forEach(u => {
                 const opt = document.createElement('option');
                 opt.value = u.value;
                 opt.textContent = `${u.local} (${u.label})`;
                 unitSelect.appendChild(opt);
             });
    }, 300);
});

armButton.addEventListener('click', () => selectedEvent && getSelectedPartitions().length ? armarParticoes(selectedEvent.idISEP, getSelectedPartitions(), getSelectedZones()) : alert('Selecione partição'));
disarmButton.addEventListener('click', () => selectedEvent && getSelectedPartitions().length ? desarmarParticoes(selectedEvent.idISEP, getSelectedPartitions()) : alert('Selecione partição'));

autoUpdateCheckbox.addEventListener('change', () => {
    if (autoUpdateCheckbox.checked && selectedEvent) updateInterval = setInterval(() => fetchPartitionsAndZones(selectedEvent.idISEP), 30000);
    else clearInterval(updateInterval);
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
        console.log('Encerrado:', group.first.local, 'Procedimento:', procedureText.value);
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

connectWebSocket();