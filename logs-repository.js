const mssql = require('mssql');

// Constantes
const TIME_WINDOW_SECONDS = 60;
const TRANSACTION_TIMEOUT_MS = 30000;

const MAX_VARCHAR_LENGTH = {
    CODIGO: 50,
    COMPLEMENTO: 100,
    PARTICAO: 50,
    LOCAL: 100,
    ISEP: 10,
    TIPO: 50,
    USER: 200,
    DATETIME_STR: 30
};

const QUERIES = {
    INSERT_EVENT: `
        INSERT INTO LOGS.Events (Codigo, CodigoEvento, Complemento, Particao, Local, ISEP, Descricao, DataEvento, RawEvent)
        OUTPUT INSERTED.Id
        VALUES (@Codigo, @CodigoEvento, @Complemento, @Particao, @Local, @ISEP, @Descricao, CONVERT(datetime2, @DataEventoStr, 120), @RawEvent);
    `,
    FIND_EVENT: `
        SELECT TOP 1 Id
        FROM LOGS.Events
        WHERE Codigo = @Codigo
          AND ISEP = @ISEP
          AND Complemento = @Complemento
          AND Particao = @Particao
          {DATE_CONDITION}
        ORDER BY DataHora DESC;
    `,
    INSERT_CLOSURE: `
        INSERT INTO LOGS.Closures (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento, Tipo, Procedimento, ClosedBy, ClosedByDisplay)
        OUTPUT INSERTED.Id
        VALUES (@EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, CONVERT(datetime2, @DataEventoStr, 120), @Tipo, @Procedimento, @ClosedBy, @ClosedByDisplay);
    `,
    UPDATE_EVENT_CLOSURE: `
        UPDATE LOGS.Events 
        SET ClosureId = @ClosureId 
        WHERE Id = @EventId;
    `,
    UPDATE_RELATED_EVENTS: `
        UPDATE LOGS.Events
        SET ClosureId = @ClosureId
        WHERE ClosureId IS NULL
          AND ISEP = @ISEP
          AND Codigo = @Codigo
          AND Complemento = @Complemento
          AND Particao = @Particao
          AND ABS(DATEDIFF(SECOND, DataEvento, CONVERT(datetime2, @DataEventoStr, 120))) <= ${TIME_WINDOW_SECONDS};
    `
};

// Helpers de normalização e formatação
function normalizeText(val) {
    return (val === null || val === undefined) ? '' : String(val);
}

function toDateGmt3(rawTs) {
    if (rawTs === null || rawTs === undefined || Number.isNaN(Number(rawTs))) return new Date();
    return new Date(Number(rawTs));
}

function formatDateTimeSql(dateObj) {
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

// Helpers de log
function logDebug(step, payload) {
    console.log(`[logs-repo] ${step}:`, payload);
}

function logQuery(step, sql, params) {
    console.log(`[logs-repo] QUERY ${step}:\n${sql.trim()}\nPARAMS:`, params);
}

class LogsRepository {
    constructor(getPoolFn) {
        this.getPool = getPoolFn;
    }

    // Extrai campos comuns do evento
    extractEventFields(event) {
        if (!event) return null;
        
        const dataEventoDate = event.timestamp ? toDateGmt3(event.timestamp) : new Date();
        
        return {
            codigo: normalizeText(event.codigoEvento || event.codigo || event.code),
            complemento: normalizeText(event.complemento),
            particao: normalizeText(event.particao),
            local: normalizeText(event.local),
            isep: normalizeText(event.isep || event.local || event.clientId),
            descricao: normalizeText(event.descricao),
            dataEventoDate,
            dataEventoStr: formatDateTimeSql(dataEventoDate),
            rawEvent: JSON.stringify(event)
        };
    }

    // Helper para adicionar inputs no request
    addEventInputs(request, fields) {
        return request
            .input('Codigo', mssql.NVarChar(MAX_VARCHAR_LENGTH.CODIGO), fields.codigo)
            .input('CodigoEvento', mssql.NVarChar(MAX_VARCHAR_LENGTH.CODIGO), fields.codigo)
            .input('Complemento', mssql.NVarChar(MAX_VARCHAR_LENGTH.COMPLEMENTO), fields.complemento)
            .input('Particao', mssql.NVarChar(MAX_VARCHAR_LENGTH.PARTICAO), fields.particao)
            .input('Local', mssql.NVarChar(MAX_VARCHAR_LENGTH.LOCAL), fields.local)
            .input('ISEP', mssql.NVarChar(MAX_VARCHAR_LENGTH.ISEP), fields.isep)
            .input('Descricao', mssql.NVarChar(mssql.MAX), fields.descricao)
            .input('DataEventoStr', mssql.NVarChar(MAX_VARCHAR_LENGTH.DATETIME_STR), fields.dataEventoStr)
            .input('RawEvent', mssql.NVarChar(mssql.MAX), fields.rawEvent);
    }

    // Salva evento na chegada (sem closure)
    async saveIncomingEvent(event) {
        if (!event) {
            logDebug('saveIncomingEvent - empty event', null);
            return null;
        }

        const pool = await this.getPool();
        const fields = this.extractEventFields(event);

        const params = {
            Codigo: fields.codigo,
            CodigoEvento: fields.codigo,
            Complemento: fields.complemento,
            Particao: fields.particao,
            Local: fields.local,
            ISEP: fields.isep,
            Descricao: fields.descricao,
            DataEventoStr: fields.dataEventoStr,
            RawEvent: event
        };
        
        logQuery('event(incoming)', QUERIES.INSERT_EVENT, params);

        const request = pool.request();
        this.addEventInputs(request, fields);
        
        const result = await request.query(QUERIES.INSERT_EVENT);
        const eventId = result.recordset[0].Id;
        
        logDebug('saveIncomingEvent - inserted', { eventId });
        return eventId;
    }

    // Busca EventId já existente para não duplicar ao fechar
    async findEventId(event) {
        const pool = await this.getPool();
        const fields = this.extractEventFields(event);
        
        if (!fields) {
            logDebug('findEventId - invalid event', null);
            return null;
        }

        const hasTimestamp = event?.timestamp !== null && event?.timestamp !== undefined;
        const dateCondition = hasTimestamp 
            ? `AND ABS(DATEDIFF(SECOND, DataEvento, CONVERT(datetime2, @DataEventoStr, 120))) <= ${TIME_WINDOW_SECONDS}`
            : '';
        
        const sql = QUERIES.FIND_EVENT.replace('{DATE_CONDITION}', dateCondition);
        
        const params = {
            Codigo: fields.codigo,
            ISEP: fields.isep,
            Complemento: fields.complemento,
            Particao: fields.particao,
            DataEventoStr: hasTimestamp ? fields.dataEventoStr : null
        };
        
        logQuery('findEventId', sql, params);

        const request = pool.request()
            .input('Codigo', mssql.NVarChar(MAX_VARCHAR_LENGTH.CODIGO), fields.codigo)
            .input('ISEP', mssql.NVarChar(MAX_VARCHAR_LENGTH.ISEP), fields.isep)
            .input('Complemento', mssql.NVarChar(MAX_VARCHAR_LENGTH.COMPLEMENTO), fields.complemento)
            .input('Particao', mssql.NVarChar(MAX_VARCHAR_LENGTH.PARTICAO), fields.particao);
        
        if (hasTimestamp) {
            request.input('DataEventoStr', mssql.NVarChar(MAX_VARCHAR_LENGTH.DATETIME_STR), fields.dataEventoStr);
        }

        const result = await request.query(sql);
        const eventId = result.recordset[0]?.Id || null;
        
        if (!eventId) {
            logDebug('findEventId - not found', params);
        }
        
        return eventId;
    }

    // Adiciona inputs de closure no request
    addClosureInputs(request, payload) {
        return request
            .input('EventId', mssql.Int, payload.EventId)
            .input('ISEP', mssql.NVarChar(MAX_VARCHAR_LENGTH.ISEP), payload.ISEP)
            .input('Codigo', mssql.NVarChar(MAX_VARCHAR_LENGTH.CODIGO), payload.Codigo)
            .input('Complemento', mssql.NVarChar(MAX_VARCHAR_LENGTH.COMPLEMENTO), payload.Complemento)
            .input('Particao', mssql.NVarChar(MAX_VARCHAR_LENGTH.PARTICAO), payload.Particao)
            .input('Descricao', mssql.NVarChar(mssql.MAX), payload.Descricao)
            .input('DataEventoStr', mssql.NVarChar(MAX_VARCHAR_LENGTH.DATETIME_STR), payload.DataEventoStr)
            .input('Tipo', mssql.NVarChar(MAX_VARCHAR_LENGTH.TIPO), payload.Tipo)
            .input('Procedimento', mssql.NVarChar(mssql.MAX), payload.Procedimento)
            .input('ClosedBy', mssql.NVarChar(MAX_VARCHAR_LENGTH.USER), payload.ClosedBy)
            .input('ClosedByDisplay', mssql.NVarChar(MAX_VARCHAR_LENGTH.USER), payload.ClosedByDisplay);
    }

    async saveClosure(eventId, closure, isepFromEvent, codigoFromEvent, extra) {
        if (!eventId || !closure) {
            logDebug('saveClosure - invalid input', { eventId, hasClosure: !!closure });
            return null;
        }

        const pool = await this.getPool();
        
        const payload = {
            EventId: eventId,
            ISEP: normalizeText(isepFromEvent),
            Codigo: normalizeText(codigoFromEvent),
            Complemento: normalizeText(extra?.complemento),
            Particao: normalizeText(extra?.particao),
            Descricao: normalizeText(extra?.descricao),
            DataEventoStr: extra?.dataEventoStr || (extra?.dataEvento ? formatDateTimeSql(extra.dataEvento) : null),
            Tipo: normalizeText(closure.type),
            Procedimento: normalizeText(closure.procedureText),
            ClosedBy: normalizeText(closure.user?.username),
            ClosedByDisplay: normalizeText(closure.user?.displayName)
        };
        
        logDebug('saveClosure - input', payload);
        logQuery('closure', QUERIES.INSERT_CLOSURE, payload);

        const request = pool.request();
        this.addClosureInputs(request, payload);
        
        const result = await request.query(QUERIES.INSERT_CLOSURE);
        const insertedId = result.recordset[0].Id;
        
        logDebug('saveClosure - inserted', { closureId: insertedId });
        return insertedId;
    }

    async saveEventAndClosure(event, closure) {
        if (!event || !closure) {
            logDebug('saveEventAndClosure - invalid input', { hasEvent: !!event, hasClosure: !!closure });
            throw new Error('Event and closure are required');
        }

        const pool = await this.getPool();
        const tx = new mssql.Transaction(pool);
        tx.config.requestTimeout = TRANSACTION_TIMEOUT_MS;
        
        await tx.begin();

        try {
            const fields = this.extractEventFields(event);
            const type = normalizeText(closure?.type);
            const procedureText = normalizeText(closure?.procedureText);
            const userName = normalizeText(closure?.user?.displayName || closure?.user?.username);

            logDebug('saveEventAndClosure - normalized inputs', {
                codigo: fields.codigo,
                complemento: fields.complemento,
                particao: fields.particao,
                local: fields.local,
                isep: fields.isep,
                type,
                procedureText,
                userName,
                descricao: fields.descricao,
                dataEventoStr: fields.dataEventoStr
            });

            // Tentar reaproveitar EventId já existente
            let eventId = await this.findEventId(event);

            // Se não existir, insere evento dentro da transação
            if (!eventId) {
                const paramsEvent = {
                    Codigo: fields.codigo,
                    CodigoEvento: fields.codigo,
                    Complemento: fields.complemento,
                    Particao: fields.particao,
                    Local: fields.local,
                    ISEP: fields.isep,
                    Descricao: fields.descricao,
                    DataEventoStr: fields.dataEventoStr,
                    RawEvent: event
                };
                
                logQuery('event(tx)', QUERIES.INSERT_EVENT, paramsEvent);

                const reqEvent = new mssql.Request(tx);
                this.addEventInputs(reqEvent, fields);
                
                const evResult = await reqEvent.query(QUERIES.INSERT_EVENT);
                eventId = evResult.recordset[0].Id;
                
                logDebug('saveEventAndClosure - event inserted', { eventId });
            } else {
                logDebug('saveEventAndClosure - reused existing eventId', { eventId });
            }

            // Closure
            const paramsClosure = {
                EventId: eventId,
                ISEP: fields.isep,
                Codigo: fields.codigo,
                Complemento: fields.complemento,
                Particao: fields.particao,
                Descricao: fields.descricao,
                DataEventoStr: fields.dataEventoStr,
                Tipo: type,
                Procedimento: procedureText,
                ClosedBy: closure?.user?.username,
                ClosedByDisplay: closure?.user?.displayName
            };
            
            logQuery('closure(tx)', QUERIES.INSERT_CLOSURE, paramsClosure);

            const reqClosure = new mssql.Request(tx);
            this.addClosureInputs(reqClosure, {
                EventId: eventId,
                ISEP: fields.isep,
                Codigo: fields.codigo,
                Complemento: fields.complemento,
                Particao: fields.particao,
                Descricao: fields.descricao,
                DataEventoStr: fields.dataEventoStr,
                Tipo: type,
                Procedimento: procedureText,
                ClosedBy: normalizeText(closure?.user?.username),
                ClosedByDisplay: normalizeText(closure?.user?.displayName)
            });
            
            const clResult = await reqClosure.query(QUERIES.INSERT_CLOSURE);
            const closureId = clResult.recordset[0].Id;
            
            logDebug('saveEventAndClosure - closure inserted', { closureId });

            // Marca o evento principal com o encerramento
            await new mssql.Request(tx)
                .input('EventId', mssql.Int, eventId)
                .input('ClosureId', mssql.Int, closureId)
                .query(QUERIES.UPDATE_EVENT_CLOSURE);

            // Marca TODOS os eventos associados
            await new mssql.Request(tx)
                .input('ClosureId', mssql.Int, closureId)
                .input('ISEP', mssql.NVarChar(MAX_VARCHAR_LENGTH.ISEP), fields.isep)
                .input('Codigo', mssql.NVarChar(MAX_VARCHAR_LENGTH.CODIGO), fields.codigo)
                .input('Complemento', mssql.NVarChar(MAX_VARCHAR_LENGTH.COMPLEMENTO), fields.complemento)
                .input('Particao', mssql.NVarChar(MAX_VARCHAR_LENGTH.PARTICAO), fields.particao)
                .input('DataEventoStr', mssql.NVarChar(MAX_VARCHAR_LENGTH.DATETIME_STR), fields.dataEventoStr)
                .query(QUERIES.UPDATE_RELATED_EVENTS);

            await tx.commit();
            logDebug('saveEventAndClosure - committed', { eventId, closureId });
            
            return { eventId, closureId };
        } catch (err) {
            await tx.rollback();
            
            const error = {
                message: err.message,
                stack: err.stack,
                context: {
                    hasEvent: !!event,
                    hasClosure: !!closure
                }
            };
            
            logDebug('saveEventAndClosure - rolled back', error);
            throw err;
        }
    }
}

module.exports = { LogsRepository };