// ui.js
export function updatePartitions(data, currentClientId, getPartitionName) {
    const partitionsList = document.getElementById('partitions-list');
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

export function updateZones(data) {
    const totalZones = document.getElementById('total-zones');
    const zonesColumns = document.getElementById('zones-columns');
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
            let txt = z.inibida ? "Inibida" : z.aberta ? "Aberta" : z.tamper ? "Tamper" : z.disparada ? "Disparada" : "OK";
            let cls = z.inibida ? "inibida" : z.aberta || z.disparada ? "aberto" : z.tamper ? "tamper" : "ok";
            const num = String(z.pos).padStart(2,'0');
            const div = document.createElement('div');
            div.className = 'zone-item';
            div.innerHTML = `<input type="checkbox" id="zone-${z.pos}" value="${z.pos}"><label for="zone-${z.pos}">Zona <span class="mono-number">${num}</span>: <span class="zone-status ${cls}">${txt}</span></label>`;
            colDiv.appendChild(div);
        }
        zonesColumns.appendChild(colDiv);
    }
}

export function updateEventList(allEvents, activeAlarms, activePendentes, armDisarmCodes, falhaCodes, sistemaCodes, getPartitionName, openCloseModal) {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const filterTerm = document.getElementById