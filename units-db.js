// units-db.js (atualizado)
import sql from 'mssql';
import { dbConfig } from './db-config.js';

let pool;

async function connect() {
    if (!pool) pool = await sql.connect(dbConfig);
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