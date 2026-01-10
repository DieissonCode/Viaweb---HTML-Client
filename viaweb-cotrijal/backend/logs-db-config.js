// logs-db-config.js - conexão dedicada ao banco Logs
module.exports = {
    user: 'ahk',
    password: '139565Sa',
    server: 'srvvdm-bd\\ASM',
    database: 'Logs',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};