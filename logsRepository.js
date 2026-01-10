﻿﻿const mssql = require('mssql');

// Simple in‑memory cache for deduplication (5 min TTL)
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const dedupeCache = new Map(); // key → { ts, count }

function pruneDedupeCache() {
    const now = Date.now();
    for (const [key, val] of dedupeCache.entries()) {
        if (!val?.ts || now - val.ts > DEDUPE_TTL_MS) dedupeCache.delete(key);
    }
}

function normalizeComplemento(comp) {
    if (comp === undefined || comp === null || comp === '') return '0';
    const s = String(comp).trim();
    return s === '-' ? '0' : s;
}

function makeDedupeKey(codigo, isep, complemento, dataEventoStr) {
    return `${codigo}|${isep}|${complemento}|${dataEventoStr}`;
}

function normalizeText(val) {
    return val == null ? '' : String(val);
}

/* ---------- Date handling ---------- */
// Convert any timestamp (seconds or ms) to a Date object (GMT‑3 is handled later by SQL)
function toDateGmt3(rawTs) {
    if (rawTs == null) return new Date();
    const num = Number(rawTs);
    if (!Number.isFinite(num)) {
        console.warn('[logs-repo] ⚠️ Invalid timestamp:', rawTs);
        return new Date();
    }
    // If the value looks like seconds, multiply by 1000
    return new Date(num < 1e10 ? num * 1000 : num);
}

// Format a Date as a SQL‑compatible string (yyyy‑MM‑dd HH:mm:ss.SSS)
function formatDateTimeSql(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        console.warn('[logs-repo] ⚠️ Invalid Date object, using now');
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

/* ---------- Logging helpers ---------- */
function logDebug(step, payload) {
    // console.log(`[logs-repo] ${step}:`, payload);
}
function logQuery(step, sql, params) {
    // console.log(`[logs-repo] QUERY ${step}:\n${sql.trim()}\nPARAMS:`, params);
}

/* ---------- Description normalizer ---------- */
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

/* ==============================
   LogsRepository class
   ============================== */
class LogsRepository {
    constructor(getPoolFn) {
        this.getPool = getPoolFn;
    }

    /* ---------- Save incoming event ---------- */
    async saveIncomingEvent(event) {
        if (!event) return null;
        const pool = await this.getPool();

        const codigo       = normalizeText(event.codigoEvento || event.codigo || event.code);
        const complemento  = normalizeComplemento(event.complemento);
        const particao     = normalizeText(event.particao);
        const local        = normalizeText(event.local || event.isep || event.clientId);
        const isep         = normalizeText(event.isep || event.local || event.clientId);
        const dataEvento   = toDateGmt3(event.timestamp);
        const dataEventoStr= formatDateTimeSql(dataEvento);

        let descricao = normalizeText(event.descricao);
        descricao = normalizeArmDisarmDescricao(descricao, codigo, complemento);

        const normalizedEvent = {
            ...event,
            complemento,
            userName: event.userName || null,
            userId: event.userId || null,
            userMatricula: event.userMatricula || null
        };
        const rawEvent = JSON.stringify(normalizedEvent);

        // Deduplication cache
        pruneDedupeCache();
        const dedupeKey = makeDedupeKey(codigo, isep, complemento, dataEventoStr);
        if (dedupeCache.has(dedupeKey)) {
            logDebug('saveIncomingEvent - duplicate (memory)', { dedupeKey });
            return null;
        }
        dedupeCache.set(dedupeKey, { ts: Date.now(), count: 1 });

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

    /* ---------- Find existing event ID ---------- */
    async findEventId(event) {
        const pool = await this.getPool();
        const codigo      = normalizeText(event?.codigoEvento || event?.codigo || event?.code);
        const complemento = normalizeComplemento(event?.complemento);
        const particao    = normalizeText(event?.particao);
        const isep        = normalizeText(event?.isep || event?.local || event?.clientId);

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

        const request = pool.request()
            .input('Codigo', mssql.NVarChar(50), codigo)
            .input('ISEP', mssql.NVarChar(10), isep)
            .input('Complemento', mssql.NVarChar(100), complemento)
            .input('Particao', mssql.NVarChar(50), particao);
        if (dataEventoStr) request.input('DataEventoStr', mssql.NVarChar(30), dataEventoStr);

        const result = await request.query(sql);
        return result.recordset[0]?.Id || null;
    }

    /* ---------- Save closure ---------- */
    async saveClosure(eventId, closure, isepFromEvent, codigoFromEvent, extra) {
        const pool = await this.getPool();

        const dataEvento   = extra?.timestamp ? toDateGmt3(extra.timestamp) : new Date();
        const dataEventoStr= formatDateTimeSql(dataEvento);

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

    /* ---------- Save event + closure in a transaction ---------- */
    async saveEventAndClosure(event, closure) {
        const pool = await this.getPool();
        const tx = new mssql.Transaction(pool);
        await tx.begin();

        try {
            const codigo       = normalizeText(event?.codigoEvento || event?.codigo || event?.code);
            const complemento  = normalizeComplemento(event?.complemento);
            const particao     = normalizeText(event?.particao);
            const local        = normalizeText(event?.local);
            const isep         = normalizeText(event?.isep || event?.local || event?.clientId);
            let descricao      = normalizeText(event?.descricao);
            descricao = normalizeArmDisarmDescricao(descricao, codigo, complemento);

            const dataEvento   = toDateGmt3(event?.timestamp);
            const dataEventoStr= formatDateTimeSql(dataEvento);

            const normalizedEvent = {
                ...event,
                complemento,
                userName: event.userName || null,
                userId: event.userId || null,
                userMatricula: event.userMatricula || null,
                timestamp: dataEvento.getTime()
            };
            const rawEvent = JSON.stringify(normalizedEvent);

            const type          = normalizeText(closure?.type);
            const procedureText = normalizeText(closure?.procedureText);
            const userName      = normalizeText(closure?.user?.displayName || closure?.user?.username);

            logDebug('saveEventAndClosure - normalized inputs', {
                codigo, complemento, particao, local, isep,
                type, procedureText, userName, descricao, dataEventoStr
            });

            // Try to reuse an existing event
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

                const evReq = new mssql.Request(tx);
                const evResult = await evReq
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
                logDebug('saveEventAndClosure - reused eventId', { eventId });
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

            const clReq = new mssql.Request(tx);
            const clResult = await clReq
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

            // Link closure to event
            await new mssql.Request(tx)
                .input('EventId', mssql.Int, eventId)
                .input('ClosureId', mssql.Int, closureId)
                .query(`UPDATE LOGS.Events SET ClosureId = @ClosureId WHERE Id = @EventId;`);

            // Additional safety update (in case of race conditions)
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

    /* ---------- Get recent events (for UI reload) ---------- */
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
