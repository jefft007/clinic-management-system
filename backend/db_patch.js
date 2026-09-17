require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    try {
        await pool.execute(
            `UPDATE users SET password = '$2b$10$Pu2fGvbQmEZgA6CioFEbWeYz4O5k3GqmetrUQHm8GocsCQ.bjT1yu', status = 'Active' WHERE user_id = 3`
        );
        console.log('Update Success');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
