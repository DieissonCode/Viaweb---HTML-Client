const mssql = require('mssql');

function normalizeText(val) {
    return (val === null || val === undefined) ? '' : String(val);
}

class LogsRepository {
    constructor(getPoolFn) {
        this.getPool = getPoolFn;
    }

    async saveEventIfNeeded(event) {
        if (!event) return null;
        const pool = await this.getPool();

        const result = await pool.request()
            .input('CodigoEvento', mssql.NVarChar(50), normalizeText(event.codigoEvento))
            .input('Complemento', mssql.NVarChar(100), normalizeText(event.complemento))
            .input('Particao', mssql.NVarChar(50), normalizeText(event.particao))
            .input('Local', mssql.NVarChar(100), normalizeText(event.local || event.clientId))
            .input('RawEvent', mssql.NVarChar(mssql.MAX), JSON.stringify(event))
            .query(`
                INSERT INTO LOGS.Events (CodigoEvento, Complemento, Particao, Local, RawEvent)
                OUTPUT INSERTED.Id
                VALUES (@CodigoEvento, @Complemento, @Particao, @Local, @RawEvent);
            `);

        return result.recordset[0].Id;
    }

    async saveClosure(eventId, closure) {
        const pool = await this.getPool();

        const result = await pool.request()
            .input('EventId', mssql.Int, eventId)
            .input('Type', mssql.NVarChar(50), normalizeText(closure.type))
            .input('ProcedureText', mssql.NVarChar(mssql.MAX), normalizeText(closure.procedureText))
            .input('UserName', mssql.NVarChar(200), normalizeText(closure.user?.displayName || closure.user?.username))
            .query(`
                INSERT INTO LOGS.Closures (EventId, Type, ProcedureText, UserName)
                OUTPUT INSERTED.Id
                VALUES (@EventId, @Type, @ProcedureText, @UserName);
            `);

        return result.recordset[0].Id;
    }

    async saveEventAndClosure(event, closure) {
        const pool = await this.getPool();
        const tx = new mssql.Transaction(pool);
        await tx.begin();

        try {
            const request = new mssql.Request(tx);

            const codigoEvento = normalizeText(event?.codigoEvento);
            const complemento = normalizeText(event?.complemento);
            const particao = normalizeText(event?.particao);
            const local = normalizeText(event?.local || event?.clientId);
            const rawEvent = JSON.stringify(event || {});
            const type = normalizeText(closure?.type);
            const procedureText = normalizeText(closure?.procedureText);
            const userName = normalizeText(closure?.user?.displayName || closure?.user?.username);

            const evResult = await request
                .input('CodigoEvento', mssql.NVarChar(50), codigoEvento)
                .input('Complemento', mssql.NVarChar(100), complemento)
                .input('Particao', mssql.NVarChar(50), particao)
                .input('Local', mssql.NVarChar(100), local)
                .input('RawEvent', mssql.NVarChar(mssql.MAX), rawEvent)
                .query(`
                    INSERT INTO LOGS.Events (CodigoEvento, Complemento, Particao, Local, RawEvent)
                    OUTPUT INSERTED.Id
                    VALUES (@CodigoEvento, @Complemento, @Particao, @Local, @RawEvent);
                `);

            const eventId = evResult.recordset[0].Id;

            const clResult = await request
                .input('EventId', mssql.Int, eventId)
                .input('Type', mssql.NVarChar(50), type)
                .input('ProcedureText', mssql.NVarChar(mssql.MAX), procedureText)
                .input('UserName', mssql.NVarChar(200), userName)
                .query(`
                    INSERT INTO LOGS.Closures (EventId, Type, ProcedureText, UserName)
                    OUTPUT INSERTED.Id
                    VALUES (@EventId, @Type, @ProcedureText, @UserName);
                `);

            await tx.commit();
            return { eventId, closureId: clResult.recordset[0].Id };
        } catch (err) {
            await tx.rollback();
            throw err;
        }
    }
}

module.exports = { LogsRepository };