// ==============================
// configLoader.js – Carrega .env e exporta configs
// ==============================

require('dotenv').config();   // 📋 Carrega .env uma única vez

module.exports = {
    db: {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE
    },
    logsDb: {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE_LOGS
    }
};
