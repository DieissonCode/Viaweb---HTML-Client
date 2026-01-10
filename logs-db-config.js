// logsdbconfig.js
const { logsDb } = require('./configLoader');
module.exports = { ...logsDb, options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }, pool: { max: 10, min: 0, idleTimeoutMillis: 30000 } };
