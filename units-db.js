// units-db.js
let pool = null;

async function connect() {
    if (!pool) {
        const { dbConfig } = await import('./db-config.js');
        const mssql = window.mssql;
        if (!mssql) throw new Error('mssql não carregado');
        pool = await mssql.connect(dbConfig);
    }
}

export async function getUnits() {
    await connect();
    const result = await pool.request().query(`
        SELECT [NUMERO], [NOME]
        FROM [Programação].[dbo].[INSTALACAO]
        ORDER BY [NOME]
    `);
    return result.recordset;
}