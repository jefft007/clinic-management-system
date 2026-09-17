const pool = require("../config/database");
const bcrypt = require("bcrypt");

// =====================================================
// VALIDATION HELPERS
// =====================================================
const isValidPhone      = (phone)    => /^[6-9]\d{9}$/.test(String(phone).replace(/\s/g, ''));
const isValidPincode    = (pincode)  => /^\d{6}$/.test(String(pincode).replace(/\s/g, ''));
const isValidContactName= (name)     => /^[a-zA-Z\s]{2,}$/.test(name.trim());
const isValidEmail      = (email)    => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const isValidPassword   = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password);

// =====================================================
// DB MIGRATIONS
// (runs once on startup — safe, additive only)
// =====================================================

(async () => {
    const addColumnIfNotExists = async (table, column, definition) => {
        try {
            await pool.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
        } catch (err) {
            try {
                const [rows] = await pool.execute(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                    [table, column]
                );
                if (rows.length === 0) {
                    await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                }
            } catch (innerErr) {
                console.error(`Could not add ${column} column to ${table}:`, innerErr.message);
            }
        }
    };

    // clinics table
    await addColumnIfNotExists('clinics', 'alternate_phone', 'VARCHAR(20) DEFAULT NULL AFTER phone');
    await addColumnIfNotExists('clinics', 'clinic_type',     'VARCHAR(100) DEFAULT NULL');
    await addColumnIfNotExists('clinics', 'pincode',         'VARCHAR(10) DEFAULT NULL');
    await addColumnIfNotExists('clinics', 'contact_name',    'VARCHAR(100) DEFAULT NULL');

    // users table — alternate_phone
    await addColumnIfNotExists('users', 'alternate_phone', 'VARCHAR(20) DEFAULT NULL AFTER phone');

    // doctor_availability table — clinic-initiated emergency block.
    // Distinct from is_leave (which the doctor sets for themselves):
    // this is a whole-session hold a clinic staff member can apply
    // (e.g. doctor called in sick, urgent closure) and lift again —
    // no patient can book any token in the session while it's set.
    await addColumnIfNotExists('doctor_availability', 'is_clinic_blocked', 'TINYINT(1) DEFAULT 0');

    // appointments table — records the moment a patient is marked
    // "Arrived" (status -> Waiting), so the front desk can see actual
    // check-in time, not just the booking time.
    await addColumnIfNotExists('appointments', 'arrived_time', 'DATETIME NULL DEFAULT NULL');

    // appointments table — optional free-text note, mainly used when
    // marking a patient Absent (e.g. "Called, no answer" / "Rescheduling").
    await addColumnIfNotExists('appointments', 'remark', 'VARCHAR(255) NULL DEFAULT NULL');

    // Marks an arrived_time as an estimate rather than a real recorded
    // check-in (see one-time backfill below) — the UI uses this to show
    // "(est.)" instead of presenting a guessed time as fact.
    await addColumnIfNotExists('appointments', 'arrived_estimated', 'TINYINT(1) DEFAULT 0');

    // One-time backfill: appointments processed before arrival-time
    // tracking existed have no arrived_time at all. For any that got
    // past Booked/Reserved (so we know the patient was seen), fall
    // back to booking_time as an approximate stand-in, flagged as an
    // estimate. This only ever touches rows where arrived_time is
    // still NULL, so it's safe to run on every startup.
    await pool.execute(
        `UPDATE appointments
         SET arrived_time = booking_time,
             arrived_estimated = 1
         WHERE arrived_time IS NULL
           AND booking_time IS NOT NULL
           AND status IN ('Waiting', 'In Progress', 'Completed')`
    );

    // clinics table — how many tokens per session are reserved for
    // on-site (walk-in) booking, as an absolute count set by the
    // clinic (e.g. 15 out of a 30-token session). NULL = not yet
    // configured, falls back to an even 50/50 split. The old percent-
    // based column below is superseded by this and no longer read;
    // left in place harmlessly rather than dropped.
    await addColumnIfNotExists('clinics', 'onsite_token_limit', 'INT NULL DEFAULT NULL');
    await addColumnIfNotExists('clinics', 'onsite_token_percent', 'INT DEFAULT 50');

    // clinics table — how far into the future booking is visible/
    // allowed (Manage Slots > Booking Settings > "Visible End Day").
    // NULL means "use the default of 2 months from today".
    await addColumnIfNotExists('clinics', 'booking_end_date', 'DATE NULL DEFAULT NULL');

    // appointments table — on-site and online tokens are now numbered
    // independently, each starting at 1 (see availabilityHelper's
    // getPoolCounts). That means token_number alone is no longer
    // unique within a session — the same number can legitimately
    // exist once per pool — so the uniqueness guard has to include
    // booking_source too. This finds whatever unique index currently
    // enforces (doctor_id, appointment_date, session, token_number)
    // and replaces it with one that also covers booking_source,
    // without assuming a specific index name. Non-fatal on failure
    // (e.g. already migrated, or an environment-specific index name)
    // so it never blocks server startup.
    try {
        const [indexRows] = await pool.query(
            `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'appointments'
               AND NON_UNIQUE = 0
               AND INDEX_NAME <> 'PRIMARY'
             GROUP BY INDEX_NAME`
        );

        const oldSignature = 'doctor_id,appointment_date,session,token_number';
        const newSignature = 'doctor_id,appointment_date,session,token_number,booking_source';
        const alreadyMigrated = indexRows.some(idx => idx.cols === newSignature);

        if (!alreadyMigrated) {
            const oldIndex = indexRows.find(idx => idx.cols === oldSignature);
            if (oldIndex) {
                await pool.query(`ALTER TABLE appointments DROP INDEX \`${oldIndex.INDEX_NAME}\``);
            }
            await pool.query(
                `ALTER TABLE appointments
                 ADD UNIQUE INDEX unique_doctor_token_pool (doctor_id, appointment_date, session, token_number, booking_source)`
            );
        }
    } catch (err) {
        console.error('Token uniqueness index migration warning (non-fatal):', err.message);
    }

    // Per-day per-session token split settings for each clinic.
    // Stores total_tokens, onsite_tokens, online_tokens per (clinic_id, day_of_week, session).
    // day_of_week follows JS convention: 0=Sun, 1=Mon…6=Sat.
    // When a row exists, availabilityHelper uses it instead of the
    // global clinics.onsite_token_limit for that specific day/session.
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS clinic_session_token_settings (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                clinic_id     INT NOT NULL,
                day_of_week   TINYINT NOT NULL COMMENT '0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat',
                session       ENUM('Morning','Evening') NOT NULL,
                total_tokens  INT NOT NULL DEFAULT 30,
                onsite_tokens INT NOT NULL DEFAULT 15,
                online_tokens INT NOT NULL DEFAULT 15,
                updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_clinic_day_sess (clinic_id, day_of_week, session),
                FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (err) {
        console.error('clinic_session_token_settings table migration warning (non-fatal):', err.message);
    }
})();


// =====================================================
// ADD CLINIC
// =====================================================

const addClinic = async (req, res) => {
    try {
        const {
            clinic_name,
            registration_number,
            clinic_type,
            address,
            city,
            state,
            pincode,
            contact_name,
            phone,
            alternate_phone,
            email
        } = req.body;

        // Required fields — alternate_phone is now optional
        if (!clinic_name || !registration_number || !clinic_type || !address || !city || !state || !pincode || !contact_name || !phone) {
            return res.status(400).json({ success: false, message: "Missing mandatory fields" });
        }

        if (!isValidPincode(pincode)) {
            return res.status(400).json({ success: false, message: "Invalid pincode format (exactly 6 digits required)" });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({ success: false, message: "Invalid phone number (10-digit Indian mobile starting with 6-9)" });
        }

        // Alternate phone — optional; validate only if provided
        if (alternate_phone && alternate_phone.trim()) {
            if (!isValidPhone(alternate_phone)) {
                return res.status(400).json({ success: false, message: "Invalid alternate phone number (10-digit Indian mobile starting with 6-9)" });
            }
            if (phone.trim() === alternate_phone.trim()) {
                return res.status(400).json({ success: false, message: "Alternate phone number must be different from primary phone number" });
            }
        }

        if (!isValidContactName(contact_name)) {
            return res.status(400).json({ success: false, message: "Invalid contact name (minimum 2 alphabetic characters)" });
        }

        if (email && !isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Invalid email address format" });
        }

        // Check registration number uniqueness
        const [existingClinic] = await pool.execute(
            `SELECT clinic_id FROM clinics WHERE registration_number = ?`,
            [registration_number]
        );
        if (existingClinic.length > 0) {
            return res.status(409).json({ success: false, message: "Clinic ID already exists" });
        }

        const [result] = await pool.execute(
            `INSERT INTO clinics
            (clinic_name, registration_number, clinic_type, address, city, state, pincode,
             contact_name, phone, alternate_phone, email, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
            [
                clinic_name.trim(), registration_number.trim(), clinic_type.trim(),
                address.trim(), city.trim(), state.trim(), pincode.trim(),
                contact_name.trim(), phone.trim(),
                alternate_phone ? alternate_phone.trim() : null,
                email ? email.trim() : null
            ]
        );

        const [newClinic] = await pool.execute(`SELECT * FROM clinics WHERE clinic_id = ?`, [result.insertId]);

        return res.status(201).json({
            success: true,
            message: "Clinic created successfully",
            clinic: newClinic[0]
        });

    } catch (error) {
        console.error("Add clinic error:", error);
        return res.status(500).json({ success: false, message: "Failed to create clinic" });
    }
};


// =====================================================
// GET ALL CLINICS
// =====================================================

const getClinics = async (req, res) => {
    try {
        const [clinics] = await pool.execute(
            `SELECT
                clinic_id, clinic_name, registration_number, clinic_type, address, city, state, pincode,
                contact_name, phone, alternate_phone, email, latitude, longitude,
                status, created_at
             FROM clinics
             ORDER BY clinic_id DESC`
        );
        return res.status(200).json({ success: true, count: clinics.length, clinics });
    } catch (error) {
        console.error("Get clinics error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch clinics" });
    }
};


// =====================================================
// GET CLINIC BY ID
// =====================================================

const getClinicById = async (req, res) => {
    try {
        const { id } = req.params;
        const [clinics] = await pool.execute(
            `SELECT
                clinic_id, clinic_name, registration_number, clinic_type, address, city, state, pincode,
                contact_name, phone, alternate_phone, email, latitude, longitude,
                status, created_at
             FROM clinics
             WHERE clinic_id = ?`,
            [id]
        );
        if (clinics.length === 0) {
            return res.status(404).json({ success: false, message: "Clinic not found" });
        }
        return res.status(200).json({ success: true, clinic: clinics[0] });
    } catch (error) {
        console.error("Get clinic by ID error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch clinic" });
    }
};


// =====================================================
// UPDATE CLINIC
// =====================================================

const updateClinic = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            clinic_name, registration_number, clinic_type, address, city, state, pincode,
            contact_name, phone, alternate_phone, email, status, latitude, longitude
        } = req.body;

        // Required fields — alternate_phone is now optional
        if (!clinic_name || !registration_number || !clinic_type || !address || !city || !state || !pincode || !contact_name || !phone) {
            return res.status(400).json({ success: false, message: "Missing mandatory fields" });
        }

        if (!isValidPincode(pincode)) {
            return res.status(400).json({ success: false, message: "Invalid pincode format (exactly 6 digits required)" });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({ success: false, message: "Invalid phone number (10-digit Indian mobile starting with 6-9)" });
        }

        // Alternate phone — optional; validate only if provided
        if (alternate_phone && alternate_phone.trim()) {
            if (!isValidPhone(alternate_phone)) {
                return res.status(400).json({ success: false, message: "Invalid alternate phone number (10-digit Indian mobile starting with 6-9)" });
            }
            if (phone.trim() === alternate_phone.trim()) {
                return res.status(400).json({ success: false, message: "Alternate phone must be different from primary phone" });
            }
        }

        if (!isValidContactName(contact_name)) {
            return res.status(400).json({ success: false, message: "Invalid contact name (minimum 2 alphabetic characters)" });
        }

        if (email && !isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Invalid email address format" });
        }

        // Check clinic exists
        const [existingClinic] = await pool.execute(`SELECT clinic_id FROM clinics WHERE clinic_id = ?`, [id]);
        if (existingClinic.length === 0) {
            return res.status(404).json({ success: false, message: "Clinic not found" });
        }

        // Check uniqueness
        const [duplicate] = await pool.execute(
            `SELECT clinic_id FROM clinics WHERE registration_number = ? AND clinic_id != ?`,
            [registration_number, id]
        );
        if (duplicate.length > 0) {
            return res.status(409).json({ success: false, message: "Clinic ID already exists" });
        }

        await pool.execute(
            `UPDATE clinics
             SET clinic_name = ?, registration_number = ?, clinic_type = ?, address = ?, city = ?, state = ?, pincode = ?,
                 contact_name = ?, phone = ?, alternate_phone = ?, email = ?, status = ?,
                 latitude = ?, longitude = ?
             WHERE clinic_id = ?`,
            [
                clinic_name.trim(), registration_number.trim(), clinic_type.trim(),
                address.trim(), city.trim(), state.trim(), pincode.trim(),
                contact_name.trim(), phone.trim(),
                alternate_phone ? alternate_phone.trim() : null,
                email ? email.trim() : null, status || 'Active',
                latitude !== undefined && latitude !== '' ? latitude : null,
                longitude !== undefined && longitude !== '' ? longitude : null,
                id
            ]
        );

        const [updatedClinic] = await pool.execute(
            `SELECT clinic_id, clinic_name, registration_number, clinic_type, address, city, state, pincode,
                    contact_name, phone, alternate_phone, email, latitude, longitude, status, created_at
             FROM clinics WHERE clinic_id = ?`,
            [id]
        );

        return res.status(200).json({
            success: true,
            message: "Clinic updated successfully",
            clinic: updatedClinic[0]
        });

    } catch (error) {
        console.error("Update clinic error:", error);
        return res.status(500).json({ success: false, message: "Failed to update clinic" });
    }
};


// =====================================================
// CHECK CLINIC ID AVAILABILITY (live/inline validation)
// =====================================================
// Lets the Add/Edit Clinic form check uniqueness of the Clinic ID
// (registration_number) as soon as the field is filled in, rather
// than only finding out on submit. exclude_id lets the edit form
// skip flagging the clinic's own current ID as a conflict.

const checkClinicIdAvailable = async (req, res) => {
    try {
        const registration_number = (req.query.registration_number || '').trim();
        const excludeId = req.query.exclude_id;

        if (!registration_number) {
            return res.status(400).json({ success: false, message: "registration_number is required" });
        }

        const params = [registration_number];
        let sql = `SELECT clinic_id FROM clinics WHERE registration_number = ?`;
        if (excludeId) {
            sql += ` AND clinic_id != ?`;
            params.push(excludeId);
        }

        const [existing] = await pool.execute(sql, params);

        return res.status(200).json({
            success: true,
            available: existing.length === 0
        });
    } catch (error) {
        console.error("Check clinic ID error:", error);
        return res.status(500).json({ success: false, message: "Failed to check Clinic ID" });
    }
};


// =====================================================
// DELETE CLINIC  (soft delete — sets status to Inactive)
// =====================================================

const deleteClinic = async (req, res) => {
    try {
        const { id } = req.params;
        const [clinics] = await pool.execute(`SELECT clinic_id, status FROM clinics WHERE clinic_id = ?`, [id]);
        if (clinics.length === 0) return res.status(404).json({ success: false, message: "Clinic not found" });

        await pool.execute(`UPDATE clinics SET status = 'Inactive' WHERE clinic_id = ?`, [id]);
        return res.status(200).json({ success: true, message: "Clinic deactivated successfully" });
    } catch (error) {
        console.error("Delete clinic error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete clinic" });
    }
};


// =====================================================
// ADD CLINIC STAFF (Admin context)
// =====================================================

const addClinicStaff = async (req, res) => {
    try {
        const { clinic_id, full_name, email, phone, alternate_phone, password } = req.body;

        // alternate_phone is now optional
        if (!clinic_id || !full_name || !email || !password || !phone) {
            return res.status(400).json({ success: false, message: "Required fields missing (clinic_id, full_name, email, phone, password)" });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ success: false, message: "Password must be min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character" });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({ success: false, message: "Invalid phone number (10-digit Indian mobile starting with 6-9)" });
        }

        // Alternate phone — optional
        if (alternate_phone && alternate_phone.trim()) {
            if (!isValidPhone(alternate_phone)) {
                return res.status(400).json({ success: false, message: "Invalid alternate phone number" });
            }
            if (phone.trim() === alternate_phone.trim()) {
                return res.status(400).json({ success: false, message: "Alternate phone must be different from primary phone" });
            }
        }

        const [clinics] = await pool.execute(`SELECT clinic_id FROM clinics WHERE clinic_id = ?`, [clinic_id]);
        if (clinics.length === 0) return res.status(404).json({ success: false, message: "Clinic not found" });

        const [existingUser] = await pool.execute(`SELECT user_id FROM users WHERE email = ?`, [email]);
        if (existingUser.length > 0) return res.status(409).json({ success: false, message: "Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            `INSERT INTO users (role_id, clinic_id, full_name, email, phone, alternate_phone, password, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
            [2, clinic_id, full_name, email, phone || null, alternate_phone ? alternate_phone.trim() : null, hashedPassword]
        );

        return res.status(201).json({
            success: true,
            message: "Clinic staff created successfully",
            staff: { user_id: result.insertId, role_id: 2, clinic_id: Number(clinic_id), full_name, email, phone, alternate_phone, status: "Active" }
        });

    } catch (error) {
        console.error("Add clinic staff error:", error);
        return res.status(500).json({ success: false, message: "Failed to create clinic staff" });
    }
};


// =====================================================
// GET ALL USERS
// =====================================================

const getUsers = async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT u.user_id, u.role_id, u.clinic_id, u.full_name, u.email, u.phone, u.alternate_phone,
                    u.status, u.created_at, c.clinic_name
             FROM users u LEFT JOIN clinics c ON u.clinic_id = c.clinic_id
             WHERE u.role_id IN (1, 2, 3) ORDER BY u.user_id DESC`
        );
        return res.status(200).json({ success: true, users });
    } catch (error) {
        console.error("Get users error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
};


// =====================================================
// ADD USER
// ROOT CAUSE FIXES:
// 1. Removed phone uniqueness check — phone is NOT unique at DB level.
//    The old check incorrectly blocked duplicate phone numbers.
// 2. alternate_phone is optional — only validates if provided.
// 3. When role_id=3 (Doctor), inserts into doctors table with specialization.
// =====================================================

const addUser = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { role_id, clinic_id, full_name, email, phone, alternate_phone, password, specialization, status } = req.body;

        // Required fields
        if (!role_id || !full_name || !email || !password) {
            connection.release();
            return res.status(400).json({ success: false, message: "role_id, full_name, email and password are required" });
        }

        // Non-admin must have a clinic
        if (Number(role_id) !== 1 && !clinic_id) {
            connection.release();
            return res.status(400).json({ success: false, message: "clinic_id is required for Staff and Doctors" });
        }

        // Doctor must have specialization
        if (Number(role_id) === 3 && !specialization) {
            connection.release();
            return res.status(400).json({ success: false, message: "specialization is required for Doctors" });
        }

        // Password validation
        if (!isValidPassword(password)) {
            connection.release();
            return res.status(400).json({ success: false, message: "Password must be min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character (e.g. Clinic@123)" });
        }

        // Phone validation — format only, NOT uniqueness
        if (phone && !isValidPhone(phone)) {
            connection.release();
            return res.status(400).json({ success: false, message: "Invalid phone number (10-digit Indian mobile starting with 6-9)" });
        }

        // Alternate phone — optional; validate only if provided
        if (alternate_phone && alternate_phone.trim()) {
            if (!isValidPhone(alternate_phone)) {
                connection.release();
                return res.status(400).json({ success: false, message: "Invalid alternate phone number (10-digit Indian mobile starting with 6-9)" });
            }
            if (phone && phone.trim() === alternate_phone.trim()) {
                connection.release();
                return res.status(400).json({ success: false, message: "Alternate phone must be different from primary phone" });
            }
        }

        // Duplicate email check (email IS unique)
        const [existing] = await connection.execute("SELECT user_id FROM users WHERE email = ?", [email]);
        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ success: false, message: "Email already exists" });
        }

        // NOTE: No phone uniqueness check — phone numbers are allowed to be duplicated.
        // The users table has no UNIQUE constraint on phone, so this is intentional.

        const hashedPassword = await bcrypt.hash(password, 10);
        await connection.beginTransaction();

        const [result] = await connection.execute(
            `INSERT INTO users (role_id, clinic_id, full_name, email, phone, alternate_phone, password, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                Number(role_id),
                clinic_id ? Number(clinic_id) : null,
                full_name.trim(),
                email.trim(),
                phone ? phone.trim() : null,
                alternate_phone ? alternate_phone.trim() : null,
                hashedPassword,
                status || 'Active'
            ]
        );

        const newUserId = result.insertId;

        // If Doctor role: create doctors record with specialization
        if (Number(role_id) === 3) {
            await connection.execute(
                `INSERT INTO doctors (user_id, clinic_id, specialization, status)
                 VALUES (?, ?, ?, 'Active')`,
                [newUserId, clinic_id ? Number(clinic_id) : null, specialization.trim()]
            );
        }

        await connection.commit();
        connection.release();

        return res.status(201).json({ success: true, message: "User created successfully", user_id: newUserId });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error("Add user error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create user",
            detail: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
    }
};


// =====================================================
// UPDATE USER
// =====================================================

const updateUser = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { role_id, clinic_id, full_name, email, phone, alternate_phone, password, status } = req.body;

        if (!full_name || !email) {
            connection.release();
            return res.status(400).json({ success: false, message: "Full name and email are required" });
        }

        if (password && !isValidPassword(password)) {
            connection.release();
            return res.status(400).json({ success: false, message: "Password must be min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character" });
        }

        if (phone && !isValidPhone(phone)) {
            connection.release();
            return res.status(400).json({ success: false, message: "Invalid phone number (10-digit Indian mobile starting with 6-9)" });
        }

        // Alternate phone — optional
        if (alternate_phone && alternate_phone.trim()) {
            if (!isValidPhone(alternate_phone)) {
                connection.release();
                return res.status(400).json({ success: false, message: "Invalid alternate phone number" });
            }
            if (phone && phone.trim() === alternate_phone.trim()) {
                connection.release();
                return res.status(400).json({ success: false, message: "Alternate phone must be different from primary phone" });
            }
        }

        const [existing] = await connection.execute("SELECT user_id FROM users WHERE email = ? AND user_id != ?", [email, id]);
        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ success: false, message: "Email already in use" });
        }

        await connection.beginTransaction();

        let updateQuery = `UPDATE users SET full_name = ?, email = ?, phone = ?, alternate_phone = ?, role_id = ?, clinic_id = ?, status = ?`;
        let queryParams = [
            full_name.trim(), email.trim(),
            phone ? phone.trim() : null,
            alternate_phone ? alternate_phone.trim() : null,
            role_id || null,
            clinic_id ? Number(clinic_id) : null,
            status || 'Active'
        ];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += ", password = ?";
            queryParams.push(hashedPassword);
        }
        updateQuery += " WHERE user_id = ?";
        queryParams.push(id);

        await connection.execute(updateQuery, queryParams);
        await connection.commit();
        connection.release();

        return res.status(200).json({ success: true, message: "User updated successfully" });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error("Update user error:", error);
        return res.status(500).json({ success: false, message: "Failed to update user" });
    }
};


// =====================================================
// UPDATE USER STATUS
// =====================================================

const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: "Status is required" });

        await pool.execute("UPDATE users SET status = ? WHERE user_id = ?", [status, id]);
        return res.status(200).json({ success: true, message: "Status updated successfully" });
    } catch (error) {
        console.error("Update status error:", error);
        return res.status(500).json({ success: false, message: "Failed to update status" });
    }
};


// =====================================================
// GET ALL DOCTORS (Admin view)
// =====================================================

const getAdminDoctors = async (req, res) => {
    try {
        const [doctors] = await pool.execute(
            `SELECT
                d.doctor_id,
                d.user_id,
                d.clinic_id,
                u.full_name,
                u.email,
                u.phone,
                u.alternate_phone,
                d.specialization,
                d.qualification,
                d.consultation_fee,
                d.status,
                d.created_at,
                c.clinic_name,
                c.clinic_type
             FROM doctors d
             INNER JOIN users u ON d.user_id = u.user_id
             LEFT JOIN clinics c ON d.clinic_id = c.clinic_id
             ORDER BY d.doctor_id DESC`
        );
        return res.status(200).json({ success: true, count: doctors.length, doctors });
    } catch (error) {
        console.error("Get admin doctors error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch doctors" });
    }
};

// =====================================================
// UPDATE DOCTOR (Admin — any clinic)
// =====================================================

const updateAdminDoctor = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const doctorId = req.params.id;

        const {
            full_name,
            email,
            phone,
            alternate_phone,
            specialization,
            qualification,
            consultation_fee
        } = req.body;

        if (!full_name || !email || !specialization) {
            return res.status(400).json({
                success: false,
                message: "Full name, email and specialization are required"
            });
        }

        if (phone && !isValidPhone(phone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid phone number"
            });
        }

        if (alternate_phone && alternate_phone.trim() && !isValidPhone(alternate_phone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid alternate phone number"
            });
        }

        const [doctorRows] = await connection.execute(
            `SELECT doctor_id, user_id FROM doctors WHERE doctor_id = ? LIMIT 1`,
            [doctorId]
        );

        if (doctorRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Doctor not found"
            });
        }

        const userId = doctorRows[0].user_id;

        const [duplicateEmail] = await connection.execute(
            `SELECT user_id FROM users WHERE email = ? AND user_id <> ?`,
            [email, userId]
        );

        if (duplicateEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already exists"
            });
        }

        await connection.beginTransaction();

        await connection.execute(
            `UPDATE users
             SET full_name = ?, email = ?, phone = ?, alternate_phone = ?
             WHERE user_id = ?`,
            [
                full_name,
                email,
                phone || null,
                alternate_phone && alternate_phone.trim() ? alternate_phone.trim() : null,
                userId
            ]
        );

        // experience/license_number columns don't exist in this
        // database (removed previously) — don't reference them.

        // consultation_fee is no longer collected on this form —
        // leave it untouched instead of resetting it to 0.
        await connection.execute(
            `UPDATE doctors
             SET specialization = ?,
                 qualification = ?
             WHERE doctor_id = ?`,
            [
                specialization,
                qualification || null,
                doctorId
            ]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: "Doctor updated successfully"
        });
    } catch (error) {
        await connection.rollback();
        console.error("Update admin doctor error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update doctor",
            error: error.message
        });
    } finally {
        connection.release();
    }
};


// =====================================================
// GET REPORT SUMMARY
// Returns: total users, clinic staff (role_id=2), doctors, clinics
// Supports optional date filtering via from_date / to_date (created_at)
// =====================================================

const getReportSummary = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        // Helper: build date WHERE/AND clauses
        const buildUserDateFilter = (prefix = '') => {
            const clauses = [];
            const params  = [];
            if (from_date) { clauses.push(`DATE(${prefix}created_at) >= ?`); params.push(from_date); }
            if (to_date)   { clauses.push(`DATE(${prefix}created_at) <= ?`); params.push(to_date); }
            return { sql: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
        };

        const buildWhereDate = (col) => {
            const clauses = [];
            const params  = [];
            if (from_date) { clauses.push(`DATE(${col}) >= ?`); params.push(from_date); }
            if (to_date)   { clauses.push(`DATE(${col}) <= ?`); params.push(to_date); }
            return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
        };

        const { sql: udw, params: udp } = buildUserDateFilter('');
        const { sql: ddw, params: ddp } = buildWhereDate('d.created_at');
        const { sql: cdw, params: cdp } = buildWhereDate('created_at');

        const [[u]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users WHERE role_id IN (1,2,3)${udw}`, udp);
        const [[s]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users WHERE role_id = 2${udw}`, udp);
        const [[d]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM doctors d${ddw}`, ddp);
        const [[c]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM clinics${cdw}`, cdp);

        return res.status(200).json({
            success: true,
            summary: {
                total_users:  u.cnt,
                clinic_staff: s.cnt,
                doctors:      d.cnt,
                clinics:      c.cnt,
            },
            from_date: from_date || null,
            to_date:   to_date   || null,
        });

    } catch (error) {
        console.error("Get report summary error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch report summary" });
    }
};


// =====================================================
// GET REPORTS
// =====================================================
// RECENT ACTIVITY (Admin Dashboard)
// =====================================================
// Real, most-recently-created records across clinics, doctors and
// clinic staff — replaces the placeholder demo feed on the admin
// dashboard with actual system activity.

const getRecentActivity = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 8, 20);

        const [rows] = await pool.query(
            `
            (
                SELECT 'clinic' AS type, clinic_name AS name, NULL AS clinic_name, created_at
                FROM clinics
            )
            UNION ALL
            (
                SELECT 'doctor' AS type, u.full_name AS name, c.clinic_name AS clinic_name, d.created_at
                FROM doctors d
                INNER JOIN users u ON u.user_id = d.user_id
                LEFT JOIN clinics c ON c.clinic_id = d.clinic_id
            )
            UNION ALL
            (
                SELECT 'staff' AS type, u.full_name AS name, c.clinic_name AS clinic_name, u.created_at
                FROM users u
                LEFT JOIN clinics c ON c.clinic_id = u.clinic_id
                WHERE u.role_id = 2
            )
            ORDER BY created_at DESC
            LIMIT ?
            `,
            [limit]
        );

        const activity = rows.map((row) => {
            let text;
            let icon;
            if (row.type === 'clinic') {
                text = `New clinic registered: ${row.name}`;
                icon = '🏥';
            } else if (row.type === 'doctor') {
                text = `Doctor account created: ${row.name}${row.clinic_name ? ` (${row.clinic_name})` : ''}`;
                icon = '👨‍⚕️';
            } else {
                text = `Staff account created: ${row.name}${row.clinic_name ? ` (${row.clinic_name})` : ''}`;
                icon = '👥';
            }
            return { type: row.type, text, icon, created_at: row.created_at };
        });

        return res.status(200).json({ success: true, activity });
    } catch (error) {
        console.error("Get recent activity error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch recent activity" });
    }
};


// =====================================================
// Supports: type=summary|users|staff|doctors|clinics|overall
// Filters: from_date, to_date (optional — uses created_at)
// clinic_id: optional filter for doctors/staff
// =====================================================

const getReports = async (req, res) => {
    try {
        const { type, from_date, to_date, clinic_id } = req.query;

        const validTypes = ['summary', 'users', 'staff', 'doctors', 'clinics', 'overall'];
        if (!type || !validTypes.includes(type)) {
            return res.status(400).json({ success: false, message: `Report type must be one of: ${validTypes.join(', ')}` });
        }

        // Date validation (only when both provided)
        if (from_date && to_date) {
            const from = new Date(from_date);
            const to   = new Date(to_date);
            if (isNaN(from.getTime()) || isNaN(to.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid date format" });
            }
            if (from > to) {
                return res.status(400).json({ success: false, message: "From date cannot be after To date" });
            }
        }

        // Helper: build a WHERE clause for date filtering on a given column
        const buildDateWhere = (col, existingWhere = false) => {
            const clauses = [];
            const params  = [];
            if (from_date) { clauses.push(`DATE(${col}) >= ?`); params.push(from_date); }
            if (to_date)   { clauses.push(`DATE(${col}) <= ?`); params.push(to_date); }
            if (clauses.length === 0) return { sql: '', params: [] };
            return { sql: (existingWhere ? ' AND ' : ' WHERE ') + clauses.join(' AND '), params };
        };

        // ── Summary ──
        if (type === 'summary') {
            const { sql: dw, params: dp } = buildDateWhere('created_at');

            const [[u]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users WHERE role_id IN (1,2,3)${dw}`, dp);
            const [[s]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users WHERE role_id = 2${dw}`, dp);

            const { sql: ddw, params: ddp } = buildDateWhere('d.created_at');
            const [[d]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM doctors d${ddw}`, ddp);

            const { sql: cdw, params: cdp } = buildDateWhere('created_at');
            const [[c]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM clinics${cdw}`, cdp);

            return res.status(200).json({
                success: true, type,
                from_date: from_date || null,
                to_date:   to_date   || null,
                summary: {
                    total_users:  u.cnt,
                    clinic_staff: s.cnt,
                    doctors:      d.cnt,
                    clinics:      c.cnt,
                }
            });
        }

        // ── Users ──
        if (type === 'users') {
            const { sql: dw, params: dp } = buildDateWhere('u.created_at');
            const [rows] = await pool.execute(
                `SELECT u.user_id, u.full_name, u.email, u.phone, u.alternate_phone,
                        r.role_name, c.clinic_name, u.status, u.created_at
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.role_id
                 LEFT JOIN clinics c ON u.clinic_id = c.clinic_id
                 WHERE u.role_id IN (1,2,3)${dw}
                 ORDER BY u.user_id DESC`,
                dp
            );
            return res.status(200).json({ success: true, type, from_date: from_date || null, to_date: to_date || null, count: rows.length, data: rows });
        }

        // ── Staff ──
        if (type === 'staff') {
            const { sql: dw, params: dp } = buildDateWhere('u.created_at');
            let query = `
                SELECT u.user_id, u.full_name, u.email, u.phone, u.alternate_phone,
                       r.role_name, c.clinic_name, u.status, u.created_at
                FROM users u
                LEFT JOIN clinics c ON u.clinic_id = c.clinic_id
                LEFT JOIN roles r ON u.role_id = r.role_id
                WHERE u.role_id = 2${dw}`;
            const params = [...dp];

            if (clinic_id && clinic_id !== 'all') {
                query += ' AND u.clinic_id = ?';
                params.push(Number(clinic_id));
            }
            query += ' ORDER BY u.created_at DESC';
            const [rows] = await pool.execute(query, params);
            return res.status(200).json({ success: true, type, from_date: from_date || null, to_date: to_date || null, count: rows.length, data: rows });
        }

        // ── Doctors ──
        if (type === 'doctors') {
            const { sql: dw, params: dp } = buildDateWhere('d.created_at');
            let query = `
                SELECT d.doctor_id, u.full_name, c.clinic_name, c.clinic_type,
                       u.phone, u.alternate_phone, u.email, d.specialization, d.status, d.created_at
                FROM doctors d
                INNER JOIN users u ON d.user_id = u.user_id
                LEFT JOIN clinics c ON d.clinic_id = c.clinic_id
                WHERE 1=1${dw}`;
            const params = [...dp];

            if (clinic_id && clinic_id !== 'all') {
                query += ' AND d.clinic_id = ?';
                params.push(Number(clinic_id));
            }
            query += ' ORDER BY d.created_at DESC';
            const [rows] = await pool.execute(query, params);
            return res.status(200).json({ success: true, type, from_date: from_date || null, to_date: to_date || null, count: rows.length, data: rows });
        }

        // ── Clinics ──
        if (type === 'clinics') {
            const { sql: dw, params: dp } = buildDateWhere('created_at');
            const [rows] = await pool.execute(
                `SELECT clinic_id, registration_number AS clinic_id_number, clinic_name, clinic_type,
                        address, city, state, pincode,
                        contact_name, phone, alternate_phone, email,
                        status, created_at
                 FROM clinics${dw}
                 ORDER BY created_at DESC`,
                dp
            );
            return res.status(200).json({ success: true, type, from_date: from_date || null, to_date: to_date || null, count: rows.length, data: rows });
        }

        // ── Overall (summary + all detail sets) ──
        if (type === 'overall') {
            const { sql: dw, params: dp } = buildDateWhere('u.created_at');
            const { sql: ddw, params: ddp } = buildDateWhere('d.created_at');
            const { sql: cdw, params: cdp } = buildDateWhere('created_at');

            // Summary counts
            const [[u]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users u WHERE u.role_id IN (1,2,3)${dw}`, dp);
            const [[s]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users u WHERE u.role_id = 2${dw}`, dp);
            const [[d]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM doctors d${ddw.replace('u.', '')}`, ddp);
            const [[c]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM clinics${cdw}`, cdp);

            // Detail data
            const { sql: dw2, params: dp2 } = buildDateWhere('u.created_at');
            const [users] = await pool.execute(
                `SELECT u.user_id, u.full_name, u.email, u.phone, u.alternate_phone,
                        r.role_name, c2.clinic_name, u.status, u.created_at
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.role_id
                 LEFT JOIN clinics c2 ON u.clinic_id = c2.clinic_id
                 WHERE u.role_id IN (1,2,3)${dw2} ORDER BY u.user_id DESC`, dp2
            );

            const { sql: sdw, params: sdp } = buildDateWhere('u.created_at');
            const [staff] = await pool.execute(
                `SELECT u.user_id, u.full_name, u.email, u.phone, u.alternate_phone,
                        r.role_name, c2.clinic_name, u.status, u.created_at
                 FROM users u
                 LEFT JOIN clinics c2 ON u.clinic_id = c2.clinic_id
                 LEFT JOIN roles r ON u.role_id = r.role_id
                 WHERE u.role_id = 2${sdw} ORDER BY u.created_at DESC`, sdp
            );

            const { sql: ddw2, params: ddp2 } = buildDateWhere('d.created_at');
            const [doctors] = await pool.execute(
                `SELECT d.doctor_id, u.full_name, c2.clinic_name, c2.clinic_type,
                        u.phone, u.alternate_phone, u.email, d.specialization, d.status, d.created_at
                 FROM doctors d
                 INNER JOIN users u ON d.user_id = u.user_id
                 LEFT JOIN clinics c2 ON d.clinic_id = c2.clinic_id
                 WHERE 1=1${ddw2} ORDER BY d.created_at DESC`, ddp2
            );

            const { sql: cdw2, params: cdp2 } = buildDateWhere('created_at');
            const [clinics] = await pool.execute(
                `SELECT clinic_id, registration_number AS clinic_id_number, clinic_name, clinic_type,
                        address, city, state, pincode, contact_name, phone, alternate_phone, email,
                        status, created_at
                 FROM clinics${cdw2} ORDER BY created_at DESC`, cdp2
            );

            return res.status(200).json({
                success: true, type,
                from_date: from_date || null,
                to_date:   to_date   || null,
                summary: {
                    total_users:  u.cnt,
                    clinic_staff: s.cnt,
                    doctors:      d.cnt,
                    clinics:      c.cnt,
                },
                users, staff, doctors, clinics
            });
        }

    } catch (error) {
        console.error("Get reports error:", error);
        return res.status(500).json({ success: false, message: "Failed to generate report" });
    }
};


module.exports = {
    addClinic, getClinics, getClinicById, updateClinic, deleteClinic,
    checkClinicIdAvailable,
    addClinicStaff, getUsers, addUser, updateUser, updateUserStatus,
    getAdminDoctors, updateAdminDoctor, getReports, getReportSummary,
    getRecentActivity
};