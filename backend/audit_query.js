require("dotenv").config();
const pool = require("./config/database");

const runQuery = async () => {
    try {
        const query = `
            SELECT booking_group_id, doctor_id, appointment_date, session,
                   GROUP_CONCAT(token_number ORDER BY token_number) AS tokens_in_group,
                   COUNT(*) AS token_count
            FROM appointments
            WHERE booking_group_id IS NOT NULL
              AND status <> 'Cancelled'
            GROUP BY booking_group_id, doctor_id, appointment_date, session
            HAVING token_count >= 2
            ORDER BY appointment_date DESC;
        `;
        const [rows] = await pool.execute(query);
        console.log("Query Results:");
        console.table(rows);
    } catch (e) {
        console.error("Error executing query", e);
    } finally {
        process.exit(0);
    }
};

runQuery();
