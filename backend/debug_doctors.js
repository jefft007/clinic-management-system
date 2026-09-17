/**
 * DIAGNOSTIC SCRIPT - Debug doctors not showing on dashboard
 * Run with: node debug_doctors.js
 * Delete after debugging is done.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
    });

    console.log('\n==============================');
    console.log('  DATABASE DIAGNOSTIC REPORT');
    console.log('==============================\n');

    try {
        // 1. All clinics
        const [clinics] = await pool.execute(`SELECT clinic_id, clinic_name, status FROM clinics ORDER BY clinic_id`);
        console.log('--- CLINICS ---');
        console.table(clinics);

        // 2. All users with role_id=3 (doctors) or any user with clinic_id set
        const [users] = await pool.execute(
            `SELECT user_id, role_id, clinic_id, full_name, email, phone, designation, status
             FROM users
             WHERE role_id = 3 OR user_id IN (SELECT user_id FROM doctors)
             ORDER BY user_id`
        );
        console.log('--- USERS (role=3 or linked to doctors table) ---');
        console.table(users);

        // 3. All doctors table rows
        const [doctors] = await pool.execute(
            `SELECT doctor_id, user_id, clinic_id, specialization, status FROM doctors ORDER BY doctor_id`
        );
        console.log('--- DOCTORS TABLE ---');
        console.table(doctors);

        // 4. Full join - what the dashboard query would return WITHOUT status filters
        const [joinedAll] = await pool.execute(
            `SELECT d.doctor_id, d.clinic_id AS d_clinic_id, d.user_id, d.specialization, d.status AS d_status,
                    u.full_name, u.clinic_id AS u_clinic_id, u.phone, u.status AS u_status, u.role_id
             FROM doctors d
             INNER JOIN users u ON d.user_id = u.user_id
             ORDER BY d.doctor_id`
        );
        console.log('--- FULL JOIN (doctors + users, no filters) ---');
        console.table(joinedAll);

        // 5. What the current dashboard query returns (with status filters)
        if (clinics.length > 0) {
            for (const clinic of clinics) {
                console.log(`\n--- DASHBOARD QUERY for clinic_id=${clinic.clinic_id} (${clinic.clinic_name}) ---`);
                const [result] = await pool.execute(
                    `SELECT d.doctor_id, u.full_name, d.specialization, u.phone, d.status
                     FROM doctors d
                     INNER JOIN users u ON d.user_id = u.user_id
                     WHERE d.clinic_id = ?
                       AND d.status = 'Active'
                       AND u.status = 'Active'
                     ORDER BY d.doctor_id ASC
                     LIMIT 5`,
                    [clinic.clinic_id]
                );
                console.log(`  Result count: ${result.length}`);
                if (result.length > 0) console.table(result);
                else console.log('  *** NO DOCTORS RETURNED ***');

                // Without u.status filter
                const [result2] = await pool.execute(
                    `SELECT d.doctor_id, u.full_name, d.specialization, u.phone, d.status AS d_status, u.status AS u_status
                     FROM doctors d
                     INNER JOIN users u ON d.user_id = u.user_id
                     WHERE d.clinic_id = ?
                       AND d.status = 'Active'
                     ORDER BY d.doctor_id ASC`,
                    [clinic.clinic_id]
                );
                console.log(`  Without u.status filter: ${result2.length} rows`);
                if (result2.length > 0) console.table(result2);

                // Without any status filter
                const [result3] = await pool.execute(
                    `SELECT d.doctor_id, u.full_name, d.specialization, d.status AS d_status, u.status AS u_status
                     FROM doctors d
                     INNER JOIN users u ON d.user_id = u.user_id
                     WHERE d.clinic_id = ?
                     ORDER BY d.doctor_id ASC`,
                    [clinic.clinic_id]
                );
                console.log(`  Without any status filter: ${result3.length} rows`);
                if (result3.length > 0) console.table(result3);
            }
        }

        // 6. Check clinic_staff users (role_id=2)
        const [staff] = await pool.execute(
            `SELECT user_id, clinic_id, full_name, email, status FROM users WHERE role_id = 2 ORDER BY user_id`
        );
        console.log('\n--- CLINIC STAFF (role_id=2) - these are the logged-in users ---');
        console.table(staff);

    } catch (err) {
        console.error('ERROR:', err.message);
    } finally {
        await pool.end();
    }
}

main();
