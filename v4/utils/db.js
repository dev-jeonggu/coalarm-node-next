require("dotenv").config();
const { Pool } = require("pg");
const { logger } = require("./logger");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: process.env.DB_MAX_CONNECTION
});

module.exports = {
    query: (...args) => pool.query(...args),
    connect: async () => {
        const client = await pool.connect();
        logger.info("[PostgreSQL] DB 연결 성공");
        client.release();
    },
    close: () => pool.end(),
};
