const mssql = require('mssql');

// Cache simples em memória para deduplicação (evita consultas ao BD)
const DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const dedupeCache = new Map(); // key -> { ts, count }

function pruneDedupeCache() {
    const now = Date.now();
    for (const [key, val] of dedupeCache.entries()) {
        if (!val || !val.ts || now - val.ts > DEDUPE_TTL_MS) dedupeCache.delete(key);
    }
}

function normalizeComplemento(comp) {
    if (comp === undefined || comp === null || comp === '') return '0';
    const s = String(comp).trim();
    if (s === '-') return '0';
    return s;
}

function makeDedupeKey(codigo, isep, complemento, dataEventoStr) {
    const comp = normalizeComplemento(complemento);
    return `${codigo}|${isep}|${comp}|${dataEventoStr}`;
}

function normalizeText(val) {
    return (val === null || val === undefined) ? '' : String(val);
}

// ✅ CORRIGIDO: Converte timestamp para Date
function toDateGmt3(rawTs) {
    // Se for null/undefined, retorna agora
    if (rawTs === null || rawTs === undefined) {
        return new Date();
    }

    // Tenta converter para número
    const num = Number(rawTs);
    
    // Se não é um número válido, retorna agora
    if (Number.isNaN(num) || !Number.isFinite(num)) {
        console.warn('[logs-repo] ⚠️ Timestamp inválido recebido:', rawTs, '- usando Date.now()');
        return new Date();
    }

    // Se é muito pequeno (provavelmente em segundos), converte para ms
    if (num < 10000000000) {
        return new Date(num * 1000);
    }

    // Já está em ms
    return new Date(num);
}

// Formata Date em string SQL-safe (yyyy-MM-dd HH:mm:ss.SSS)
function formatDateTimeSql(dateObj) {
    // Valida se é uma data válida
    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        console.warn('[logs-repo] ⚠️ Date inválido recebido:', dateObj, '- usando Date.now()');
        dateObj = new Date();
    }

    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const y = dateObj.getFullYear();
    const m = pad(dateObj.getMonth() + 1);
    const d = pad(dateObj.getDate());
    const hh = pad(dateObj.getHours());
    const mi = pad(dateObj.getMinutes());
    const ss = pad(dateObj.getSeconds());
    const ms = pad(dateObj.getMilliseconds(), 3);
    return `${y}-${m}-${d} ${hh}:${mi}:${ss}.${ms}`;
}

// Log helper simples
function logDebug(step, payload) {
    //console.log(`[logs-repo] ${step}:`, payload);
}

// Loga a query + params normalizados
function logQuery(step, sql, params) {
    //console.log(`[logs-repo] QUERY ${step}:\n${sql.trim()}\nPARAMS:`, params);
}

// Garante separador " - " para arma/desarma programado (complemento 0)
function normalizeArmDisarmDescricao(descricao, codigo, complemento) {
    if (!descricao) return descricao;
    const cod = String(codigo || '').trim();
    const isArmDisarm = ['1401','1402','1403','3401','3402','3403','3456'].includes(cod);
    const hasHorario = descricao.includes('[Horário Programado]');
    const alreadyHasDash = descricao.includes(' - [Horário Programado]');
    if (isArmDisarm && hasHorario && !alreadyHasDash) {
        return descricao.replace('[Horário Programado]', '- [Horário Programado]');
    }
    return descricao;
}

class LogsRepository {
    constructor(getPoolFn) {
        this.getPool = getPoolFn;
    }

    async saveIncomingEvent(event) {
        if (!event) return null;
        const pool = await this.getPool();
        const codigo = normalizeText(event.codigoEvento || event.codigo || event.code);
        const complementoRaw = normalizeText(event.complemento);
        const complemento = normalizeComplemento(complementoRaw);
        const particao = normalizeText(event.particao);
        const local = normalizeText(event.local || event.isep || event.clientId);
        const isep = normalizeText(event.isep || event.local || event.clientId);
        const dataEventoDate = toDateGmt3(event.timestamp);
        const dataEventoStr = formatDateTimeSql(dataEventoDate);

        let descricao = normalizeText(event.descricao);
        descricao = normalizeArmDisarmDescricao(descricao, codigo, complemento);

        const normalizedEvent = { 
            ...event, 
            complemento,
            userName: event.userName || null,
            userId: event.userId || null,
            userMatricula: event.userMatricula || null
        };
        const rawEvent = JSON.stringify(normalizedEvent || {});

        // Dedup em memória
        pruneDedupeCache();
        const dedupeKey = makeDedupeKey(codigo, isep, complemento, dataEventoStr);
        if (dedupeCache.has(dedupeKey)) {
            logDebug('saveIncomingEvent - skip duplicate (memory)', { dedupeKey });
            return null;
        }
        dedupeCache.set(dedupeKey, { ts: Date.now(), count: 1 });

        // ✅ CORREÇÃO: Adiciona DataHora na query
        const sql = `
            INSERT INTO LOGS.Events (Codigo, CodigoEvento, Complemento, Particao, Local, ISEP, Descricao, DataEvento, DataHora, RawEvent)
            OUTPUT INSERTED.Id
            VALUES (@Codigo, @CodigoEvento, @Complemento, @Particao, @Local, @ISEP, @Descricao, CONVERT(datetime2, @DataEventoStr, 120), GETDATE(), @RawEvent);
        `;
        
        const params = { 
            Codigo: codigo, 
            CodigoEvento: codigo, 
            Complemento: complemento, 
            Particao: particao, 
            Local: local, 
            ISEP: isep, 
            Descricao: descricao, 
            DataEventoStr: dataEventoStr, 
            RawEvent: rawEvent 
        };
        logQuery('event(incoming)', sql, params);

        const result = await pool.request()
            .input('Codigo', mssql.NVarChar(50), codigo)
            .input('CodigoEvento', mssql.NVarChar(50), codigo)
            .input('Complemento', mssql.NVarChar(100), complemento)
            .input('Particao', mssql.NVarChar(50), particao)
            .input('Local', mssql.NVarChar(100), local)
            .input('ISEP', mssql.NVarChar(10), isep)
            .input('Descricao', mssql.NVarChar(mssql.MAX), descricao)
            .input('DataEventoStr', mssql.NVarChar(30), dataEventoStr)
            .input('RawEvent', mssql.NVarChar(mssql.MAX), rawEvent)
            .query(sql);

        const eventId = result.recordset[0].Id;
        logDebug('saveIncomingEvent - inserted', { eventId });
        return eventId;
    }

    async findEventId(event) {
        const pool = await this.getPool();
        const codigo = normalizeText(event?.codigoEvento || event?.codigo || event?.code);
        const complemento = normalizeComplemento(event?.complemento);
        const particao = normalizeText(event?.particao);
        const isep = normalizeText(event?.isep || event?.local || event?.clientId);
        
        // ✅ CORRIGIDO: Valida timestamp antes de usar
        const timestamp = event?.timestamp;
        const dataEventoStr = timestamp ? formatDateTimeSql(toDateGmt3(timestamp)) : null;

        const sql = `
            SELECT TOP 1 Id
            FROM LOGS.Events
            WHERE Codigo = @Codigo
              AND ISEP = @ISEP
              AND Complemento = @Complemento
              AND Particao = @Particao
              ${dataEventoStr ? 'AND ABS(DATEDIFF(SECOND, DataEvento, CONVERT(datetime2, @DataEventoStr, 120))) <= 60' : ''}
            ORDER BY DataHora DESC;
        `;
        const params = { Codigo: codigo, ISEP: isep, Complemento: complemento, Particao: particao };
        if (dataEventoStr) params.DataEventoStr = dataEventoStr;
        
        logQuery('findEventId', sql, params);

        const request = pool.request()
            .input('Codigo', mssql.NVarChar(50), codigo)
            .input('ISEP', mssql.NVarChar(10), isep)
            .input('Complemento', mssql.NVarChar(100), complemento)
            .input('Particao', mssql.NVarChar(50), particao);
        if (dataEventoStr) request.input('DataEventoStr', mssql.NVarChar(30), dataEventoStr);

        const result = await request.query(sql);
        return result.recordset[0]?.Id || null;
    }

    async saveClosure(eventId, closure, isepFromEvent, codigoFromEvent, extra) {
        const pool = await this.getPool();
        
        // ✅ CORRIGIDO: Valida data do evento
        const dataEventoDate = extra?.timestamp ? toDateGmt3(extra.timestamp) : new Date();
        const dataEventoStr = formatDateTimeSql(dataEventoDate);
        
        const payload = {
            EventId: eventId,
            ISEP: normalizeText(isepFromEvent),
            Codigo: normalizeText(codigoFromEvent),
            Complemento: normalizeComplemento(extra?.complemento),
            Particao: normalizeText(extra?.particao),
            Descricao: normalizeText(extra?.descricao),
            DataEventoStr: dataEventoStr,
            Tipo: normalizeText(closure.type),
            Procedimento: normalizeText(closure.procedureText),
            ClosedBy: normalizeText(closure.user?.username),
            ClosedByDisplay: normalizeText(closure.user?.displayName)
        };
        logDebug('saveClosure - input', payload);

        const sql = `
            INSERT INTO LOGS.Closures (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento, Tipo, Procedimento, ClosedBy, ClosedByDisplay)
            OUTPUT INSERTED.Id
            VALUES (@EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, CONVERT(datetime2, @DataEventoStr, 120), @Tipo, @Procedimento, @ClosedBy, @ClosedByDisplay);
        `;
        logQuery('closure', sql, payload);

        const result = await pool.request()
            .input('EventId', mssql.Int, payload.EventId)
            .input('ISEP', mssql.NVarChar(10), payload.ISEP)
            .input('Codigo', mssql.NVarChar(50), payload.Codigo)
            .input('Complemento', mssql.NVarChar(100), payload.Complemento)
            .input('Particao', mssql.NVarChar(50), payload.Particao)
            .input('Descricao', mssql.NVarChar(mssql.MAX), payload.Descricao)
            .input('DataEventoStr', mssql.NVarChar(30), payload.DataEventoStr)
            .input('Tipo', mssql.NVarChar(50), payload.Tipo)
            .input('Procedimento', mssql.NVarChar(mssql.MAX), payload.Procedimento)
            .input('ClosedBy', mssql.NVarChar(200), payload.ClosedBy)
            .input('ClosedByDisplay', mssql.NVarChar(200), payload.ClosedByDisplay)
            .query(sql);

        const insertedId = result.recordset[0].Id;
        logDebug('saveClosure - inserted', { closureId: insertedId });
        return insertedId;
    }

    async saveEventAndClosure(event, closure) {
        const pool = await this.getPool();
        const tx = new mssql.Transaction(pool);
        await tx.begin();

        try {
            const codigo = normalizeText(event?.codigoEvento || event?.codigo || event?.code);
            const complementoRaw = normalizeText(event?.complemento);
            const complemento = normalizeComplemento(complementoRaw);
            const particao = normalizeText(event?.particao);
            const local = normalizeText(event?.local);
            const isep = normalizeText(event?.isep || event?.local || event?.clientId);
            let descricao = normalizeText(event?.descricao);
            descricao = normalizeArmDisarmDescricao(descricao, codigo, complemento);
            
            // ✅ CORRIGIDO: Valida timestamp
            const dataEventoDate = toDateGmt3(event?.timestamp);
            const dataEventoStr = formatDateTimeSql(dataEventoDate);
            
            // ✅ PRESERVA CAMPOS DE USUÁRIO NO RAW EVENT
            const normalizedEvent = { 
                ...event, 
                complemento,
                userName: event.userName || null,
                userId: event.userId || null,
                userMatricula: event.userMatricula || null,
                timestamp: dataEventoDate.getTime() // Garante timestamp válido
            };
            const rawEvent = JSON.stringify(normalizedEvent || {});
            
            const type = normalizeText(closure?.type);
            const procedureText = normalizeText(closure?.procedureText);
            const userName = normalizeText(closure?.user?.displayName || closure?.user?.username);

            logDebug('saveEventAndClosure - normalized inputs', {
                codigo, complemento, particao, local, isep, type, procedureText, userName, descricao, dataEventoStr
            });

            let eventId = await this.findEventId({ ...event, complemento });

            if (!eventId) {
                const sqlEvent = `
                    INSERT INTO LOGS.Events (Codigo, CodigoEvento, Complemento, Particao, Local, ISEP, Descricao, DataEvento, RawEvent)
                    OUTPUT INSERTED.Id
                    VALUES (@Codigo, @CodigoEvento, @Complemento, @Particao, @Local, @ISEP, @Descricao, CONVERT(datetime2, @DataEventoStr, 120), @RawEvent);
                `;
                logQuery('event(tx)', sqlEvent, {
                    Codigo: codigo,
                    CodigoEvento: codigo,
                    Complemento: complemento,
                    Particao: particao,
                    Local: local,
                    ISEP: isep,
                    Descricao: descricao,
                    DataEventoStr: dataEventoStr,
                    RawEvent: rawEvent
                });

                const reqEvent = new mssql.Request(tx);
                const evResult = await reqEvent
                    .input('Codigo', mssql.NVarChar(50), codigo)
                    .input('CodigoEvento', mssql.NVarChar(50), codigo)
                    .input('Complemento', mssql.NVarChar(100), complemento)
                    .input('Particao', mssql.NVarChar(50), particao)
                    .input('Local', mssql.NVarChar(100), local)
                    .input('ISEP', mssql.NVarChar(10), isep)
                    .input('Descricao', mssql.NVarChar(mssql.MAX), descricao)
                    .input('DataEventoStr', mssql.NVarChar(30), dataEventoStr)
                    .input('RawEvent', mssql.NVarChar(mssql.MAX), rawEvent)
                    .query(sqlEvent);

                eventId = evResult.recordset[0].Id;
                logDebug('saveEventAndClosure - event inserted', { eventId });
            } else {
                logDebug('saveEventAndClosure - reused existing eventId', { eventId });
            }

            const sqlClosure = `
                INSERT INTO LOGS.Closures (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento, Tipo, Procedimento, ClosedBy, ClosedByDisplay)
                OUTPUT INSERTED.Id
                VALUES (@EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, CONVERT(datetime2, @DataEventoStr, 120), @Tipo, @Procedimento, @ClosedBy, @ClosedByDisplay);
            `;

            logQuery('closure(tx)', sqlClosure, {
                EventId: eventId,
                ISEP: isep,
                Codigo: codigo,
                Complemento: complemento,
                Particao: particao,
                Descricao: descricao,
                DataEventoStr: dataEventoStr,
                Tipo: type,
                Procedimento: procedureText,
                ClosedBy: closure?.user?.username,
                ClosedByDisplay: closure?.user?.displayName
            });

            const reqClosure = new mssql.Request(tx);
            const clResult = await reqClosure
                .input('EventId', mssql.Int, eventId)
                .input('ISEP', mssql.NVarChar(10), isep)
                .input('Codigo', mssql.NVarChar(50), codigo)
                .input('Complemento', mssql.NVarChar(100), complemento)
                .input('Particao', mssql.NVarChar(50), particao)
                .input('Descricao', mssql.NVarChar(mssql.MAX), descricao)
                .input('DataEventoStr', mssql.NVarChar(30), dataEventoStr)
                .input('Tipo', mssql.NVarChar(50), type)
                .input('Procedimento', mssql.NVarChar(mssql.MAX), procedureText)
                .input('ClosedBy', mssql.NVarChar(200), normalizeText(closure?.user?.username))
                .input('ClosedByDisplay', mssql.NVarChar(200), normalizeText(closure?.user?.displayName))
                .query(sqlClosure);

            const closureId = clResult.recordset[0].Id;
            logDebug('saveEventAndClosure - closure inserted', { closureId });

            await new mssql.Request(tx)
                .input('EventId', mssql.Int, eventId)
                .input('ClosureId', mssql.Int, closureId)
                .query(`UPDATE LOGS.Events SET ClosureId = @ClosureId WHERE Id = @EventId;`);

            await new mssql.Request(tx)
                .input('ClosureId', mssql.Int, closureId)
                .input('ISEP', mssql.NVarChar(10), isep)
                .input('DataEventoStr', mssql.NVarChar(30), dataEventoStr)
                .query(`
                    UPDATE LOGS.Events
                    SET ClosureId = @ClosureId
                    WHERE ClosureId IS NULL
                    AND ISEP = @ISEP
                    AND DataEvento >= CONVERT(datetime2, @DataEventoStr, 120);
                `);

            await tx.commit();
            logDebug('saveEventAndClosure - committed', { eventId, closureId });
            return { eventId, closureId };
        } catch (err) {
            await tx.rollback();
            logDebug('saveEventAndClosure - rolled back', { error: err.message });
            throw err;
        }
    }

    // NOVO: busca últimos eventos para hidratar o front após reload
    async getRecentEvents(limit = 300) {
        const pool = await this.getPool();
        const safeLimit = Math.max(1, Math.min(Number(limit) || 300, 1000));
        const sql = `
            SELECT TOP (@Limit)
                   Id, Codigo, CodigoEvento, Complemento, Particao, Local, ISEP,
                   Descricao, DataEvento, RawEvent, DataHora, ClosureId
            FROM LOGS.Events
            ORDER BY DataHora DESC, Id DESC;
        `;
        const result = await pool.request()
            .input('Limit', mssql.Int, safeLimit)
            .query(sql);
        return result.recordset || [];
    }
}

module.exports = { LogsRepository };