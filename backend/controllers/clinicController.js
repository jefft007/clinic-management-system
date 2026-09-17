const pool = require("../config/database");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { ensureRegularSlotsExist, getTokenMap, calcTotalTokens, getEffectiveTotalTokens, getOnsiteTokenLimit, getPoolCounts, getTokenTiming, minutesPerToken } = require("../utils/availabilityHelper");

// =====================================================
// GET CLINIC DASHBOARD
// =====================================================

const getDashboard = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const [clinics] = await pool.execute(
            `SELECT
                clinic_id,
                clinic_name,
                registration_number,
                address,
                city,
                state,
                phone,
                email,
                status,
                booking_end_date,
                onsite_token_limit
             FROM clinics
             WHERE clinic_id = ?`,
            [clinicId]
        );

        if (clinics.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Clinic not found"
            });
        }

        const [[{ totalDoctors }]] = await pool.execute(
            `SELECT COUNT(*) AS totalDoctors
             FROM doctors d
             INNER JOIN users u ON d.user_id = u.user_id
             WHERE d.clinic_id = ?
               AND d.status = 'Active'
               AND u.status = 'Active'`,
            [clinicId]
        );

        const [[{ totalStaff }]] = await pool.execute(
            `SELECT COUNT(*) AS totalStaff
             FROM users
             WHERE clinic_id = ?
               AND role_id = 2`,
            [clinicId]
        );

        const [[{ totalPatients }]] = await pool.execute(
            `SELECT COUNT(DISTINCT patient_id) AS totalPatients
             FROM appointments
             WHERE clinic_id = ?`,
            [clinicId]
        );

        const {
            fromDate,
            toDate,
            doctorId
        } = req.query;

        let dateCondition = "DATE(appointment_date) = CURDATE()";
        let dateParams = [];

        if (fromDate && toDate) {
            dateCondition = "DATE(appointment_date) BETWEEN ? AND ?";
            dateParams = [fromDate, toDate];
        }

        let doctorCondition = "";
        let doctorParams = [];

        if (doctorId) {
            doctorCondition = "AND doctor_id = ?";
            doctorParams = [doctorId];
        }

        const [[stats]] = await pool.execute(
            `SELECT
                COUNT(*) AS filteredAppointments,

                SUM(
                    CASE
                        WHEN status = 'Booked' THEN 1
                        ELSE 0
                    END
                ) AS bookedTokens,

                SUM(
                    CASE
                        WHEN status = 'Reserved' THEN 1
                        ELSE 0
                    END
                ) AS reservedTokens,

                SUM(
                    CASE
                        WHEN booking_source = 'walk_in' AND status NOT IN ('Reserved', 'Cancelled') THEN 1
                        ELSE 0
                    END
                ) AS walkInTokens,

                SUM(
                    CASE
                        WHEN booking_source = 'online' AND status NOT IN ('Reserved', 'Cancelled') THEN 1
                        ELSE 0
                    END
                ) AS onlineTokens,

                SUM(
                    CASE
                        WHEN status = 'In Progress' THEN 1
                        ELSE 0
                    END
                ) AS inProgressTokens,

                SUM(
                    CASE
                        WHEN status = 'Completed' THEN 1
                        ELSE 0
                    END
                ) AS completedTokens,

                SUM(
                    CASE
                        WHEN status = 'Cancelled' THEN 1
                        ELSE 0
                    END
                ) AS cancelledTokens,

                SUM(
                    CASE
                        WHEN status = 'Waiting' THEN 1
                        ELSE 0
                    END
                ) AS waitingTokens,

                SUM(
                    CASE
                        WHEN status = 'Absent' THEN 1
                        ELSE 0
                    END
                ) AS absentTokens,

                SUM(
                    CASE
                        WHEN status IN (
                            'Booked',
                            'Reserved',
                            'Waiting',
                            'In Progress'
                        )
                        THEN 1
                        ELSE 0
                    END
                ) AS remainingTokens

             FROM appointments
             WHERE clinic_id = ?
               AND ${dateCondition}
               ${doctorCondition}`,
            [
                clinicId,
                ...dateParams,
                ...doctorParams
            ]
        );

        const [[{ upcomingAppointments }]] =
            await pool.execute(
                `SELECT COUNT(*) AS upcomingAppointments
                 FROM appointments
                 WHERE clinic_id = ?
                   AND appointment_date > NOW()`,
                [clinicId]
            );

        const [doctorsInClinic] = await pool.execute(
            `SELECT
                d.doctor_id,
                u.full_name,
                d.specialization,
                u.phone,
                d.status
             FROM doctors d
             INNER JOIN users u
                ON d.user_id = u.user_id
             WHERE d.clinic_id = ?
               AND d.status = 'Active'
               AND u.status = 'Active'
             ORDER BY d.doctor_id ASC
             LIMIT 5`,
            [clinicId]
        );

        const [tokenOverview] = await pool.execute(
            `SELECT
                DATE(a.appointment_date) AS appt_date,
                u.full_name AS doctor_name,
                a.session,

                COUNT(*) AS total_tokens,

                SUM(
                    CASE
                        WHEN a.status = 'Completed'
                        THEN 1
                        ELSE 0
                    END
                ) AS completed,

                SUM(
                    CASE
                        WHEN a.status = 'In Progress'
                        THEN 1
                        ELSE 0
                    END
                ) AS in_progress,

                SUM(
                    CASE
                        WHEN a.status = 'Reserved'
                        THEN 1
                        ELSE 0
                    END
                ) AS reserved,

                SUM(
                    CASE
                        WHEN a.status = 'Booked'
                        THEN 1
                        ELSE 0
                    END
                ) AS not_started,

                SUM(
                    CASE
                        WHEN a.status = 'Cancelled'
                        THEN 1
                        ELSE 0
                    END
                ) AS cancelled,

                SUM(
                    CASE
                        WHEN a.status = 'Waiting'
                        THEN 1
                        ELSE 0
                    END
                ) AS waiting,

                SUM(
                    CASE
                        WHEN a.status = 'Absent'
                        THEN 1
                        ELSE 0
                    END
                ) AS absent,

                SUM(
                    CASE
                        WHEN a.status = 'Skipped'
                        THEN 1
                        ELSE 0
                    END
                ) AS skipped

             FROM appointments a

             INNER JOIN doctors d
                ON a.doctor_id = d.doctor_id

             INNER JOIN users u
                ON d.user_id = u.user_id

             WHERE a.clinic_id = ?
               AND ${dateCondition}
               ${doctorCondition}

             GROUP BY
                DATE(a.appointment_date),
                a.doctor_id,
                a.session

             ORDER BY
                appt_date ASC,
                a.session ASC

             LIMIT 50`,
            [
                clinicId,
                ...dateParams,
                ...doctorParams
            ]
        );

        return res.status(200).json({
            success: true,
            dashboard: {
                clinic: clinics[0],

                statistics: {
                    total_doctors: Number(totalDoctors) || 0,
                    total_staff: Number(totalStaff) || 0,
                    total_patients: Number(totalPatients) || 0,

                    filtered_appointments:
                        Number(stats.filteredAppointments) || 0,

                    booked_tokens:
                        Number(stats.bookedTokens) || 0,

                    reserved_tokens:
                        Number(stats.reservedTokens) || 0,

                    walk_in_tokens:
                        Number(stats.walkInTokens) || 0,

                    online_tokens:
                        Number(stats.onlineTokens) || 0,

                    in_progress_tokens:
                        Number(stats.inProgressTokens) || 0,

                    completed_tokens:
                        Number(stats.completedTokens) || 0,

                    cancelled_tokens:
                        Number(stats.cancelledTokens) || 0,

                    waiting_tokens:
                        Number(stats.waitingTokens) || 0,

                    absent_tokens:
                        Number(stats.absentTokens) || 0,

                    remaining_tokens:
                        Number(stats.remainingTokens) || 0,

                    upcoming_appointments:
                        Number(upcomingAppointments) || 0,

                    total_active_doctors:
                        Number(totalDoctors) || 0
                },

                doctors_in_clinic: doctorsInClinic,
                token_overview: tokenOverview
            }
        });

    } catch (error) {
        console.error("Clinic dashboard error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load clinic dashboard",
            error: error.message
        });
    }
};

// =====================================================
// GET OWN CLINIC PROFILE
// =====================================================

const getClinicProfile = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const [clinics] = await pool.execute(
            `SELECT
                clinic_id,
                clinic_name,
                registration_number,
                address,
                city,
                state,
                phone,
                email,
                latitude,
                longitude,
                opening_time,
                closing_time,
                status,
                created_at
             FROM clinics
             WHERE clinic_id = ?`,
            [clinicId]
        );

        if (clinics.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Clinic not found"
            });
        }

        return res.status(200).json({
            success: true,
            clinic: clinics[0]
        });

    } catch (error) {
        console.error("Clinic profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch clinic profile",
            error: error.message
        });
    }
};

// =====================================================
// CLINIC BOOKING SETTINGS
// =====================================================
// Two independently-configurable settings clinic staff manage from
// Manage Slots > Booking Settings: how far ahead booking is visible
// (booking_end_date) and how many tokens per session are reserved
// for on-site (walk-in) booking, as an absolute count
// (onsite_token_limit) — whatever's left, up to that session's own
// total, becomes the online pool.

const updateClinicSettings = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { booking_end_date, onsite_token_limit } = req.body;

        if (!clinicId) {
            return res.status(403).json({ success: false, message: "Clinic not assigned" });
        }

        const updates = [];
        const params = [];

        if (Object.prototype.hasOwnProperty.call(req.body, 'booking_end_date')) {
            updates.push('booking_end_date = ?');
            params.push(booking_end_date || null);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'onsite_token_limit')) {
            // Allow explicitly clearing it back to "not set" (→ 50/50
            // default) by sending null.
            if (onsite_token_limit === null) {
                updates.push('onsite_token_limit = ?');
                params.push(null);
            } else {
                const limit = Number(onsite_token_limit);
                if (Number.isNaN(limit) || limit < 0 || !Number.isInteger(limit)) {
                    return res.status(400).json({
                        success: false,
                        message: "onsite_token_limit must be a whole number of 0 or more"
                    });
                }

                // Validate against tokens already booked under the
                // CURRENT split, in both pools, across every session
                // — never silently strand an existing booking outside
                // the range it would occupy under the new limit.
                const [onsiteConflicts] = await pool.execute(
                    `SELECT COUNT(*) AS cnt
                     FROM appointments a
                     INNER JOIN doctors d ON d.doctor_id = a.doctor_id
                     WHERE d.clinic_id = ?
                       AND a.booking_source = 'walk_in'
                       AND a.status <> 'Cancelled'
                       AND a.token_number > ?`,
                    [clinicId, limit]
                );

                if (onsiteConflicts[0].cnt > 0) {
                    return res.status(409).json({
                        success: false,
                        message: `Can't set the on-site limit to ${limit} — ${onsiteConflicts[0].cnt} existing on-site booking(s) already use a higher token number. Cancel or reassign them first.`
                    });
                }

                const [onlineRows] = await pool.execute(
                    `SELECT a.appointment_id, a.token_number, da.total_tokens, da.start_time, da.end_time, da.average_consultation_minutes
                     FROM appointments a
                     INNER JOIN doctor_availability da ON da.availability_id = a.availability_id
                     INNER JOIN doctors d ON d.doctor_id = a.doctor_id
                     WHERE d.clinic_id = ?
                       AND a.booking_source = 'online'
                       AND a.status <> 'Cancelled'`,
                    [clinicId]
                );

                const onlineConflictCount = onlineRows.reduce((count, row) => {
                    const sessionTotal = getEffectiveTotalTokens(row);
                    const newOnlineCapacity = Math.max(sessionTotal - limit, 0);
                    return Number(row.token_number) > newOnlineCapacity ? count + 1 : count;
                }, 0);

                if (onlineConflictCount > 0) {
                    return res.status(409).json({
                        success: false,
                        message: `Can't set the on-site limit to ${limit} — it would leave ${onlineConflictCount} existing online booking(s) outside the online pool for their session. Cancel or reassign them first.`
                    });
                }

                updates.push('onsite_token_limit = ?');
                params.push(limit);
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No settings provided" });
        }

        params.push(clinicId);
        await pool.execute(
            `UPDATE clinics SET ${updates.join(', ')} WHERE clinic_id = ?`,
            params
        );

        return res.status(200).json({ success: true, message: "Settings updated successfully" });
    } catch (error) {
        console.error("Update settings error:", error);
        return res.status(500).json({ success: false, message: "Failed to update settings", error: error.message });
    }
};

// =====================================================
// GET SESSION TOKEN SETTINGS (per day+session)
// =====================================================
const getSessionTokenSettings = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        if (!clinicId) return res.status(403).json({ success: false, message: "Clinic not assigned" });

        const [rows] = await pool.execute(
            `SELECT day_of_week, session, total_tokens, onsite_tokens, online_tokens
             FROM clinic_session_token_settings
             WHERE clinic_id = ?
             ORDER BY day_of_week, session`,
            [clinicId]
        );

        return res.status(200).json({ success: true, settings: rows });
    } catch (error) {
        console.error("Get session token settings error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch token settings" });
    }
};

// =====================================================
// SAVE SESSION TOKEN SETTINGS (per day+session)
// =====================================================
// Expects: { settings: [ { day_of_week, session, total_tokens, onsite_tokens, online_tokens }, ... ] }
const updateSessionTokenSettings = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        if (!clinicId) return res.status(403).json({ success: false, message: "Clinic not assigned" });

        const { settings } = req.body;
        if (!Array.isArray(settings) || settings.length === 0) {
            return res.status(400).json({ success: false, message: "settings array is required" });
        }

        for (const s of settings) {
            const { day_of_week, session, total_tokens, onsite_tokens, online_tokens } = s;
            const total   = Math.max(0, Math.floor(Number(total_tokens)   || 0));
            const onsite  = Math.max(0, Math.floor(Number(onsite_tokens)  || 0));
            const online  = Math.max(0, Math.floor(Number(online_tokens)  || 0));

            await pool.execute(
                `INSERT INTO clinic_session_token_settings
                    (clinic_id, day_of_week, session, total_tokens, onsite_tokens, online_tokens)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    total_tokens  = VALUES(total_tokens),
                    onsite_tokens = VALUES(onsite_tokens),
                    online_tokens = VALUES(online_tokens)`,
                [clinicId, day_of_week, session, total, onsite, online]
            );
        }

        return res.status(200).json({ success: true, message: "Token settings saved successfully" });
    } catch (error) {
        console.error("Update session token settings error:", error);
        return res.status(500).json({ success: false, message: "Failed to save token settings", error: error.message });
    }
};

// =====================================================
// GET DOCTOR SESSION TOKEN SETTINGS (per day+session, per doctor)
// =====================================================
// The doctor-scoped equivalent of getSessionTokenSettings above.
// This is the weekly repeating on-site/online split for ONE doctor
// — takes priority over the clinic-wide table whenever a row
// exists (see getOnsiteTokenLimit in utils/availabilityHelper.js).
const getDoctorSessionTokenSettings = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.doctorId;

        if (!clinicId) return res.status(403).json({ success: false, message: "Clinic not assigned" });

        const [doctor] = await pool.execute(
            `SELECT doctor_id FROM doctors WHERE doctor_id = ? AND clinic_id = ? LIMIT 1`,
            [doctorId, clinicId]
        );
        if (doctor.length === 0) {
            return res.status(404).json({ success: false, message: "Doctor not found in your clinic" });
        }

        const [rows] = await pool.execute(
            `SELECT day_of_week, session, total_tokens, onsite_tokens, online_tokens, token_assignments
             FROM doctor_session_token_settings
             WHERE doctor_id = ?
             ORDER BY day_of_week, session`,
            [doctorId]
        );

        const settings = rows.map(r => {
            let assignments = null;
            if (r.token_assignments) {
                try {
                    assignments = typeof r.token_assignments === 'string'
                        ? JSON.parse(r.token_assignments)
                        : r.token_assignments;
                } catch (e) {
                    assignments = null;
                }
            }
            return { ...r, token_assignments: assignments };
        });

        return res.status(200).json({ success: true, settings });
    } catch (error) {
        console.error("Get doctor session token settings error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch doctor token settings", error: error.message });
    }
};

// =====================================================
// SAVE DOCTOR SESSION TOKEN SETTINGS (per day+session, per doctor)
// =====================================================
// Expects: { settings: [ { day_of_week, session, total_tokens, onsite_tokens, online_tokens }, ... ] }
// This is the doctor's weekly repeating on-site/online template —
// saving it here applies from the clinic's next save onward for
// every date generated under this doctor's regular schedule,
// exactly like the clinic-wide version, but scoped to this doctor
// only so different doctors can carry different on-site/online
// splits at the same clinic.
const updateDoctorSessionTokenSettings = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.doctorId;
        const { settings } = req.body;

        if (!clinicId) return res.status(403).json({ success: false, message: "Clinic not assigned" });

        const [doctor] = await pool.execute(
            `SELECT doctor_id FROM doctors WHERE doctor_id = ? AND clinic_id = ? LIMIT 1`,
            [doctorId, clinicId]
        );
        if (doctor.length === 0) {
            return res.status(404).json({ success: false, message: "Doctor not found in your clinic" });
        }

        if (!Array.isArray(settings) || settings.length === 0) {
            return res.status(400).json({ success: false, message: "settings array is required" });
        }

        for (const s of settings) {
            const { day_of_week, session, total_tokens, onsite_tokens, online_tokens, token_assignments } = s;
            const total  = Math.max(0, Math.floor(Number(total_tokens)  || 0));
            const onsite = Math.max(0, Math.floor(Number(onsite_tokens) || 0));
            const online = Math.max(0, Math.floor(Number(online_tokens) || 0));

            // token_assignments (optional): the exact per-position
            // onsite/online picks from the Booking Settings token grid.
            // Must be an array of 'onsite'/'online' whose length equals
            // total, or we drop it back to null (count-based fallback)
            // rather than save something that can't be trusted later.
            let assignmentsJson = null;
            if (Array.isArray(token_assignments) && token_assignments.length === total && total > 0) {
                const clean = token_assignments.map(v => (v === 'online' ? 'online' : 'onsite'));
                assignmentsJson = JSON.stringify(clean);
            }

            await pool.execute(
                `INSERT INTO doctor_session_token_settings
                    (doctor_id, day_of_week, session, total_tokens, onsite_tokens, online_tokens, token_assignments)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    total_tokens  = VALUES(total_tokens),
                    onsite_tokens = VALUES(onsite_tokens),
                    online_tokens = VALUES(online_tokens),
                    token_assignments = VALUES(token_assignments)`,
                [doctorId, day_of_week, session, total, onsite, online, assignmentsJson]
            );
        }

        return res.status(200).json({ success: true, message: "Doctor token settings saved successfully" });
    } catch (error) {
        console.error("Update doctor session token settings error:", error);
        return res.status(500).json({ success: false, message: "Failed to save doctor token settings", error: error.message });
    }
};

// =====================================================
// GET CLINIC DOCTORS
// =====================================================

const getClinicDoctors = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        // Every other screen that calls this endpoint (booking, block
        // slots, availability, dashboard, appointment filters) only ever
        // wants doctors staff can actually act on right now, so the
        // Active-only filter stays the default. Only the doctor
        // management page itself needs to see inactive doctors too (so
        // it has something to show the "Activate" button on) — it opts
        // in explicitly with ?include_inactive=true.
        const includeInactive = req.query.include_inactive === 'true';

        const [doctors] = await pool.execute(
            `
            SELECT
                d.doctor_id,
                d.clinic_id,
                d.user_id,
                u.full_name,
                u.email,
                u.phone,
                u.alternate_phone,
                u.designation,
                d.specialization,
                d.qualification,
                d.consultation_fee,
                d.status

            FROM doctors d

            INNER JOIN users u
                ON d.user_id = u.user_id

            WHERE d.clinic_id = ?
              ${includeInactive ? '' : "AND d.status = 'Active' AND u.status = 'Active'"}

            ORDER BY d.doctor_id ASC
            `,
            [clinicId]
        );

        return res.status(200).json({
            success: true,
            count: doctors.length,
            doctors
        });

    } catch (error) {
        console.error("Get clinic doctors error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch doctors",
            error: error.message
        });
    }
};

// =====================================================
// GET CLINIC STAFF
// =====================================================

const getClinicStaff = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const [staff] = await pool.execute(
            `SELECT
                user_id,
                clinic_id,
                full_name,
                email,
                phone,
                alternate_phone,
                designation,
                status,
                created_at
             FROM users
             WHERE clinic_id = ?
               AND role_id = 2
             ORDER BY user_id DESC`,
            [clinicId]
        );

        return res.status(200).json({
            success: true,
            count: staff.length,
            staff
        });

    } catch (error) {
        console.error("Get clinic staff error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch clinic staff",
            error: error.message
        });
    }
};

// =====================================================
// ADD CLINIC STAFF
// =====================================================

const addClinicStaff = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const {
            full_name,
            email,
            phone,
            password,
            designation
        } = req.body;

        if (!full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Full name, email and password are required"
            });
        }

        const [existingUser] = await pool.execute(
            `SELECT user_id
             FROM users
             WHERE email = ?`,
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already exists"
            });
        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            `INSERT INTO users
            (
                role_id,
                clinic_id,
                full_name,
                email,
                phone,
                password,
                designation,
                status
            )
            VALUES
            (
                2,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'Active'
            )`,
            [
                clinicId,
                full_name,
                email,
                phone || null,
                hashedPassword,
                designation || "Clinic Staff"
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Clinic staff added successfully",
            user_id: result.insertId
        });

    } catch (error) {
        console.error("Add clinic staff error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to add clinic staff",
            error: error.message
        });
    }
};

// =====================================================
// ADD CLINIC DOCTOR
// =====================================================

const addClinicDoctor = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const {
            full_name,
            email,
            phone,
            password,
            specialization,
            qualification
        } = req.body;

        if (
            !full_name ||
            !email ||
            !password ||
            !specialization
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Full name, email, password and specialization are required"
            });
        }

        const [existingEmail] =
            await connection.execute(
                `SELECT user_id
                 FROM users
                 WHERE email = ?`,
                [email]
            );

        if (existingEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already exists"
            });
        }

        await connection.beginTransaction();

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const [userResult] =
            await connection.execute(
                `INSERT INTO users
                (
                    role_id,
                    clinic_id,
                    full_name,
                    email,
                    phone,
                    password,
                    designation,
                    status
                )
                VALUES
                (
                    3,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'Doctor',
                    'Active'
                )`,
                [
                    clinicId,
                    full_name,
                    email,
                    phone || null,
                    hashedPassword
                ]
            );

        const userId = userResult.insertId;

        const [doctorResult] =
            await connection.execute(
                `INSERT INTO doctors
                (
                    user_id,
                    clinic_id,
                    specialization,
                    qualification,
                    status
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    'Active'
                )`,
                [
                    userId,
                    clinicId,
                    specialization,
                    qualification || null
                ]
            );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Doctor added successfully",
            doctor_id: doctorResult.insertId,
            user_id: userId
        });

    } catch (error) {
        await connection.rollback();

        console.error("Add clinic doctor error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to add doctor",
            error: error.message
        });

    } finally {
        connection.release();
    }
};

// =====================================================
// ADD CLINIC PATIENT
// =====================================================

const addClinicPatient = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const {
            full_name,
            phone,
            alternate_phone,
            age,
            gender,
            place,
            address
        } = req.body;

        if (!full_name || !phone || !address) {
            return res.status(400).json({
                success: false,
                message:
                    "Full name, phone and address are required"
            });
        }

        // Duplicate check is by phone AND name together — a phone
        // number alone can be shared by more than one person (e.g.
        // family members), so only block the add when the same
        // person (same phone + same name, case/whitespace-insensitive)
        // is already registered in this clinic.
        const [existingPatient] =
            await pool.execute(
                `SELECT patient_id
                 FROM patients
                 WHERE phone = ?
                   AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
                   AND clinic_id = ?`,
                [
                    phone,
                    full_name,
                    clinicId
                ]
            );

        if (existingPatient.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "A patient with this name and phone number already exists in your clinic"
            });
        }

        const [result] = await pool.execute(
            `INSERT INTO patients
            (
                clinic_id,
                full_name,
                phone,
                alternate_phone,
                age,
                gender,
                place,
                address
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
            )`,
            [
                clinicId,
                full_name,
                phone,
                alternate_phone || null,
                Number(age) || 0,
                gender || "Other",
                place || "",
                address
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Patient added successfully",
            patient_id: result.insertId
        });

    } catch (error) {
        console.error("Add clinic patient error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to add patient",
            error: error.message
        });
    }
};

// =====================================================
// GET CLINIC PATIENTS
// =====================================================

const getClinicPatients = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const [patients] = await pool.execute(
            `SELECT
                p.patient_id,
                p.clinic_id,
                p.full_name,
                p.phone,
                p.alternate_phone,
                p.age,
                p.gender,
                p.place,
                p.address,
                p.created_at,
                COUNT(DISTINCT a.appointment_id) AS total_appointments,
                MAX(CASE WHEN a.status = 'Completed' THEN a.appointment_date END) AS last_visit

             FROM patients p

             LEFT JOIN appointments a
                ON a.patient_id = p.patient_id
                AND a.clinic_id = ?

             WHERE
                p.clinic_id = ?
                OR
                (
                    p.clinic_id IS NULL
                    AND EXISTS (
                        SELECT 1 FROM appointments a2
                        WHERE a2.patient_id = p.patient_id
                          AND a2.clinic_id = ?
                    )
                )

             GROUP BY p.patient_id

             ORDER BY p.patient_id ASC`,
            [
                clinicId,
                clinicId,
                clinicId
            ]
        );

        return res.status(200).json({
            success: true,
            count: patients.length,
            patients
        });

    } catch (error) {
        console.error(
            "Get clinic patients error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch patients",
            error: error.message
        });
    }
};

// =====================================================
// GET CLINIC PATIENT DETAILS
// =====================================================

const getClinicPatientDetails = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const patientId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned to this user"
            });
        }

        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: "Patient ID is required"
            });
        }

        const [patients] = await pool.execute(
            `SELECT DISTINCT
                p.patient_id,
                p.clinic_id,
                p.full_name,
                p.phone,
                p.alternate_phone,
                p.age,
                p.gender,
                p.place,
                p.address,
                p.created_at

             FROM patients p

             LEFT JOIN appointments a
                ON a.patient_id = p.patient_id

             WHERE p.patient_id = ?
               AND (
                    p.clinic_id = ?
                    OR
                    (
                        p.clinic_id IS NULL
                        AND a.clinic_id = ?
                    )
               )

             LIMIT 1`,
            [
                patientId,
                clinicId,
                clinicId
            ]
        );

        if (patients.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Patient not found in your clinic"
            });
        }

        // Full appointment history for this patient within this clinic —
        // most recent first, with the doctor's name/specialization joined in.
        const [appointments] = await pool.execute(
            `SELECT
                a.appointment_id,
                a.appointment_date,
                a.session,
                a.token_number,
                a.status,
                d.doctor_id,
                u.full_name AS doctor_name,
                d.specialization

             FROM appointments a
             JOIN doctors d ON d.doctor_id = a.doctor_id
             JOIN users u ON u.user_id = d.user_id

             WHERE a.patient_id = ?
               AND a.clinic_id = ?

             ORDER BY a.appointment_date DESC, a.token_number DESC`,
            [
                patientId,
                clinicId
            ]
        );

        // Distinct list of doctors this patient has ever had an
        // appointment with at this clinic.
        const doctorsMap = new Map();
        for (const appt of appointments) {
            if (!doctorsMap.has(appt.doctor_id)) {
                doctorsMap.set(appt.doctor_id, {
                    doctor_id: appt.doctor_id,
                    doctor_name: appt.doctor_name,
                    specialization: appt.specialization
                });
            }
        }

        return res.status(200).json({
            success: true,
            patient: patients[0],
            doctorsVisited: Array.from(doctorsMap.values()),
            appointments
        });

    } catch (error) {
        console.error(
            "Get clinic patient details error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to get patient details",
            error: error.message
        });
    }
};

// =====================================================
// UPDATE CLINIC PATIENT
// =====================================================

const updateClinicPatient = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const patientId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned to this user"
            });
        }

        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: "Patient ID is required"
            });
        }

        const {
            full_name,
            phone,
            alternate_phone,
            age,
            gender,
            place,
            address
        } = req.body;

        if (!full_name || !phone || !address) {
            return res.status(400).json({
                success: false,
                message:
                    "Full Name, Phone and Address are required"
            });
        }

        const [existingPatients] =
            await pool.execute(
                `SELECT DISTINCT
                    p.patient_id,
                    p.clinic_id

                 FROM patients p

                 LEFT JOIN appointments a
                    ON a.patient_id = p.patient_id

                 WHERE p.patient_id = ?
                   AND (
                        p.clinic_id = ?
                        OR
                        (
                            p.clinic_id IS NULL
                            AND a.clinic_id = ?
                        )
                   )

                 LIMIT 1`,
                [
                    patientId,
                    clinicId,
                    clinicId
                ]
            );

        if (existingPatients.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Patient not found in your clinic"
            });
        }

        await pool.execute(
            `UPDATE patients
             SET
                clinic_id = ?,
                full_name = ?,
                phone = ?,
                alternate_phone = ?,
                age = ?,
                gender = ?,
                place = ?,
                address = ?

             WHERE patient_id = ?`,
            [
                clinicId,
                full_name,
                phone,
                alternate_phone || null,
                Number(age) || 0,
                gender || "Other",
                place || "",
                address,
                patientId
            ]
        );

        const [updatedPatients] =
            await pool.execute(
                `SELECT
                    patient_id,
                    clinic_id,
                    full_name,
                    phone,
                    alternate_phone,
                    age,
                    gender,
                    place,
                    address,
                    created_at

                 FROM patients
                 WHERE patient_id = ?
                 LIMIT 1`,
                [patientId]
            );

        return res.status(200).json({
            success: true,
            message:
                "Patient details updated successfully",
            patient: updatedPatients[0]
        });

    } catch (error) {
        console.error(
            "Update clinic patient error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to update patient",
            error: error.message
        });
    }
};

// =====================================================
// GET CLINIC DOCTOR AVAILABILITY
// =====================================================

const getClinicDoctorAvailability = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.doctorId;
        const { from_date, to_date } = req.query;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned to this user"
            });
        }

        const [doctorCheck] = await pool.execute(
            `SELECT doctor_id
             FROM doctors
             WHERE doctor_id = ?
               AND clinic_id = ?
             LIMIT 1`,
            [
                doctorId,
                clinicId
            ]
        );

        if (doctorCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        // Generate regular slots for the requested date range
        if (from_date && to_date) {
            await ensureRegularSlotsExist(doctorId, from_date, to_date);
        }

        let query = `SELECT *
             FROM doctor_availability
             WHERE doctor_id = ?`;
        const params = [doctorId];

        if (from_date && to_date) {
            query += ` AND available_date >= ? AND available_date <= ?`;
            params.push(from_date, to_date);
        }

        query += ` ORDER BY available_date ASC, FIELD(session, 'Morning', 'Evening') ASC`;

        const [rows] = await pool.execute(query, params);

        return res.status(200).json({
            success: true,
            availability: rows
        });

    } catch (error) {
        console.error(
            "Get doctor availability error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get doctor availability",
            error: error.message
        });
    }
};

// =====================================================
// GET CLINIC APPOINTMENTS
// =====================================================

const getClinicAppointments = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned to this user"
            });
        }

        const { from_date, to_date, doctor_id, session, status } = req.query;

        let query = `SELECT
                a.appointment_id,
                a.patient_id,
                a.doctor_id,
                a.clinic_id,
                a.availability_id,
                a.appointment_date,
                a.session,
                a.token_number,
                a.status,
                a.booking_time,
                a.arrived_time,
                a.remark,
                a.booking_source,

                da.start_time,
                da.end_time,
                da.average_consultation_minutes,
                da.total_tokens,

                p.full_name AS patient_name,
                p.phone AS patient_phone,
                p.address AS patient_address,

                u.full_name AS doctor_name,

                d.specialization

             FROM appointments a

             INNER JOIN patients p
                ON p.patient_id = a.patient_id

             INNER JOIN doctors d
                ON d.doctor_id = a.doctor_id

             INNER JOIN users u
                ON u.user_id = d.user_id

             LEFT JOIN doctor_availability da
                ON da.availability_id = a.availability_id

             WHERE a.clinic_id = ?`;

        const params = [clinicId];

        if (from_date && to_date) {
            query += ` AND DATE(a.appointment_date) BETWEEN DATE(?) AND DATE(?)`;
            params.push(from_date, to_date);
        } else if (from_date) {
            query += ` AND DATE(a.appointment_date) = DATE(?)`;
            params.push(from_date);
        }
        
        if (doctor_id) {
            query += ` AND a.doctor_id = ?`;
            params.push(doctor_id);
        }
        
        if (session) {
            query += ` AND a.session = ?`;
            params.push(session);
        }
        
        if (status) {
            if (status === 'Reported') {
                query += ` AND a.status IN ('Waiting', 'In Progress', 'Completed')`;
            } else {
                query += ` AND a.status = ?`;
                params.push(status);
            }
        }

        query += ` ORDER BY a.appointment_date DESC, a.appointment_id DESC`;

        const [rows] = await pool.execute(query, params);

        // Attach each appointment's exact clock time for its token —
        // same on-site/online pool math used by the token map, so the
        // time shown here always matches the token grid used to book
        // it (staff should never see "Morning"/"Evening" when a real
        // time is available).
        const onsiteLimitCache = {}; // key: `${dayOfWeek}_${session}`
        for (const row of rows) {
            if (!row.start_time || row.average_consultation_minutes == null) {
                row.estimated_time_label = null;
                continue;
            }
            try {
                const avgMin = Number(row.average_consultation_minutes) || 15;
                const dateStr = row.appointment_date instanceof Date
                    ? row.appointment_date.toISOString().slice(0, 10)
                    : String(row.appointment_date).slice(0, 10);
                const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
                const cacheKey = `${row.doctor_id}_${dayOfWeek}_${row.session}`;

                let limitInfo = onsiteLimitCache[cacheKey];
                if (!limitInfo) {
                    limitInfo = await getOnsiteTokenLimit(clinicId, dayOfWeek, row.session, row.doctor_id);
                    onsiteLimitCache[cacheKey] = limitInfo;
                }

                let rawTotal = getEffectiveTotalTokens({
                    total_tokens: row.total_tokens,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    average_consultation_minutes: avgMin
                });
                if (limitInfo.totalOverride !== null) rawTotal = limitInfo.totalOverride;

                const perToken = minutesPerToken({
                    start_time: row.start_time,
                    end_time: row.end_time,
                    average_consultation_minutes: avgMin
                }, rawTotal);

                let physicalIndex = Number(row.token_number) || 0;
                if (String(row.session || '').toLowerCase() === 'evening') {
                    const morningKey = `${row.doctor_id}_${dayOfWeek}_Morning`;
                    let morningInfo = onsiteLimitCache[morningKey];
                    if (!morningInfo) {
                        morningInfo = await getOnsiteTokenLimit(clinicId, dayOfWeek, 'Morning', row.doctor_id);
                        onsiteLimitCache[morningKey] = morningInfo;
                    }
                    const morningTotal = morningInfo.totalOverride != null ? Number(morningInfo.totalOverride) : 0;
                    if (morningTotal > 0 && physicalIndex > morningTotal) {
                        physicalIndex = physicalIndex - morningTotal;
                    }
                }

                const timing = getTokenTiming(row.start_time, perToken, Math.max(1, physicalIndex));
                row.estimated_time_label = timing.estimated_time_label;
                row.estimated_start_time = timing.estimated_start_time;
            } catch (timingErr) {
                // Never let a timing calc failure break the appointments list.
                row.estimated_time_label = null;
            }
        }

        return res.status(200).json({
            success: true,
            appointments: rows
        });

    } catch (error) {
        console.error(
            "Get clinic appointments error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get clinic appointments",
            error: error.message
        });
    }
};

// =====================================================
// UPDATE CLINIC DOCTOR
// =====================================================

const updateClinicDoctor = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const {
            full_name,
            email,
            phone,
            alternate_phone,
            password,
            designation,
            specialization,
            qualification
        } = req.body;

        const [doctorRows] =
            await connection.execute(
                `SELECT
                    doctor_id,
                    user_id
                 FROM doctors
                 WHERE doctor_id = ?
                   AND clinic_id = ?
                 LIMIT 1`,
                [
                    doctorId,
                    clinicId
                ]
            );

        if (doctorRows.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        const userId = doctorRows[0].user_id;

        const [duplicateEmail] =
            await connection.execute(
                `SELECT user_id
                 FROM users
                 WHERE email = ?
                   AND user_id <> ?`,
                [
                    email,
                    userId
                ]
            );

        if (duplicateEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already exists"
            });
        }

        await connection.beginTransaction();

        // Only rehash/update the password when a new one was actually
        // typed — the clinic-side form leaves it blank to keep the
        // current password, so an empty string must not overwrite it.
        let hashedPassword = null;
        if (password && password.trim()) {
            hashedPassword = await bcrypt.hash(password.trim(), 10);
        }

        await connection.execute(
            `UPDATE users
             SET
                full_name = ?,
                email = ?,
                phone = ?,
                alternate_phone = ?,
                designation = COALESCE(NULLIF(?, ''), designation),
                password = COALESCE(?, password)
             WHERE user_id = ?
               AND clinic_id = ?`,
            [
                full_name,
                email,
                phone || null,
                alternate_phone || null,
                designation || "",
                hashedPassword,
                userId,
                clinicId
            ]
        );

        // experience/license_number/consultation_fee columns aren't
        // collected on this form — don't touch them here.

        await connection.execute(
            `UPDATE doctors
             SET
                specialization = ?,
                qualification = ?
             WHERE doctor_id = ?
               AND clinic_id = ?`,
            [
                specialization,
                qualification || null,
                doctorId,
                clinicId
            ]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: "Doctor updated successfully"
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "Update clinic doctor error:",
            error
        );

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
// UPDATE CLINIC DOCTOR STATUS
// =====================================================

const updateClinicDoctorStatus = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.id;
        const { status } = req.body;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        if (!["Active", "Inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message:
                    "Status must be Active or Inactive"
            });
        }

        const [doctorRows] = await pool.execute(
            `SELECT user_id
             FROM doctors
             WHERE doctor_id = ?
               AND clinic_id = ?
             LIMIT 1`,
            [
                doctorId,
                clinicId
            ]
        );

        if (doctorRows.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        const [result] = await pool.execute(
            `UPDATE doctors
             SET status = ?
             WHERE doctor_id = ?
               AND clinic_id = ?`,
            [
                status,
                doctorId,
                clinicId
            ]
        );

        // Keep the login account's status in sync. This matters most for
        // "Activate": a doctor deactivated via the Delete button (which
        // also locks their login) must be fully restored by this same
        // toggle — otherwise they'd stay invisible everywhere even after
        // being marked Active again.
        await pool.execute(
            `UPDATE users
             SET status = ?
             WHERE user_id = ?
               AND clinic_id = ?
               AND role_id = 3`,
            [
                status,
                doctorRows[0].user_id,
                clinicId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        return res.status(200).json({
            success: true,
            message:
                `Doctor ${status.toLowerCase()} successfully`
        });

    } catch (error) {
        console.error(
            "Update doctor status error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update doctor status",
            error: error.message
        });
    }
};

// =====================================================
// DELETE CLINIC DOCTOR
// =====================================================

const deleteClinicDoctor = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const [doctorRows] =
            await connection.execute(
                `SELECT user_id
                 FROM doctors
                 WHERE doctor_id = ?
                   AND clinic_id = ?
                 LIMIT 1`,
                [
                    doctorId,
                    clinicId
                ]
            );

        if (doctorRows.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        await connection.beginTransaction();

        // This is a SOFT delete on purpose — never a hard DELETE.
        // Doctors can have years of appointment/availability history
        // attached to them (appointments.doctor_id, doctor_availability,
        // doctor_regular_schedule, etc.), and that history must never
        // silently disappear. Deactivating both the doctor profile and
        // its login is enough to fully remove them from every
        // Active-only screen (booking, availability, dashboard, ...)
        // while keeping every past record intact and letting clinic
        // staff bring them back later via "Activate" on the doctors list.
        await connection.execute('DELETE FROM doctor_availability WHERE doctor_id = ?', [doctorId]);
        await connection.execute('DELETE FROM doctor_regular_schedule WHERE doctor_id = ?', [doctorId]);
        await connection.execute('DELETE FROM doctors WHERE doctor_id = ? AND clinic_id = ?', [doctorId, clinicId]);

        await connection.execute('DELETE FROM users WHERE user_id = ? AND clinic_id = ? AND role_id = 3', [doctorRows[0].user_id, clinicId]);

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: "Doctor deleted permanently"
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "Delete clinic doctor error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to deactivate doctor",
            error: error.message
        });

    } finally {
        connection.release();
    }
};

// =====================================================
// UPDATE CLINIC STAFF
// =====================================================

const updateClinicStaff = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const staffId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const {
            full_name,
            email,
            phone,
            designation
        } = req.body;

        const [staff] = await pool.execute(
            `SELECT user_id
             FROM users
             WHERE user_id = ?
               AND clinic_id = ?
               AND role_id = 2
             LIMIT 1`,
            [
                staffId,
                clinicId
            ]
        );

        if (staff.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found in your clinic"
            });
        }

        const [duplicate] = await pool.execute(
            `SELECT user_id
             FROM users
             WHERE email = ?
               AND user_id <> ?`,
            [
                email,
                staffId
            ]
        );

        if (duplicate.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already exists"
            });
        }

        await pool.execute(
            `UPDATE users
             SET
                full_name = ?,
                email = ?,
                phone = ?,
                designation = ?
             WHERE user_id = ?
               AND clinic_id = ?
               AND role_id = 2`,
            [
                full_name,
                email,
                phone || null,
                designation || "Clinic Staff",
                staffId,
                clinicId
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Clinic staff updated successfully"
        });

    } catch (error) {
        console.error(
            "Update clinic staff error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update clinic staff",
            error: error.message
        });
    }
};

// =====================================================
// UPDATE CLINIC STAFF STATUS
// =====================================================

const updateClinicStaffStatus = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const staffId = req.params.id;
        const { status } = req.body;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        if (!["Active", "Inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message:
                    "Status must be Active or Inactive"
            });
        }

        const [result] = await pool.execute(
            `UPDATE users
             SET status = ?
             WHERE user_id = ?
               AND clinic_id = ?
               AND role_id = 2`,
            [
                status,
                staffId,
                clinicId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found in your clinic"
            });
        }

        return res.status(200).json({
            success: true,
            message:
                `Staff ${status.toLowerCase()} successfully`
        });

    } catch (error) {
        console.error(
            "Update staff status error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update staff status",
            error: error.message
        });
    }
};

// =====================================================
// DELETE CLINIC STAFF
// =====================================================

const deleteClinicStaff = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const staffId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const [result] = await pool.execute(
            `DELETE FROM users
             WHERE user_id = ?
               AND clinic_id = ?
               AND role_id = 2`,
            [
                staffId,
                clinicId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found in your clinic"
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Clinic staff deleted successfully"
        });

    } catch (error) {
        console.error(
            "Delete clinic staff error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to delete clinic staff",
            error: error.message
        });
    }
};

// =====================================================
// GET CLINIC REGULAR SCHEDULE
// =====================================================

const getClinicDoctorRegularSchedule = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.doctorId;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const [doctor] = await pool.execute(
            `SELECT doctor_id
             FROM doctors
             WHERE doctor_id = ?
               AND clinic_id = ?
             LIMIT 1`,
            [
                doctorId,
                clinicId
            ]
        );

        if (doctor.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        const [rows] = await pool.execute(
            `SELECT *
             FROM doctor_regular_schedule
             WHERE doctor_id = ?
             ORDER BY day_of_week ASC`,
            [
                doctorId
            ]
        );

        return res.status(200).json({
            success: true,
            schedule: rows
        });

    } catch (error) {
        console.error(
            "Get regular schedule error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get doctor regular schedule",
            error: error.message
        });
    }
};

// =====================================================
// UPDATE CLINIC REGULAR SCHEDULE
// =====================================================

const updateClinicDoctorRegularSchedule = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const clinicId = req.user.clinic_id;
        const doctorId = req.params.doctorId;
        const { schedule } = req.body;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        if (!Array.isArray(schedule)) {
            return res.status(400).json({
                success: false,
                message:
                    "Schedule must be an array"
            });
        }

        const [doctor] =
            await connection.execute(
                `SELECT doctor_id
                 FROM doctors
                 WHERE doctor_id = ?
                   AND clinic_id = ?
                 LIMIT 1`,
                [
                    doctorId,
                    clinicId
                ]
            );

        if (doctor.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        await connection.beginTransaction();

        // Delete all existing schedule rows for this doctor then re-insert
        await connection.execute(
            `DELETE FROM doctor_regular_schedule WHERE doctor_id = ?`,
            [doctorId]
        );

        for (const item of schedule) {
            await connection.execute(
                `INSERT INTO doctor_regular_schedule
                (
                    doctor_id,
                    day_of_week,
                    session,
                    start_time,
                    end_time,
                    average_consultation_minutes
                )
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    doctorId,
                    item.day_of_week,
                    item.session,
                    item.start_time,
                    item.end_time,
                    Number(item.average_consultation_minutes) || 15
                ]
            );
        }

        // The booking/token screens read from doctor_availability
        // (the actual date-specific rows), not from this template —
        // ensureRegularSlotsExist() only fills in a row if none
        // exists yet for that date+session. So without this step,
        // any future slot that was already generated under the OLD
        // schedule (old token count / old times) would keep showing
        // stale numbers on the booking page forever, even though the
        // template above was just updated.
        //
        // Delete only the future slots that are still untouched:
        //   - is_override = 0   → never manually edited/date-overridden
        //   - is_leave = 0      → not marked as a leave day
        //   - session_state = 'Scheduled' or not yet set → session
        //     hasn't started/ended. ensureRegularSlotsExist() never
        //     writes session_state when it auto-generates a row, so
        //     freshly generated slots have session_state = NULL, not
        //     'Scheduled' — both must be treated as "not started yet"
        //     here, or every auto-generated row would silently be
        //     excluded from cleanup and never pick up schedule edits.
        //   - no non-cancelled appointments booked against it
        // Anything the clinic has already acted on (override, leave,
        // a live/completed session, or real bookings) is left exactly
        // as it is. Deleted rows simply regenerate next time the slot
        // is requested, now using the new template.
        await connection.execute(
            `DELETE da FROM doctor_availability da
             WHERE da.doctor_id = ?
               AND da.available_date >= CURDATE()
               AND da.is_override = 0
               AND da.is_leave = 0
               AND (
                    da.session_state = 'Scheduled'
                    OR da.session_state IS NULL
               )
               AND NOT EXISTS (
                    SELECT 1
                    FROM appointments a
                    WHERE a.availability_id = da.availability_id
                      AND a.status <> 'Cancelled'
               )`,
            [doctorId]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message:
                "Doctor regular schedule updated successfully"
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "Update regular schedule error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update regular schedule",
            error: error.message
        });

    } finally {
        connection.release();
    }
};

// =====================================================
// GET GENERAL AVAILABILITY
// =====================================================

const getClinicAvailability = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { doctor_id, from_date, to_date } = req.query;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        // If a single doctor + date range was requested (this is how the
        // clinic's "Book Token" / dashboard filters call this endpoint),
        // make sure that doctor's regular-schedule slots exist for the
        // range before reading them back — mirrors getClinicDoctorAvailability.
        if (doctor_id && from_date && to_date) {
            const [doctorCheck] = await pool.execute(
                `SELECT doctor_id
                 FROM doctors
                 WHERE doctor_id = ?
                   AND clinic_id = ?
                 LIMIT 1`,
                [doctor_id, clinicId]
            );

            if (doctorCheck.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found in your clinic"
                });
            }

            await ensureRegularSlotsExist(doctor_id, from_date, to_date);
        }

        let query = `SELECT
                a.*,
                u.full_name AS doctor_name,
                d.specialization
             FROM doctor_availability a
             INNER JOIN doctors d
                ON a.doctor_id = d.doctor_id
                AND d.clinic_id = ?
             INNER JOIN users u
                ON d.user_id = u.user_id
             WHERE 1 = 1`;
        const params = [clinicId];

        if (doctor_id) {
            query += ` AND a.doctor_id = ?`;
            params.push(doctor_id);
        }

        if (from_date && to_date) {
            query += ` AND a.available_date >= ? AND a.available_date <= ?`;
            params.push(from_date, to_date);
        }

        query += ` ORDER BY
                a.available_date ASC,
                u.full_name ASC,
                a.session ASC`;

        const [rows] = await pool.execute(query, params);

        return res.status(200).json({
            success: true,
            availability: rows
        });

    } catch (error) {
        console.error(
            "Get clinic availability error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get availability",
            error: error.message
        });
    }
};

// =====================================================
// SET AVAILABILITY
// =====================================================

const setAvailability = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const {
            doctor_id,
            available_date,
            sessions  // array: [{ session, start_time, end_time, consultation_duration }]
        } = req.body;

        if (
            !doctor_id ||
            !available_date ||
            !Array.isArray(sessions) ||
            sessions.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Doctor, date and at least one session are required"
            });
        }

        const [doctor] = await pool.execute(
            `SELECT doctor_id
             FROM doctors
             WHERE doctor_id = ?
               AND clinic_id = ?
             LIMIT 1`,
            [
                doctor_id,
                clinicId
            ]
        );

        if (doctor.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        const insertedIds = [];

        // -------------------------------------------------
        // Pass 1: validate every session up front. Doing the
        // total_tokens format + booked-count checks here means
        // a bad session (e.g. Evening) can't leave an earlier
        // one (e.g. Morning) half-saved before the loop bails.
        // -------------------------------------------------
        const prepared = [];
        for (const sess of sessions) {
            const { session, start_time, end_time, consultation_duration, total_tokens, onsite_tokens, online_tokens } = sess;

            if (!session || !start_time || !end_time) continue;

            const avgMin = Number(consultation_duration) || 15;

            // total_tokens is an explicit capacity override, independent
            // of consultation_duration. undefined/null/'' means "no
            // override — keep auto-calculating from duration" (and, on
            // update, clears any previous override back to auto).
            // Anything else must be a positive integer.
            let tokenOverride = null;
            if (total_tokens !== undefined && total_tokens !== null && total_tokens !== "") {
                const n = Number(total_tokens);
                if (!Number.isInteger(n) || n <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `"${session}": total_tokens must be a positive whole number`
                    });
                }
                tokenOverride = n;
            }

            // on-site / online per-date overrides — independent of the
            // doctor's weekly repeating template. undefined/null/'' means
            // "no override for this pool — keep using the weekly split".
            // Either pool can be raised or lowered on its own for just
            // this date (e.g. "add 5 more on-site tokens today").
            let onsiteOverride = null;
            if (onsite_tokens !== undefined && onsite_tokens !== null && onsite_tokens !== "") {
                const n = Number(onsite_tokens);
                if (!Number.isInteger(n) || n < 0) {
                    return res.status(400).json({
                        success: false,
                        message: `"${session}": onsite_tokens must be a whole number of 0 or more`
                    });
                }
                onsiteOverride = n;
            }
            let onlineOverride = null;
            if (online_tokens !== undefined && online_tokens !== null && online_tokens !== "") {
                const n = Number(online_tokens);
                if (!Number.isInteger(n) || n < 0) {
                    return res.status(400).json({
                        success: false,
                        message: `"${session}": online_tokens must be a whole number of 0 or more`
                    });
                }
                onlineOverride = n;
            }

            const [existing] = await pool.execute(
                `SELECT availability_id
                 FROM doctor_availability
                 WHERE doctor_id = ?
                   AND available_date = ?
                   AND session = ?
                 LIMIT 1`,
                [doctor_id, available_date, session]
            );

            const existingId = existing.length > 0 ? existing[0].availability_id : null;

            // Never let a capacity change silently orphan already
            // -booked patients — count what's actually booked/held
            // against this slot and refuse to go below it.
            if (existingId && tokenOverride !== null) {
                const [bookedRows] = await pool.execute(
                    `SELECT COUNT(*) AS booked_count
                     FROM appointments
                     WHERE availability_id = ?
                       AND status <> 'Cancelled'`,
                    [existingId]
                );
                const bookedCount = bookedRows[0].booked_count;

                if (tokenOverride < bookedCount) {
                    return res.status(409).json({
                        success: false,
                        message: `Cannot set total tokens to ${tokenOverride} for "${session}" — ${bookedCount} token(s) are already booked/blocked. Cancel or move those appointments first, or choose a total of at least ${bookedCount}.`
                    });
                }
            }

            // Same guard, per-pool: don't let an on-site/online override
            // drop below what's already booked in that specific pool.
            if (existingId && (onsiteOverride !== null || onlineOverride !== null)) {
                const [poolBooked] = await pool.execute(
                    `SELECT booking_source, COUNT(*) AS booked_count
                     FROM appointments
                     WHERE availability_id = ?
                       AND status <> 'Cancelled'
                     GROUP BY booking_source`,
                    [existingId]
                );
                const bookedBySource = { walk_in: 0, online: 0 };
                poolBooked.forEach(r => { bookedBySource[r.booking_source || 'walk_in'] = r.booked_count; });

                if (onsiteOverride !== null && onsiteOverride < bookedBySource.walk_in) {
                    return res.status(409).json({
                        success: false,
                        message: `Cannot set on-site tokens to ${onsiteOverride} for "${session}" — ${bookedBySource.walk_in} on-site token(s) already booked/blocked.`
                    });
                }
                if (onlineOverride !== null && onlineOverride < bookedBySource.online) {
                    return res.status(409).json({
                        success: false,
                        message: `Cannot set online tokens to ${onlineOverride} for "${session}" — ${bookedBySource.online} online token(s) already booked/blocked.`
                    });
                }
            }

            prepared.push({ session, start_time, end_time, avgMin, tokenOverride, onsiteOverride, onlineOverride, existingId });
        }

        // -------------------------------------------------
        // Pass 2: everything validated — now write.
        // -------------------------------------------------
        for (const p of prepared) {
            let availabilityId = p.existingId;

            if (availabilityId) {
                await pool.execute(
                    `UPDATE doctor_availability
                     SET
                        start_time = ?,
                        end_time = ?,
                        average_consultation_minutes = ?,
                        total_tokens = ?,
                        onsite_tokens_override = ?,
                        online_tokens_override = ?,
                        is_override = 1,
                        is_leave = 0
                     WHERE availability_id = ?`,
                    [p.start_time, p.end_time, p.avgMin, p.tokenOverride, p.onsiteOverride, p.onlineOverride, availabilityId]
                );
            } else {
                const [result] = await pool.execute(
                    `INSERT INTO doctor_availability
                    (
                        doctor_id,
                        available_date,
                        session,
                        start_time,
                        end_time,
                        average_consultation_minutes,
                        total_tokens,
                        onsite_tokens_override,
                        online_tokens_override,
                        is_leave,
                        is_override
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
                    [
                        doctor_id,
                        available_date,
                        p.session,
                        p.start_time,
                        p.end_time,
                        p.avgMin,
                        p.tokenOverride,
                        p.onsiteOverride,
                        p.onlineOverride
                    ]
                );
                availabilityId = result.insertId;
            }

            insertedIds.push(availabilityId);
        }

        return res.status(200).json({
            success: true,
            message: "Availability saved successfully",
            availability_ids: insertedIds
        });

    } catch (error) {
        console.error(
            "Set availability error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to set availability",
            error: error.message
        });
    }
};

// =====================================================
// MARK LEAVE
// =====================================================

const markLeave = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const availabilityId = req.params.id;
        const force = req.body?.force === true;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        // Verify the slot belongs to a doctor in this clinic
        const [check] = await pool.execute(
            `SELECT da.availability_id, da.is_leave
             FROM doctor_availability da
             INNER JOIN doctors d ON da.doctor_id = d.doctor_id
             WHERE da.availability_id = ?
               AND d.clinic_id = ?
             LIMIT 1`,
            [availabilityId, clinicId]
        );

        if (check.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability not found in your clinic"
            });
        }

        // Already on leave — nothing to do. Re-running this shouldn't
        // re-trigger the "appointments already exist" confirmation for
        // a state that's already applied.
        if (check[0].is_leave) {
            return res.status(200).json({
                success: true,
                already_on_leave: true,
                message: "This session is already marked as leave"
            });
        }

        // Existing appointments must never silently disappear when a
        // slot is marked as leave. Warn first and require the clinic
        // to explicitly confirm (force=true) before proceeding — the
        // appointments themselves are still never touched here; the
        // staff still has to cancel/reschedule them separately.
        const [existingAppts] = await pool.execute(
            `SELECT a.appointment_id, a.token_number, a.status, p.full_name AS patient_name
             FROM appointments a
             LEFT JOIN patients p ON p.patient_id = a.patient_id
             WHERE a.availability_id = ?
               AND a.status <> 'Cancelled'
             ORDER BY a.token_number ASC`,
            [availabilityId]
        );

        if (existingAppts.length > 0 && !force) {
            return res.status(409).json({
                success: false,
                message: `${existingAppts.length} appointment(s) already exist for this date/session. Marking it as leave will NOT cancel them automatically — please handle (cancel/reschedule) or confirm you understand and want to proceed anyway.`,
                requires_confirmation: true,
                existing_appointments: existingAppts
            });
        }

        await pool.execute(
            `UPDATE doctor_availability
             SET is_leave = 1
             WHERE availability_id = ?`,
            [availabilityId]
        );

        return res.status(200).json({
            success: true,
            message: "Doctor leave marked successfully"
        });

    } catch (error) {
        console.error(
            "Mark leave error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to mark leave",
            error: error.message
        });
    }
};

// =====================================================
// RESET DOCTOR AVAILABILITY
// =====================================================

const resetClinicDoctorAvailability = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const availabilityId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        // Verify the slot belongs to a doctor in this clinic
        const [check] = await pool.execute(
            `SELECT da.availability_id
             FROM doctor_availability da
             INNER JOIN doctors d ON da.doctor_id = d.doctor_id
             WHERE da.availability_id = ?
               AND d.clinic_id = ?
             LIMIT 1`,
            [availabilityId, clinicId]
        );

        if (check.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability not found in your clinic"
            });
        }

        await pool.execute(
            `UPDATE doctor_availability
             SET is_leave = 0
             WHERE availability_id = ?`,
            [availabilityId]
        );

        return res.status(200).json({
            success: true,
            message: "Doctor availability reset successfully"
        });

    } catch (error) {
        console.error(
            "Reset availability error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to reset availability",
            error: error.message
        });
    }
};

// =====================================================
// BOOK TOKEN
// =====================================================

// =====================================================
// GET AVAILABILITY TOKEN MAP
// =====================================================
// GET /api/clinic/availability/:availabilityId/tokens
//
// Returns every token in the session (theatre/bus-ticket
// style seat map): which are already gone (booked/reserved/
// waiting/etc — "reserved" is shown to clinic staff as
// "Blocked" in the UI, no schema change), which are still
// available, and — for the selected token — the estimated
// consultation window and suggested arrival time. Used to
// power the token picker in the "Book Token" / "Block Token"
// UI instead of a plain number input.
// =====================================================

const getAvailabilityTokenMap = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const { availabilityId } = req.params;
        const bookingSourceFilter = ['walk_in', 'online'].includes(req.query.booking_source) ? req.query.booking_source : null;

        const tokenMap = await getTokenMap(availabilityId, clinicId, bookingSourceFilter);

        if (!tokenMap) {
            return res.status(404).json({
                success: false,
                message: "Availability not found"
            });
        }

        // Make sure this availability's doctor belongs to the
        // logged-in clinic staff's clinic (clinic isolation).
        const [doctorRows] = await pool.execute(
            `SELECT clinic_id
             FROM doctors
             WHERE doctor_id = ?
             LIMIT 1`,
            [tokenMap.availability.doctor_id]
        );

        if (
            doctorRows.length === 0 ||
            Number(doctorRows[0].clinic_id) !== Number(clinicId)
        ) {
            return res.status(403).json({
                success: false,
                message: "This doctor does not belong to your clinic"
            });
        }

        return res.status(200).json({
            success: true,
            ...tokenMap
        });

    } catch (error) {
        console.error(
            "Get availability token map error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to get token map",
            error: error.message
        });
    }
};

// =====================================================
// ADD EXTRA TOKENS (append-only, for one date/session)
// =====================================================
// POST /api/clinic/availability/:availabilityId/add-tokens
// Body: { pool: 'all' | 'walk_in' | 'online', count: number }
//
// Adds MORE capacity to this specific date/session, always appended
// after every token that already exists there (see migration_v7 /
// getTokenMap in availabilityHelper.js) — no existing token, booked
// or not, on-site or online, ever changes number.
//
// pool === 'all'   → count is split as evenly as possible between
//                     on-site and online (on-site gets the extra one
//                     on an odd count, e.g. 5 → 3 on-site + 2 online).
// pool === 'walk_in' or 'online' → the full count goes to that pool.
const addExtraTokens = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const { availabilityId } = req.params;
        const { pool: poolChoice, count } = req.body;

        const n = Number(count);
        if (!Number.isInteger(n) || n <= 0) {
            return res.status(400).json({
                success: false,
                message: "count must be a positive whole number"
            });
        }
        if (!['all', 'walk_in', 'online'].includes(poolChoice)) {
            return res.status(400).json({
                success: false,
                message: "pool must be 'all', 'walk_in', or 'online'"
            });
        }

        const [rows] = await pool.execute(
            `SELECT da.availability_id, da.doctor_id, da.is_leave, da.is_clinic_blocked,
                    da.extra_onsite_tokens, da.extra_online_tokens, da.extra_token_log, d.clinic_id
             FROM doctor_availability da
             JOIN doctors d ON d.doctor_id = da.doctor_id
             WHERE da.availability_id = ?
             LIMIT 1`,
            [availabilityId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability not found"
            });
        }

        const row = rows[0];
        if (Number(row.clinic_id) !== Number(clinicId)) {
            return res.status(403).json({
                success: false,
                message: "This doctor does not belong to your clinic"
            });
        }
        if (row.is_leave || row.is_clinic_blocked) {
            return res.status(409).json({
                success: false,
                message: "Cannot add tokens to a session that is on leave / blocked"
            });
        }

        let onsiteAdd = 0;
        let onlineAdd = 0;
        if (poolChoice === 'walk_in') {
            onsiteAdd = n;
        } else if (poolChoice === 'online') {
            onlineAdd = n;
        } else {
            onsiteAdd = Math.ceil(n / 2);
            onlineAdd = n - onsiteAdd;
        }

        // Ordered log of every "add extra tokens" action for this
        // date/session (see migration_v8). getTokenMap replays this
        // list IN ORDER to hand out day-numbers, so a batch always
        // keeps the numbers it was given no matter what gets added
        // to either pool afterward. Without this, always numbering
        // "every on-site extra, then every online extra" (regardless
        // of which was actually added first) would silently renumber
        // an already-added online extra the next time an on-site
        // extra came in — see migration_v8 for the concrete example.
        let existingLog = [];
        if (row.extra_token_log) {
            try {
                existingLog = typeof row.extra_token_log === 'string'
                    ? JSON.parse(row.extra_token_log)
                    : row.extra_token_log;
                if (!Array.isArray(existingLog)) existingLog = [];
            } catch (e) {
                existingLog = [];
            }
        }
        if (existingLog.length === 0) {
            // First add ever logged for this row: if extra tokens were
            // already added before this migration shipped, preserve
            // their existing (already-shown-to-staff) numbering by
            // recording them as one legacy on-site-then-online batch,
            // rather than silently reshuffling live token numbers.
            const legacyOnsite = Number(row.extra_onsite_tokens) || 0;
            const legacyOnline = Number(row.extra_online_tokens) || 0;
            if (legacyOnsite > 0) existingLog.push({ pool: 'walk_in', count: legacyOnsite });
            if (legacyOnline > 0) existingLog.push({ pool: 'online', count: legacyOnline });
        }
        if (onsiteAdd > 0) existingLog.push({ pool: 'walk_in', count: onsiteAdd });
        if (onlineAdd > 0) existingLog.push({ pool: 'online', count: onlineAdd });

        await pool.execute(
            `UPDATE doctor_availability
             SET extra_onsite_tokens = extra_onsite_tokens + ?,
                 extra_online_tokens = extra_online_tokens + ?,
                 extra_token_log = ?
             WHERE availability_id = ?`,
            [onsiteAdd, onlineAdd, JSON.stringify(existingLog), availabilityId]
        );

        const tokenMap = await getTokenMap(availabilityId, clinicId, null);

        return res.status(200).json({
            success: true,
            message: `Added ${n} token(s)`,
            added: { walk_in: onsiteAdd, online: onlineAdd },
            ...tokenMap
        });

    } catch (error) {
        console.error(
            "Add extra tokens error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to add tokens",
            error: error.message
        });
    }
};


const bookToken = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const {
            patient_id,
            doctor_id,
            availability_id,
            appointment_date,
            session,
            token_number,
            patient_name,
            patient_phone,
            patient_alt_phone,
            patient_address,
            patient_age,
            patient_gender,
            status,
            booking_source
        } = req.body;

        // Either an existing patient_id can be supplied, or the
        // patient's details can be supplied directly — the latter
        // is how the clinic "Book Token" / "Block Token" screen
        // works, entering patient details as part of the same
        // form instead of requiring the patient to already exist.
        //
        // Exception: a pure slot freeze (Freeze Slots page) sends
        // status: 'Reserved' with no patient info at all — it's just
        // a hold on the token, not a booking, so patient details
        // aren't required in that case.
        const isPatientlessFreeze = status === "Reserved" && !patient_id && !patient_name && !patient_phone;

        if (
            (!isPatientlessFreeze && !patient_id && (!patient_name || !patient_phone)) ||
            !doctor_id ||
            !appointment_date ||
            !session ||
            !token_number
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Patient name, phone (or patient_id), doctor, date, session and token are required"
            });
        }

        const phonePattern = /^[6-9]\d{9}$/;

        if (patient_phone && !phonePattern.test(patient_phone)) {
            return res.status(400).json({
                success: false,
                message:
                    "Please enter a valid 10-digit phone number starting with 6-9"
            });
        }

        if (patient_alt_phone && !phonePattern.test(patient_alt_phone)) {
            return res.status(400).json({
                success: false,
                message:
                    "Please enter a valid 10-digit alternate phone number starting with 6-9"
            });
        }

        // Clinic staff can either "Book" a token normally, or
        // "Block" it — temporarily holding it without it being a
        // confirmed booking. The UI calls this "Blocked", but it is
        // stored in the database as 'Reserved' (no schema change
        // needed). Any other status value is rejected; status
        // changes after creation go through updateTokenStatus.
        const initialStatus =
            status === "Reserved" ? "Reserved" : "Booked";

        // Anything booked through this endpoint was entered by clinic
        // staff — either at the counter (walk-in) or through the
        // "Online Booking" widget (e.g. an emergency walk-in placed
        // into leftover online tokens once on-site runs out). The
        // frontend tells us which via booking_source; default to
        // walk_in when it's not provided. A blocked (Reserved) slot
        // still occupies a specific token within a specific pool
        // (on-site tokens and online tokens are numbered
        // independently, so which pool matters even for a hold with
        // no patient attached) — it uses the same booking_source value.
        const bookingSource =
            booking_source === "online" ? "online" : "walk_in";

        let resolvedPatientId = patient_id || null;

        await connection.beginTransaction();

        if (resolvedPatientId) {
            const [patient] =
                await connection.execute(
                    `SELECT patient_id
                     FROM patients
                     WHERE patient_id = ?
                       AND (
                            clinic_id = ?
                            OR clinic_id IS NULL
                       )
                     LIMIT 1`,
                    [
                        resolvedPatientId,
                        clinicId
                    ]
                );

            if (patient.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }
        } else if (isPatientlessFreeze) {
            // Pure freeze — no patient to attach, resolvedPatientId
            // stays null and the appointment row is created purely
            // as a hold on the token.
        } else {
            // Find-or-create by phone AND name within this clinic.
            // Matching phone alone was merging different people who
            // share a phone (common with family members) into a
            // single patient record — and silently overwriting
            // whoever was there before with the new name. Requiring
            // both to match (case/whitespace-insensitive) means a
            // genuine repeat visit is still recognized, while a
            // different person on the same phone number correctly
            // becomes a new patient record instead.
            const [existingPatient] =
                await connection.execute(
                    `SELECT patient_id
                     FROM patients
                     WHERE phone = ?
                       AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
                       AND clinic_id = ?
                     LIMIT 1`,
                    [
                        patient_phone.trim(),
                        patient_name.trim(),
                        clinicId
                    ]
                );

            if (existingPatient.length > 0) {
                resolvedPatientId = existingPatient[0].patient_id;

                await connection.execute(
                    `UPDATE patients
                     SET full_name = ?,
                         alternate_phone = COALESCE(?, alternate_phone),
                         address = COALESCE(NULLIF(?, ''), address),
                         age = COALESCE(?, age),
                         gender = COALESCE(?, gender)
                     WHERE patient_id = ?`,
                    [
                        patient_name.trim(),
                        patient_alt_phone || null,
                        patient_address || "",
                        patient_age || null,
                        patient_gender || null,
                        resolvedPatientId
                    ]
                );
            } else {
                const [newPatient] =
                    await connection.execute(
                        `INSERT INTO patients
                        (
                            clinic_id,
                            full_name,
                            phone,
                            alternate_phone,
                            age,
                            gender,
                            address
                        )
                        VALUES
                        (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            clinicId,
                            patient_name.trim(),
                            patient_phone.trim(),
                            patient_alt_phone || null,
                            patient_age || null,
                            patient_gender || "Other",
                            patient_address || ""
                        ]
                    );

                resolvedPatientId = newPatient.insertId;
            }
        }

        const [doctor] =
            await connection.execute(
                `SELECT doctor_id
                 FROM doctors
                 WHERE doctor_id = ?
                   AND clinic_id = ?
                 LIMIT 1`,
                [
                    doctor_id,
                    clinicId
                ]
            );

        if (doctor.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Doctor not found in your clinic"
            });
        }

        // Always re-check the token against the LIVE effective
        // capacity (manual override if set, otherwise calculated)
        // right before booking — never trust a total_tokens number
        // the client may have fetched a while ago. This is what
        // makes "staff changes total tokens mid-session" actually
        // take effect on the very next booking, not just in the UI.
        if (availability_id) {
            const [availRows] = await connection.execute(
                `SELECT start_time, end_time, average_consultation_minutes, total_tokens, is_leave, is_clinic_blocked
                 FROM doctor_availability
                 WHERE availability_id = ?
                   AND doctor_id = ?
                 LIMIT 1`,
                [availability_id, doctor_id]
            );

            if (availRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Availability slot not found"
                });
            }

            const slot = availRows[0];

            if (slot.is_leave) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: "The doctor is on leave for this date/session — cannot book"
                });
            }

            if (slot.is_clinic_blocked) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: "This session has been blocked by the clinic and is not available for booking"
                });
            }

            // A session that has already ended can't be booked into —
            // even if it's still today's date, once the end time has
            // passed there's no one left to see. This applies to
            // clinic staff exactly the same as patients; nobody gets
            // to book an expired session.
            const now = new Date();
            const [ay, am, ad] = String(appointment_date).split('-').map(Number);
            const [eh, em] = String(slot.end_time).split(':').map(Number);
            const sessionEndsAt = new Date(ay, (am || 1) - 1, ad || 1, eh || 0, em || 0, 0);

            if (sessionEndsAt.getTime() <= now.getTime()) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `This session ended at ${slot.end_time?.slice(0, 5)} — it can no longer be booked. Pick an upcoming session instead.`
                });
            }

            // Validate against the live token map so the number staff
            // picked in Booking Settings (e.g. On-Site #12, Evening #45)
            // is the same number accepted here — not a remapped 1…N pool index.
            const liveMap = await getTokenMap(availability_id, clinicId, bookingSource);
            const picked = liveMap && (liveMap.tokens || []).find(
                (t) => Number(t.token_number) === Number(token_number)
            );
            const poolLabel = bookingSource === 'online' ? 'online' : 'on-site';

            if (!picked) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `Token ${token_number} is not a ${poolLabel} token for this session. Please refresh and pick again.`
                });
            }
        }

        const [existingToken] =
            await connection.execute(
                `SELECT appointment_id
                 FROM appointments
                 WHERE doctor_id = ?
                   AND appointment_date = ?
                   AND session = ?
                   AND token_number = ?
                   AND booking_source = ?
                   AND status <> 'Cancelled'
                 LIMIT 1
                 FOR UPDATE`,
                [
                    doctor_id,
                    appointment_date,
                    session,
                    token_number,
                    bookingSource
                ]
            );

        if (existingToken.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "This token is already booked"
            });
        }

        const [result] =
            await connection.execute(
                `INSERT INTO appointments
                (
                    patient_id,
                    doctor_id,
                    clinic_id,
                    availability_id,
                    appointment_date,
                    session,
                    token_number,
                    status,
                    booking_source
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )`,
                [
                    resolvedPatientId,
                    doctor_id,
                    clinicId,
                    availability_id || null,
                    appointment_date,
                    session,
                    token_number,
                    initialStatus,
                    bookingSource
                ]
            );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message:
                initialStatus === "Reserved"
                    ? "Token blocked successfully"
                    : "Token booked successfully",
            appointment_id: result.insertId,
            token_number,
            status: initialStatus
        });

    } catch (error) {
        await connection.rollback();

        console.error(
            "Book token error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to book token",
            error: error.message
        });

    } finally {
        connection.release();
    }
};

// Shared by bookMultipleTokens (below) — resolves an existing
// patient_id, or finds-or-creates a patient by phone AND name within
// the clinic, exactly like the inline logic bookToken uses for a
// normal single-token booking.
const resolvePatientForBooking = async (connection, clinicId, fields) => {
    const {
        patient_id,
        patient_name,
        patient_phone,
        patient_alt_phone,
        patient_address,
        patient_age,
        patient_gender
    } = fields;

    if (patient_id) {
        const [patient] = await connection.execute(
            `SELECT patient_id
             FROM patients
             WHERE patient_id = ?
               AND (clinic_id = ? OR clinic_id IS NULL)
             LIMIT 1`,
            [patient_id, clinicId]
        );

        if (patient.length === 0) {
            const err = new Error("Patient not found");
            err.statusCode = 404;
            throw err;
        }

        return patient_id;
    }

    // Match on phone AND name (case/whitespace-insensitive) — phone
    // alone can be shared by multiple people (e.g. family members),
    // so requiring both avoids merging distinct patients into one
    // record while still recognizing a genuine repeat visit.
    const [existingPatient] = await connection.execute(
        `SELECT patient_id
         FROM patients
         WHERE phone = ?
           AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
           AND clinic_id = ?
         LIMIT 1`,
        [patient_phone.trim(), patient_name.trim(), clinicId]
    );

    if (existingPatient.length > 0) {
        const resolvedId = existingPatient[0].patient_id;

        await connection.execute(
            `UPDATE patients
             SET full_name = ?,
                 alternate_phone = COALESCE(?, alternate_phone),
                 address = COALESCE(NULLIF(?, ''), address),
                 age = COALESCE(?, age),
                 gender = COALESCE(?, gender)
             WHERE patient_id = ?`,
            [
                patient_name.trim(),
                patient_alt_phone || null,
                patient_address || "",
                patient_age || null,
                patient_gender || null,
                resolvedId
            ]
        );

        return resolvedId;
    }

    const [newPatient] = await connection.execute(
        `INSERT INTO patients
        (clinic_id, full_name, phone, alternate_phone, age, gender, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            clinicId,
            patient_name.trim(),
            patient_phone.trim(),
            patient_alt_phone || null,
            patient_age || null,
            patient_gender || "Other",
            patient_address || ""
        ]
    );

    return newPatient.insertId;
};

// =====================================================
// BOOK MULTIPLE TOKENS FOR ONE PATIENT ("procedure" booking)
// =====================================================
// POST /api/clinic/appointments/book-multiple
//
// Books several tokens — possibly across different sessions/dates —
// for the SAME patient in one transaction (e.g. a procedure that
// needs more than one consultation slot). Every appointment row
// created here shares a single booking_group_id (a UUID) so the
// token grid can highlight them together in their own color and
// tell staff at a glance which tiles belong to the same patient/
// procedure, separate from ordinary single-token bookings.
//
// Body:
//   { patient_id? , patient_name, patient_phone, patient_alt_phone?,
//     patient_address?, patient_age?, patient_gender?, procedure_note?,
//     tokens: [
//       { doctor_id, availability_id, appointment_date, session,
//         token_number, booking_source? }, ...
//     ] }
//
// All-or-nothing: if any token in the list is no longer available
// (or its session has ended/is blocked), the whole booking is rolled
// back and nothing is created.
// =====================================================

const bookMultipleTokens = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        console.log('[bookMultipleTokens DEBUG] req.body.tokens payload received:', req.body.tokens);
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const {
            patient_id,
            patient_name,
            patient_phone,
            patient_alt_phone,
            patient_address,
            patient_age,
            patient_gender,
            procedure_note,
            tokens
        } = req.body;

        if (!patient_id && (!patient_name || !patient_phone)) {
            return res.status(400).json({
                success: false,
                message: "Patient name and phone (or patient_id) are required"
            });
        }

        const phonePattern = /^[6-9]\d{9}$/;

        if (patient_phone && !phonePattern.test(patient_phone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit phone number starting with 6-9"
            });
        }

        if (patient_alt_phone && !phonePattern.test(patient_alt_phone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit alternate phone number starting with 6-9"
            });
        }

        if (!Array.isArray(tokens) || tokens.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Select at least two tokens for a multi-token (procedure) booking"
            });
        }

        if (tokens.length > 20) {
            return res.status(400).json({
                success: false,
                message: "Cannot book more than 20 tokens in a single procedure booking"
            });
        }

        for (const t of tokens) {
            if (!t || !t.doctor_id || !t.availability_id || !t.appointment_date || !t.session || !t.token_number) {
                return res.status(400).json({
                    success: false,
                    message: "Each token requires doctor_id, availability_id, appointment_date, session and token_number"
                });
            }
        }

        await connection.beginTransaction();

        let resolvedPatientId;
        try {
            resolvedPatientId = await resolvePatientForBooking(connection, clinicId, {
                patient_id, patient_name, patient_phone, patient_alt_phone,
                patient_address, patient_age, patient_gender
            });
        } catch (patientErr) {
            await connection.rollback();
            return res.status(patientErr.statusCode || 500).json({
                success: false,
                message: patientErr.message || "Failed to resolve patient"
            });
        }

        // One shared id ties every token in this booking together.
        const bookingGroupId = crypto.randomUUID();
        const bookedTokens = [];

        for (const t of tokens) {
            const doctorIdVal = t.doctor_id;
            const availabilityId = t.availability_id;
            const appointmentDate = t.appointment_date;
            const session = t.session;
            const tokenNumber = t.token_number;
            const bookingSource = t.booking_source === "online" ? "online" : "walk_in";

            const [doctor] = await connection.execute(
                `SELECT doctor_id FROM doctors WHERE doctor_id = ? AND clinic_id = ? LIMIT 1`,
                [doctorIdVal, clinicId]
            );

            if (doctor.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: `Doctor not found in your clinic for token ${tokenNumber}`
                });
            }

            const [availRows] = await connection.execute(
                `SELECT start_time, end_time, average_consultation_minutes, total_tokens, is_leave, is_clinic_blocked
                 FROM doctor_availability
                 WHERE availability_id = ? AND doctor_id = ?
                 LIMIT 1`,
                [availabilityId, doctorIdVal]
            );

            if (availRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: `Availability slot not found for token ${tokenNumber}`
                });
            }

            const slot = availRows[0];

            if (slot.is_leave) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `The doctor is on leave for token ${tokenNumber}'s session — cannot book`
                });
            }

            if (slot.is_clinic_blocked) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `Token ${tokenNumber}'s session has been blocked by the clinic and is not available for booking`
                });
            }

            const now = new Date();
            const [ay, am, ad] = String(appointmentDate).split("-").map(Number);
            const [eh, em] = String(slot.end_time).split(":").map(Number);
            const sessionEndsAt = new Date(ay, (am || 1) - 1, ad || 1, eh || 0, em || 0, 0);

            if (sessionEndsAt.getTime() <= now.getTime()) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `Token ${tokenNumber}'s session ended at ${slot.end_time?.slice(0, 5)} — it can no longer be booked`
                });
            }

            const liveMap = await getTokenMap(availabilityId, clinicId, bookingSource);
            const picked = liveMap && (liveMap.tokens || []).find(
                (tk) => Number(tk.token_number) === Number(tokenNumber)
            );
            const poolLabel = bookingSource === "online" ? "online" : "on-site";

            if (!picked) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `Token ${tokenNumber} is not a ${poolLabel} token for this session. Please refresh and pick again.`
                });
            }

            const [existingToken] = await connection.execute(
                `SELECT appointment_id
                 FROM appointments
                 WHERE doctor_id = ?
                   AND appointment_date = ?
                   AND session = ?
                   AND token_number = ?
                   AND booking_source = ?
                   AND status <> 'Cancelled'
                 LIMIT 1
                 FOR UPDATE`,
                [doctorIdVal, appointmentDate, session, tokenNumber, bookingSource]
            );

            if (existingToken.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `Token ${tokenNumber} is already booked`
                });
            }

            console.log(`[bookMultipleTokens DEBUG] INSERTING token_number=${tokenNumber} for bookingGroupId=${bookingGroupId}`);

            const [result] = await connection.execute(
                `INSERT INTO appointments
                (patient_id, doctor_id, clinic_id, availability_id, appointment_date, session, token_number, status, booking_source, booking_group_id, procedure_note)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Booked', ?, ?, ?)`,
                [
                    resolvedPatientId, doctorIdVal, clinicId, availabilityId,
                    appointmentDate, session, tokenNumber, bookingSource,
                    bookingGroupId, procedure_note || null
                ]
            );

            bookedTokens.push({
                appointment_id: result.insertId,
                token_number: tokenNumber,
                booking_source: bookingSource
            });
        }

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: `${bookedTokens.length} tokens booked successfully for this patient`,
            booking_group_id: bookingGroupId,
            tokens: bookedTokens
        });

    } catch (error) {
        await connection.rollback();

        console.error("Book multiple tokens error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to book tokens",
            error: error.message
        });

    } finally {
        connection.release();
    }
};

// =====================================================
// UPDATE TOKEN STATUS
// =====================================================

// =====================================================
// AUTO-MARK ABSENT
// =====================================================
// POST /api/clinic/appointments/auto-absent
//
// Sweeps this clinic's appointments and marks Absent ONLY the
// ones that are still 'Booked' (never reported/arrived) once
// their session's end time has fully passed. 'Waiting' and later
// statuses are left untouched — the patient DID show up, so
// there's no reason to mark them absent just because time moved
// on. This is meant to run silently on page load; it's also safe
// to call repeatedly (idempotent — nothing left to update the
// second time).
// =====================================================

const autoMarkAbsent = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const [result] = await pool.execute(
            `UPDATE appointments a
             INNER JOIN doctors d ON a.doctor_id = d.doctor_id
             LEFT JOIN doctor_availability da ON a.availability_id = da.availability_id
             SET a.status = 'Absent'
             WHERE d.clinic_id = ?
               AND a.status = 'Booked'
               AND (
                    a.appointment_date < CURDATE()
                    OR (
                        a.appointment_date = CURDATE()
                        AND da.end_time IS NOT NULL
                        AND da.end_time <= CURTIME()
                    )
               )`,
            [clinicId]
        );

        return res.status(200).json({
            success: true,
            marked_count: result.affectedRows
        });

    } catch (error) {
        console.error(
            "Auto-mark absent error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to auto-mark absent appointments",
            error: error.message
        });
    }
};

const updateTokenStatus = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const appointmentId = req.params.id;
        const { status, remark } = req.body;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const allowedStatuses = [
            "Booked",
            "Reserved",
            "Waiting",
            "In Progress",
            "Completed",
            "Skipped",
            "Cancelled",
            "Absent"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid appointment status"
            });
        }

        // A consultation that has already happened (status = 'Completed')
        // is done — it can no longer be cancelled from the token grid.
        // Checked server-side too, since the UI hides the Cancel button
        // for Consulted tokens but this endpoint could still be hit
        // directly.
        if (status === "Cancelled") {
            const [current] = await pool.execute(
                `SELECT status FROM appointments
                 WHERE appointment_id = ? AND clinic_id = ?
                 LIMIT 1`,
                [appointmentId, clinicId]
            );

            if (current.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Appointment not found in your clinic"
                });
            }

            if (current[0].status === "Completed") {
                return res.status(400).json({
                    success: false,
                    message: "This patient has already been consulted — the token can no longer be cancelled."
                });
            }
        }

        const [result] = await pool.execute(
            `UPDATE appointments
             SET status = ?,
                 arrived_time = CASE
                     WHEN ? IN ('Waiting', 'In Progress') AND arrived_time IS NULL THEN NOW()
                     ELSE arrived_time
                 END,
                 remark = CASE
                     WHEN ? IS NOT NULL THEN ?
                     ELSE remark
                 END
             WHERE appointment_id = ?
               AND clinic_id = ?`,
            [
                status,
                status,
                remark ?? null,
                remark ?? null,
                appointmentId,
                clinicId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Appointment not found in your clinic"
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Appointment status updated successfully"
        });

    } catch (error) {
        console.error(
            "Update token status error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update token status",
            error: error.message
        });
    }
};

// =====================================================
// UNBLOCK TOKEN
// =====================================================
// DELETE /api/clinic/appointments/:id/unblock
//
// A "Blocked" token (status = 'Reserved') is only ever a
// temporary hold — no consultation happened, nothing needs
// to stay in the appointment history. Unblocking removes the
// hold completely so the token goes back to being a normal
// free token: it disappears from getAvailabilityTokenMap /
// getAvailabilityTokens's "occupied" list immediately, so
// patients see it as available and can book it again.
//
// This is intentionally different from Cancel: Cancel is for
// a real appointment that didn't happen (keeps a 'Cancelled'
// row for history); Unblock is for undoing a hold that was
// never a real booking in the first place.
//
// Only a token currently in 'Reserved' status can be
// unblocked — once it's been confirmed ('Booked') or moved
// further along the flow, staff should use Cancel instead.
// =====================================================

const unblockToken = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const appointmentId = req.params.id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic not assigned"
            });
        }

        const [existing] = await pool.execute(
            `SELECT appointment_id, status
             FROM appointments
             WHERE appointment_id = ?
               AND clinic_id = ?
             LIMIT 1`,
            [appointmentId, clinicId]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found in your clinic"
            });
        }

        if (existing[0].status !== "Reserved") {
            return res.status(400).json({
                success: false,
                message: "Only a blocked token can be unblocked"
            });
        }

        const [result] = await pool.execute(
            `DELETE FROM appointments
             WHERE appointment_id = ?
               AND clinic_id = ?
               AND status = 'Reserved'`,
            [appointmentId, clinicId]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({
                success: false,
                message:
                    "Token could not be unblocked — its status may have just changed"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Token unblocked successfully"
        });

    } catch (error) {
        console.error(
            "Unblock token error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to unblock token",
            error: error.message
        });
    }
};

// =====================================================
// SESSION CONTROL
// =====================================================

const startSession = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { availability_id, doctor_id, available_date } = req.body;

        if (!clinicId) {
            return res.status(403).json({ success: false, message: "Clinic not assigned" });
        }

        // Check if there's already a live session for this doctor on this date
        const [liveSessions] = await pool.execute(
            `SELECT availability_id FROM doctor_availability 
             WHERE doctor_id = ? AND DATE(available_date) = DATE(?) AND session_state = 'Live' AND is_leave = 0`,
            [doctor_id, available_date]
        );

        if (liveSessions.length > 0 && liveSessions[0].availability_id !== availability_id) {
            return res.status(400).json({ success: false, message: "Another session is already live for this doctor today" });
        }

        await pool.execute(
            `UPDATE doctor_availability SET session_state = 'Live' WHERE availability_id = ?`,
            [availability_id]
        );

        return res.status(200).json({ success: true, message: "Session started successfully" });
    } catch (error) {
        console.error("Start session error:", error);
        return res.status(500).json({ success: false, message: "Failed to start session", error: error.message });
    }
};

const endSession = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { availability_id } = req.body;

        if (!clinicId) {
            return res.status(403).json({ success: false, message: "Clinic not assigned" });
        }

        await pool.execute(
            `UPDATE doctor_availability SET session_state = 'Completed' WHERE availability_id = ?`,
            [availability_id]
        );

        return res.status(200).json({ success: true, message: "Session ended successfully" });
    } catch (error) {
        console.error("End session error:", error);
        return res.status(500).json({ success: false, message: "Failed to end session", error: error.message });
    }
};

// =====================================================
// BLOCK / UNBLOCK SLOT (whole-session emergency hold)
// =====================================================
// Distinct from a doctor's own "leave": this is a clinic-staff
// action to shut a whole session's booking down at once (e.g. the
// doctor is suddenly unavailable). While blocked, the session shows
// 0 available tokens everywhere (getTokenMap) and bookToken rejects
// any attempt to book into it. Existing appointments already booked
// into the session are left untouched — this only stops new ones.
// =====================================================

const blockSlot = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { availabilityId } = req.params;

        if (!clinicId) {
            return res.status(403).json({ success: false, message: "Clinic not assigned" });
        }

        const [rows] = await pool.execute(
            `SELECT da.availability_id
             FROM doctor_availability da
             INNER JOIN doctors d ON d.doctor_id = da.doctor_id
             WHERE da.availability_id = ?
               AND d.clinic_id = ?
             LIMIT 1`,
            [availabilityId, clinicId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Session not found in your clinic" });
        }

        await pool.execute(
            `UPDATE doctor_availability SET is_clinic_blocked = 1 WHERE availability_id = ?`,
            [availabilityId]
        );

        return res.status(200).json({ success: true, message: "Session blocked — no new tokens can be booked until unblocked" });
    } catch (error) {
        console.error("Block slot error:", error);
        return res.status(500).json({ success: false, message: "Failed to block session", error: error.message });
    }
};

const unblockSlot = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { availabilityId } = req.params;

        if (!clinicId) {
            return res.status(403).json({ success: false, message: "Clinic not assigned" });
        }

        const [rows] = await pool.execute(
            `SELECT da.availability_id
             FROM doctor_availability da
             INNER JOIN doctors d ON d.doctor_id = da.doctor_id
             WHERE da.availability_id = ?
               AND d.clinic_id = ?
             LIMIT 1`,
            [availabilityId, clinicId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Session not found in your clinic" });
        }

        await pool.execute(
            `UPDATE doctor_availability SET is_clinic_blocked = 0 WHERE availability_id = ?`,
            [availabilityId]
        );

        return res.status(200).json({ success: true, message: "Session unblocked — it's bookable again" });
    } catch (error) {
        console.error("Unblock slot error:", error);
        return res.status(500).json({ success: false, message: "Failed to unblock session", error: error.message });
    }
};

// =====================================================
// GET CLINIC REPORTS
// =====================================================
// Powers the clinic-facing Reports page: simple totals for a
// date range (day/week/month/year/custom).
// Query params: from_date, to_date (required — the frontend
// computes these for each preset), doctor_id, session, status
// =====================================================

const getClinicReports = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        // Use local date (not UTC) to avoid off-by-one on IST servers
        const nowLocal = new Date();
        const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

        const { doctor_id, session, status } = req.query;
        const from_date = req.query.from_date || today;
        const to_date   = req.query.to_date   || today;

        if (new Date(from_date) > new Date(to_date)) {
            return res.status(400).json({
                success: false,
                message: "From date cannot be after To date"
            });
        }

        let sql = ` AND DATE(a.appointment_date) BETWEEN ? AND ?`;
        const params = [clinicId, from_date, to_date];
        if (doctor_id) { sql += ` AND a.doctor_id = ?`; params.push(doctor_id); }
        if (session)   { sql += ` AND a.session = ?`; params.push(session); }
        if (status) {
            if (status === 'Not Reported') {
                // Not Reported = any appointment that did NOT result in a completed consultation.
                // Includes patients who never arrived (Booked/Absent), are in queue (Waiting),
                // or are mid-consultation (In Progress). All of these have no filed report.
                sql += ` AND a.status IN ('Booked', 'Waiting', 'In Progress', 'Absent')`;
            } else {
                sql += ` AND a.status = ?`; params.push(status);
            }
        }

        const [[summaryRow]] = await pool.execute(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN a.status = 'Completed'                                        THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN a.status = 'Cancelled'                                        THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN a.status = 'Absent'                                           THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN a.status IN ('Booked', 'Waiting', 'In Progress', 'Absent')    THEN 1 ELSE 0 END) AS not_reported
             FROM appointments a
             WHERE a.clinic_id = ?${sql}`,
            params
        );

        return res.status(200).json({
            success: true,
            from_date,
            to_date,
            summary: {
                total_tokens: summaryRow.total        || 0,
                completed:    summaryRow.completed    || 0,
                cancelled:    summaryRow.cancelled    || 0,
                absent:       summaryRow.absent       || 0,
                not_reported: summaryRow.not_reported || 0,
            }
        });

    } catch (error) {
        console.error("Get clinic reports error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate report",
            error: error.message
        });
    }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getClinicReports,
    getDashboard,
    getClinicProfile,
    updateClinicSettings,
    getSessionTokenSettings,
    updateSessionTokenSettings,
    getDoctorSessionTokenSettings,
    updateDoctorSessionTokenSettings,
    startSession,
    endSession,

    getClinicDoctors,
    getClinicStaff,
    getClinicPatients,

    addClinicStaff,
    addClinicDoctor,
    addClinicPatient,

    updateClinicPatient,
    getClinicPatientDetails,

    getClinicDoctorAvailability,
    getClinicAppointments,

    updateClinicDoctor,
    updateClinicDoctorStatus,
    deleteClinicDoctor,

    updateClinicStaff,
    updateClinicStaffStatus,
    deleteClinicStaff,

    bookToken,
    bookMultipleTokens,
    updateTokenStatus,
    autoMarkAbsent,
    unblockToken,
    getAvailabilityTokenMap,
    addExtraTokens,

    getClinicAvailability,
    setAvailability,
    markLeave,

    getClinicDoctorRegularSchedule,
    updateClinicDoctorRegularSchedule,
    resetClinicDoctorAvailability,

    blockSlot,
    unblockSlot
};