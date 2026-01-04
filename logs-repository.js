const mssql = require('mssql');

class LogsRepository {
    constructor(getPoolFn) {
        this.getPool = getPoolFn;
    }

    async ensureSchema() {
        const pool = await this.getPool();
        await pool.request().batch(`
            IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'LOGS')
            BEGIN
                PRINT('Criando schema LOGS');
                EXEC('CREATE SCHEMA LOGS');
            END

            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[LOGS].[Events]') AND type = N'U')
            BEGIN
                PRINT('Criando LOGS.Events');
                CREATE TABLE [LOGS].[Events](
                    [Id] BIGINT IDENTITY(1,1) PRIMARY KEY,
                    [EventId] NVARCHAR(100) NULL,
                    [ISEP] NVARCHAR(16) NOT NULL,
                    [Codigo] NVARCHAR(16) NOT NULL,
                    [Complemento] NVARCHAR(64) NULL,
                    [Particao] NVARCHAR(32) NULL,
                    [Descricao] NVARCHAR(512) NULL,
                    [DataEvento] DATETIME2 NULL,
                    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                );
                CREATE INDEX IX_Events_EventId ON [LOGS].[Events]([EventId]);
            END

            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[LOGS].[Closures]') AND type = N'U')
            BEGIN
                PRINT('Criando LOGS.Closures');
                CREATE TABLE [LOGS].[Closures](
                    [Id] BIGINT IDENTITY(1,1) PRIMARY KEY,
                    [EventId] NVARCHAR(100) NULL,
                    [ISEP] NVARCHAR(16) NOT NULL,
                    [Codigo] NVARCHAR(16) NOT NULL,
                    [Complemento] NVARCHAR(64) NULL,
                    [Particao] NVARCHAR(32) NULL,
                    [Descricao] NVARCHAR(512) NULL,
                    [DataEvento] DATETIME2 NULL,
                    [Tipo] NVARCHAR(32) NOT NULL,
                    [Procedimento] NVARCHAR(MAX) NULL,
                    [ClosedBy] NVARCHAR(128) NULL,
                    [ClosedByDisplay] NVARCHAR(256) NULL,
                    [ClosedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                );
                CREATE INDEX IX_Closures_EventId ON [LOGS].[Closures]([EventId]);
                CREATE INDEX IX_Closures_ISEP ON [LOGS].[Closures]([ISEP], [Codigo]);
            END

            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[LOGS].[ClosureEdits]') AND type = N'U')
            BEGIN
                PRINT('Criando LOGS.ClosureEdits');
                CREATE TABLE [LOGS].[ClosureEdits](
                    [Id] BIGINT IDENTITY(1,1) PRIMARY KEY,
                    [ClosureId] BIGINT NOT NULL,
                    [EditedBy] NVARCHAR(128) NULL,
                    [EditedByDisplay] NVARCHAR(256) NULL,
                    [EditedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                    [PreviousText] NVARCHAR(MAX) NULL,
                    [NewText] NVARCHAR(MAX) NULL,
                    CONSTRAINT FK_ClosureEdits_Closures FOREIGN KEY (ClosureId) REFERENCES [LOGS].[Closures]([Id])
                );
            END
        `);
    }

    async saveEventIfNeeded(ev) {
        if (!ev) return null;
        const pool = await this.getPool();
        const insert = `
            INSERT INTO [LOGS].[Events] (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento)
            SELECT @EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, @DataEvento
            WHERE NOT EXISTS (
                SELECT 1 FROM [LOGS].[Events] WHERE EventId = @EventId AND @EventId IS NOT NULL
            );
        `;
        await pool.request()
            .input('EventId', mssql.NVarChar(100), ev.id || null)
            .input('ISEP', mssql.NVarChar(16), ev.local || ev.clientId || '')
            .input('Codigo', mssql.NVarChar(16), ev.codigoEvento || '')
            .input('Complemento', mssql.NVarChar(64), ev.complemento || null)
            .input('Particao', mssql.NVarChar(32), ev.particao ? String(ev.particao) : null)
            .input('Descricao', mssql.NVarChar(512), ev.descricao || null)
            .input('DataEvento', mssql.DateTime2, ev.timestamp ? new Date(ev.timestamp) : null)
            .query(insert);
    }

    async saveClosure(ev, closure) {
        const pool = await this.getPool();
        await pool.request()
            .input('EventId', mssql.NVarChar(100), ev?.id || null)
            .input('ISEP', mssql.NVarChar(16), ev?.local || ev?.clientId || '')
            .input('Codigo', mssql.NVarChar(16), ev?.codigoEvento || '')
            .input('Complemento', mssql.NVarChar(64), ev?.complemento || null)
            .input('Particao', mssql.NVarChar(32), ev?.particao ? String(ev.particao) : null)
            .input('Descricao', mssql.NVarChar(512), ev?.descricao || null)
            .input('DataEvento', mssql.DateTime2, ev?.timestamp ? new Date(ev.timestamp) : null)
            .input('Tipo', mssql.NVarChar(32), closure?.type || 'desconhecido')
            .input('Procedimento', mssql.NVarChar(mssql.MAX), closure?.procedureText || null)
            .input('ClosedBy', mssql.NVarChar(128), closure?.user?.username || null)
            .input('ClosedByDisplay', mssql.NVarChar(256), closure?.user?.displayName || null)
            .query(`
                INSERT INTO [LOGS].[Closures]
                (EventId, ISEP, Codigo, Complemento, Particao, Descricao, DataEvento, Tipo, Procedimento, ClosedBy, ClosedByDisplay)
                VALUES (@EventId, @ISEP, @Codigo, @Complemento, @Particao, @Descricao, @DataEvento, @Tipo, @Procedimento, @ClosedBy, @ClosedByDisplay);
            `);
    }

    async saveEventAndClosure(ev, closure) {
        await this.saveEventIfNeeded(ev);
        await this.saveClosure(ev, closure);
    }
}

module.exports = { LogsRepository };