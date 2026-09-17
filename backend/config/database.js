const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // Without this, mysql2 returns DATE/DATETIME/TIMESTAMP columns
    // as JS Date objects. When those get JSON-serialized for the API
    // response, they're converted to UTC ISO strings — which shifts
    // the date by a day for any timezone ahead of UTC (e.g. IST).
    // That breaks any code comparing available_date/appointment_date
    // as plain "YYYY-MM-DD" strings. dateStrings keeps them as the
    // exact strings stored in MySQL, no timezone conversion.
    dateStrings: true
});

module.exports = pool;