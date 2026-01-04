const mssql = require('mssql');

function normalizeText(val) {
    return (val === null || val === undefined) ? '' : String(val);
}

// Log helper simples
function logDebug(step, payload) {
    console.log(`[logs-repo] ${step}:`, payload);
}

// Loga a query + params normalizados
function logQuery(step, sql, params) {
    console.log(`[logs-repo] QUERY ${step}:\n${sql.trim()}\nPARAMS:`, params);
}

class LogsRepository {
    constructor(getPoolFn) {
        this.getPool = getPoolFn;
    }

    async saveEventIfNeeded(event) {
        if (!event) return null;
        const pool = await this.getPool();
        const codigo = normalizeText(event.codigoEvento || event.codigo || event.code);
        const payload = {
            Codigo: codigo,
            Complemento: normalizeText(event.complemento),
            Particao: normalizeText(event.particao),
            Local: normalizeText(event.local),
            ISEP: normalizeText(event.local || event.clientId)
        };
        logDebug('saveEventIfNeeded - input', payload);

        const sql = `
            INSERT INTO LOGS.Events (Codigo, CodigoEvento, Complemento, Particao, Local, ISEP, RawEvent)
            OUTPUT INSERTED.Id
            VALUES (@Codigo, @CodigoEvento, @Complemento, @Particao, @Local, @ISEP, @RawEvent);
        `;
        logQuery('event', sql, { ...payload, CodigoEvento: payload.Codigo, RawEvent: event });

        const result = await pool.request()
            .input('Codigo', mssql.NVarChar(50), payload.Codigo)
            .input('CodigoEvento', mssql.NVarChar(50), payload.Codigo)
            .input('Complemento', mssql.NVarChar(100), payload.Complemento)
            .input('Particao', mssql.NVarChar(50), payload.Particao)
            .input('Local', mssql.NVarChar(100), payload.Local)
            .input('ISEP', mssql.NVarChar(10), payload.ISEP)
            .input('RawEvent', mssql.NVarChar(mssql.MAX), JSON.stringify(event))
            .query(sql);

        const insertedId = result.recordset[0].Id;
        logDebug('saveEventIfNeeded - inserted', { eventId: insertedId });
        return insertedId;
    }

    async saveClosure(eventId, closure, isepFromEvent, codigoFromEvent, extra) {
        const pool = await this.getPool();
        const payload = {
            EventId: eventId,
            ISEP: normalizeText(isepFromEvent),
            Codigo: normalizeText(codigoFromEvent),
            Complemento: normalizeText(extra?.complemento),
            Particao: normalizeText(extra?.particao),
            Descricao: normalizeText(extra?.descricao),
            DataEvento: extra?.dataEvento || null,
            Tipo: normalizeText(closure.type),
            Procedimento: normalizeText(closure.procedureText),
            ClosedBy: normalizeText(closure.user?.username),
            ClosedByDisplay: normalizeText(closure.user?.displayName)
        };
        logDebug('saveClosure - input', payload);

        const sql = `
            INSERT INTO LOGS.Closures (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento, Tipo, Procedimento, ClosedBy, ClosedByDisplay)
            OUTPUT INSERTED.Id
            VALUES (@EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, @DataEvento, @Tipo, @Procedimento, @ClosedBy, @ClosedByDisplay);
        `;
        logQuery('closure', sql, payload);

        const result = await pool.request()
            .input('EventId', mssql.Int, payload.EventId)
            .input('ISEP', mssql.NVarChar(10), payload.ISEP)
            .input('Codigo', mssql.NVarChar(50), payload.Codigo)
            .input('Complemento', mssql.NVarChar(100), payload.Complemento)
            .input('Particao', mssql.NVarChar(50), payload.Particao)
            .input('Descricao', mssql.NVarChar(mssql.MAX), payload.Descricao)
            .input('DataEvento', mssql.DateTime2, payload.DataEvento)
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
            const complemento = normalizeText(event?.complemento);
            const particao = normalizeText(event?.particao);
            const local = normalizeText(event?.local);
            const isep = normalizeText(event?.isep || event?.local || event?.clientId);
            const rawEvent = JSON.stringify(event || {});
            const type = normalizeText(closure?.type);
            const procedureText = normalizeText(closure?.procedureText);
            const userName = normalizeText(closure?.user?.displayName || closure?.user?.username);
            const descricao = normalizeText(event?.descricao);
            const dataEvento = event?.timestamp ? new Date(event.timestamp) : new Date();

            logDebug('saveEventAndClosure - normalized inputs', {
                codigo, complemento, particao, local, isep, type, procedureText, userName, descricao, dataEvento
            });

            const sqlEvent = `
                INSERT INTO LOGS.Events (Codigo, CodigoEvento, Complemento, Particao, Local, ISEP, RawEvent)
                OUTPUT INSERTED.Id
                VALUES (@Codigo, @CodigoEvento, @Complemento, @Particao, @Local, @ISEP, @RawEvent);
            `;
            logQuery('event(tx)', sqlEvent, {
                Codigo: codigo,
                CodigoEvento: codigo,
                Complemento: complemento,
                Particao: particao,
                Local: local,
                ISEP: isep,
                RawEvent: event
            });

            const reqEvent = new mssql.Request(tx);
            const evResult = await reqEvent
                .input('Codigo', mssql.NVarChar(50), codigo)
                .input('CodigoEvento', mssql.NVarChar(50), codigo)
                .input('Complemento', mssql.NVarChar(100), complemento)
                .input('Particao', mssql.NVarChar(50), particao)
                .input('Local', mssql.NVarChar(100), local)
                .input('ISEP', mssql.NVarChar(10), isep)
                .input('RawEvent', mssql.NVarChar(mssql.MAX), rawEvent)
                .query(sqlEvent);

            const eventId = evResult.recordset[0].Id;
            logDebug('saveEventAndClosure - event inserted', { eventId });

            const sqlClosure = `
                INSERT INTO LOGS.Closures (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento, Tipo, Procedimento, ClosedBy, ClosedByDisplay)
                OUTPUT INSERTED.Id
                VALUES (@EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, @DataEvento, @Tipo, @Procedimento, @ClosedBy, @ClosedByDisplay);
            `;
            logQuery('closure(tx)', sqlClosure, {
                EventId: eventId,
                ISEP: isep,
                Codigo: codigo,
                Complemento: complemento,
                Particao: particao,
                Descricao: descricao,
                DataEvento: dataEvento,
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
                .input('DataEvento', mssql.DateTime2, dataEvento)
                .input('Tipo', mssql.NVarChar(50), type)
                .input('Procedimento', mssql.NVarChar(mssql.MAX), procedureText)
                .input('ClosedBy', mssql.NVarChar(200), normalizeText(closure?.user?.username))
                .input('ClosedByDisplay', mssql.NVarChar(200), normalizeText(closure?.user?.displayName))
                .query(sqlClosure);

            const closureId = clResult.recordset[0].Id;
            logDebug('saveEventAndClosure - closure inserted', { closureId });

            await tx.commit();
            logDebug('saveEventAndClosure - committed', { eventId, closureId });
            return { eventId, closureId };
        } catch (err) {
            await tx.rollback();
            logDebug('saveEventAndClosure - rolled back', { error: err.message });
            throw err;
        }
    }
}

module.exports = { LogsRepository };