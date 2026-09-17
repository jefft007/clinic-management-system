/**
 * DIAGNOSTIC: Test /api/clinic/dashboard endpoint directly
 * Logs in as the clinic staff, then calls /dashboard, and shows exactly what is returned.
 * Run with: node debug_api.js
 * Delete after debugging.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
    });

    console.log('\n==============================');
    console.log('  API DIAGNOSTIC REPORT');
    console.log('==============================\n');

    try {
        // Step 1: Get clinic staff (role_id=2)
        const [staffRows] = await pool.execute(
            `SELECT u.user_id, u.role_id, u.clinic_id, u.full_name, u.email, u.status
             FROM users u WHERE u.role_id = 2 LIMIT 5`
        );
        console.log('--- Clinic Staff Users ---');
        console.table(staffRows);

        if (staffRows.length === 0) {
            console.log('ERROR: No clinic staff found!');
            return;
        }

        const staffUser = staffRows[0];
        console.log(`\nUsing staff: user_id=${staffUser.user_id}, clinic_id=${staffUser.clinic_id}, name=${staffUser.full_name}`);

        // Step 2: Generate a JWT for this staff member (same as authController)
        const jwtPayload = {
            user_id: staffUser.user_id,
            role_id: staffUser.role_id,
            clinic_id: staffUser.clinic_id
        };
        const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
        console.log('\nGenerated JWT payload:', jwtPayload);

        // Step 3: Decode the JWT back to verify clinic_id is present
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded JWT:', decoded);
        console.log('\nclinic_id from JWT:', decoded.clinic_id);

        // Step 4: Simulate getDashboard with this clinic_id
        const clinicId = decoded.clinic_id;
        console.log('\n--- Simulating getDashboard with clinic_id =', clinicId, '---');

        // Count active doctors
        const [[{ totalDoctors }]] = await pool.execute(
            `SELECT COUNT(*) AS totalDoctors
             FROM doctors d
             INNER JOIN users u ON d.user_id = u.user_id
             WHERE d.clinic_id = ?
               AND d.status = 'Active'
               AND u.status = 'Active'`,
            [clinicId]
        );
        console.log(`\ntotalDoctors (active): ${totalDoctors}`);

        // Fetch doctors in clinic
        const [doctorsInClinic] = await pool.execute(
            `SELECT d.doctor_id, u.full_name, d.specialization, u.phone, d.status
             FROM doctors d
             INNER JOIN users u ON d.user_id = u.user_id
             WHERE d.clinic_id = ?
               AND d.status = 'Active'
               AND u.status = 'Active'
             ORDER BY d.doctor_id ASC
             LIMIT 5`,
            [clinicId]
        );

        console.log(`\ndoctors_in_clinic count: ${doctorsInClinic.length}`);
        if (doctorsInClinic.length > 0) {
            console.table(doctorsInClinic);
        } else {
            console.log('*** STILL RETURNING 0 DOCTORS ***');
            
            // Try without u.status filter
            const [try2] = await pool.execute(
                `SELECT d.doctor_id, u.full_name, d.specialization, u.phone, d.status AS d_status, u.status AS u_status
                 FROM doctors d
                 INNER JOIN users u ON d.user_id = u.user_id
                 WHERE d.clinic_id = ?
                   AND d.status = 'Active'`,
                [clinicId]
            );
            console.log(`Without u.status filter: ${try2.length} rows`);
            if (try2.length > 0) console.table(try2);

            // Try without any filter
            const [try3] = await pool.execute(
                `SELECT d.doctor_id, u.full_name, d.specialization, d.status AS d_status, u.status AS u_status
                 FROM doctors d
                 INNER JOIN users u ON d.user_id = u.user_id
                 WHERE d.clinic_id = ?`,
                [clinicId]
            );
            console.log(`Without any filter: ${try3.length} rows`);
            if (try3.length > 0) console.table(try3);
        }

        // Step 5: Also check what the ClinicDoctors page returns (no status filter)
        console.log('\n--- ClinicDoctors page query (no status filter) ---');
        const [clinicDoctors] = await pool.execute(
            `SELECT d.doctor_id, d.clinic_id, d.user_id, u.full_name, u.email, u.phone,
                    d.specialization, d.status, d.created_at
             FROM doctors d
             INNER JOIN users u ON d.user_id = u.user_id
             WHERE d.clinic_id = ?
             ORDER BY d.doctor_id DESC`,
            [clinicId]
        );
        console.log(`Count: ${clinicDoctors.length}`);
        if (clinicDoctors.length > 0) console.table(clinicDoctors);

        // Step 6: Check if maybe clinic_id is NULL in JWT
        if (!clinicId) {
            console.log('\nCRITICAL: clinic_id is NULL/undefined in JWT!');
            console.log('This means the staff user does not have clinic_id set.');
        }

    } catch (err) {
        console.error('ERROR:', err.message, err.stack);
    } finally {
        await pool.end();
    }
}

main();
