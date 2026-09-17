const pool = require("../config/database");
const { ensureRegularSlotsExist, calcTotalTokens, getEffectiveTotalTokens } = require("../utils/availabilityHelper");


// =====================================================
// HELPER: Resolve doctor from authenticated user
//
// Looks up the doctors row for the logged-in user.
// Returns the row, or null if none found.
// This is the single source of truth for doctor_id
// throughout this controller — never trust the client.
// =====================================================

const resolveDoctorFromUser = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT doctor_id, clinic_id, status
         FROM doctors
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
    );
    return rows.length > 0 ? rows[0] : null;
};


// =====================================================
// HELPER: Validate time format HH:MM / HH:MM:SS
// =====================================================

const isValidTime = (value) =>
    /^\d{2}:\d{2}(:\d{2})?$/.test(value);


// =====================================================
// CREATE AVAILABILITY
// POST /api/doctor/availability
// =====================================================

const createAvailability = async (req, res) => {
    try {
        // -------------------------------------------------
        // Resolve doctor_id from authenticated user — never
        // from req.body or req.params.
        // -------------------------------------------------

        const doctor = await resolveDoctorFromUser(req.user.user_id);

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
            });
        }

        if (doctor.status !== "Active") {
            return res.status(403).json({
                success: false,
                message: "Only active doctors can create availability"
            });
        }

        const {
            available_date,
            session,
            start_time,
            end_time,
            average_consultation_minutes,
            total_tokens
        } = req.body;

        // -------------------------------------------------
        // Required field validation
        // -------------------------------------------------

        if (!available_date || !session || !start_time || !end_time) {
            return res.status(400).json({
                success: false,
                message: "available_date, session, start_time and end_time are required"
            });
        }

        // -------------------------------------------------
        // Session validation
        // -------------------------------------------------

        if (!["Morning", "Evening"].includes(session)) {
            return res.status(400).json({
                success: false,
                message: "session must be Morning or Evening"
            });
        }

        // -------------------------------------------------
        // Time format validation
        // -------------------------------------------------

        if (!isValidTime(start_time) || !isValidTime(end_time)) {
            return res.status(400).json({
                success: false,
                message: "start_time and end_time must be in HH:MM format"
            });
        }

        // -------------------------------------------------
        // start_time must be before end_time
        // -------------------------------------------------

        if (start_time >= end_time) {
            return res.status(400).json({
                success: false,
                message: "start_time must be before end_time"
            });
        }

        // -------------------------------------------------
        // Consultation duration validation
        // -------------------------------------------------

        const duration = average_consultation_minutes !== undefined
            ? Number(average_consultation_minutes)
            : 10;

        if (!Number.isInteger(duration) || duration <= 0) {
            return res.status(400).json({
                success: false,
                message: "average_consultation_minutes must be a positive integer"
            });
        }

        // -------------------------------------------------
        // Optional manual total_tokens override
        // -------------------------------------------------

        let tokenOverride = null;
        if (total_tokens !== undefined && total_tokens !== null && total_tokens !== "") {
            const n = Number(total_tokens);
            if (!Number.isInteger(n) || n <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "total_tokens must be a positive integer"
                });
            }
            tokenOverride = n;
        }

        // -------------------------------------------------
        // Prevent duplicate (doctor_id, available_date, session)
        // The unique key handles this at DB level, but we
        // return a clean 409 before hitting the constraint.
        // -------------------------------------------------

        const [existing] = await pool.execute(
            `SELECT availability_id
             FROM doctor_availability
             WHERE doctor_id = ?
               AND available_date = ?
               AND session = ?
             LIMIT 1`,
            [doctor.doctor_id, available_date, session]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Availability already exists for this doctor, date and session"
            });
        }

        // -------------------------------------------------
        // Insert availability
        // -------------------------------------------------

        const [result] = await pool.execute(
            `INSERT INTO doctor_availability
                (doctor_id, available_date, session, start_time, end_time,
                 average_consultation_minutes, total_tokens, is_leave)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                doctor.doctor_id,
                available_date,
                session,
                start_time,
                end_time,
                duration,
                tokenOverride
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Availability created successfully",
            availability: {
                availability_id: result.insertId,
                doctor_id: doctor.doctor_id,
                available_date,
                session,
                start_time,
                end_time,
                average_consultation_minutes: duration,
                total_tokens: tokenOverride,
                is_leave: false
            }
        });

    } catch (error) {
        console.error("Create availability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create availability"
        });
    }
};


// =====================================================
// GET OWN AVAILABILITY
// GET /api/doctor/availability
// Optional query: ?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
// =====================================================

const getAvailability = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
            });
        }

        const { from_date, to_date } = req.query;

        // -------------------------------------------------
        // Build query with optional date range filters
        // -------------------------------------------------

        let query = `
            SELECT
                availability_id,
                doctor_id,
                available_date,
                session,
                start_time,
                end_time,
                average_consultation_minutes,
                is_leave,
                created_at
            FROM doctor_availability
            WHERE doctor_id = ?`;

        const params = [doctor.doctor_id];

        if (from_date) {
            query += ` AND available_date >= ?`;
            params.push(from_date);
        }

        if (to_date) {
            query += ` AND available_date <= ?`;
            params.push(to_date);
        }

        // Lazy-load regular schedule slots BEFORE querying
        if (from_date && to_date) {
            await ensureRegularSlotsExist(doctor.doctor_id, from_date, to_date);
        }

        query += ` ORDER BY available_date ASC, FIELD(session, 'Morning', 'Evening') ASC`;

        const [availability] = await pool.execute(query, params);

        return res.status(200).json({
            success: true,
            count: availability.length,
            availability
        });

    } catch (error) {
        console.error("Get availability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch availability"
        });
    }
};


// =====================================================
// UPDATE AVAILABILITY
// PUT /api/doctor/availability/:id
// =====================================================

const updateAvailability = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
            });
        }

        const availabilityId = req.params.id;

        // -------------------------------------------------
        // Fetch the slot and verify it belongs to this doctor
        // -------------------------------------------------

        const [slots] = await pool.execute(
            `SELECT availability_id, doctor_id, available_date, session,
                    start_time, end_time, average_consultation_minutes, total_tokens, is_leave
             FROM doctor_availability
             WHERE availability_id = ?
             LIMIT 1`,
            [availabilityId]
        );

        if (slots.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability slot not found"
            });
        }

        // -------------------------------------------------
        // Ownership check — doctor cannot update another
        // doctor's slot even if they guess the ID
        // -------------------------------------------------

        if (slots[0].doctor_id !== doctor.doctor_id) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to update this availability slot"
            });
        }

        const existing = slots[0];

        // -------------------------------------------------
        // Merge incoming fields with existing values
        // doctor_id is never updatable
        // -------------------------------------------------

        const available_date = req.body.available_date ?? existing.available_date;
        const session        = req.body.session        ?? existing.session;
        const start_time     = req.body.start_time     ?? existing.start_time;
        const end_time       = req.body.end_time       ?? existing.end_time;

        const rawDuration = req.body.average_consultation_minutes;
        const average_consultation_minutes = rawDuration !== undefined
            ? Number(rawDuration)
            : existing.average_consultation_minutes;

        // total_tokens: undefined means "leave whatever is already
        // stored alone"; null or '' explicitly clears the override
        // back to auto-calculated; anything else must be a positive
        // integer.
        const rawTokens = req.body.total_tokens;
        let total_tokens = existing.total_tokens;
        if (rawTokens !== undefined) {
            if (rawTokens === null || rawTokens === "") {
                total_tokens = null;
            } else {
                const n = Number(rawTokens);
                if (!Number.isInteger(n) || n <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "total_tokens must be a positive integer"
                    });
                }
                total_tokens = n;
            }
        }

        // -------------------------------------------------
        // Validate updated values
        // -------------------------------------------------

        if (!["Morning", "Evening"].includes(session)) {
            return res.status(400).json({
                success: false,
                message: "session must be Morning or Evening"
            });
        }

        if (!isValidTime(start_time) || !isValidTime(end_time)) {
            return res.status(400).json({
                success: false,
                message: "start_time and end_time must be in HH:MM format"
            });
        }

        if (start_time >= end_time) {
            return res.status(400).json({
                success: false,
                message: "start_time must be before end_time"
            });
        }

        if (!Number.isInteger(average_consultation_minutes) ||
            average_consultation_minutes <= 0) {
            return res.status(400).json({
                success: false,
                message: "average_consultation_minutes must be a positive integer"
            });
        }

        // -------------------------------------------------
        // Check the updated (date, session) combination
        // doesn't collide with another row for this doctor
        // (skip the check if neither field changed)
        // -------------------------------------------------

        const dateOrSessionChanged =
            available_date !== existing.available_date ||
            session !== existing.session;

        if (dateOrSessionChanged) {
            const [collision] = await pool.execute(
                `SELECT availability_id
                 FROM doctor_availability
                 WHERE doctor_id = ?
                   AND available_date = ?
                   AND session = ?
                   AND availability_id != ?
                 LIMIT 1`,
                [doctor.doctor_id, available_date, session, availabilityId]
            );

            if (collision.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Another availability slot already exists for this date and session"
                });
            }
        }

        // -------------------------------------------------
        // Never let a capacity reduction silently orphan
        // already-booked patients.
        // -------------------------------------------------

        if (rawTokens !== undefined && total_tokens !== null) {
            const [bookedRows] = await pool.execute(
                `SELECT COUNT(*) AS booked_count
                 FROM appointments
                 WHERE availability_id = ?
                   AND status <> 'Cancelled'`,
                [availabilityId]
            );
            const bookedCount = bookedRows[0].booked_count;

            if (total_tokens < bookedCount) {
                return res.status(409).json({
                    success: false,
                    message: `Cannot set total tokens to ${total_tokens} — ${bookedCount} token(s) are already booked/blocked for this slot. Cancel or move those appointments first, or choose a total of at least ${bookedCount}.`
                });
            }
        }

        await pool.execute(
            `UPDATE doctor_availability
             SET available_date               = ?,
                 session                      = ?,
                 start_time                   = ?,
                 end_time                     = ?,
                 average_consultation_minutes = ?,
                 total_tokens                 = ?,
                 is_override                  = 1
             WHERE availability_id = ?`,
            [
                available_date,
                session,
                start_time,
                end_time,
                average_consultation_minutes,
                total_tokens,
                availabilityId
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Availability updated successfully",
            availability: {
                availability_id: Number(availabilityId),
                doctor_id: doctor.doctor_id,
                available_date,
                session,
                start_time,
                end_time,
                average_consultation_minutes,
                total_tokens,
                is_leave: existing.is_leave
            }
        });

    } catch (error) {
        console.error("Update availability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update availability"
        });
    }
};


// =====================================================
// TOGGLE LEAVE
// PATCH /api/doctor/availability/:id/leave
// Body: { "is_leave": true } or { "is_leave": false }
// =====================================================

const toggleLeave = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
            });
        }

        const availabilityId = req.params.id;

        // -------------------------------------------------
        // Validate is_leave value
        // Accept: true, false, 1, 0
        // -------------------------------------------------

        const { is_leave } = req.body;

        if (is_leave === undefined || is_leave === null) {
            return res.status(400).json({
                success: false,
                message: "is_leave is required (true or false)"
            });
        }

        if (![true, false, 1, 0].includes(is_leave)) {
            return res.status(400).json({
                success: false,
                message: "is_leave must be true, false, 1 or 0"
            });
        }

        const leaveValue = is_leave ? 1 : 0;
        const force = req.body.force === true;

        // -------------------------------------------------
        // Fetch slot and verify ownership
        // -------------------------------------------------

        const [slots] = await pool.execute(
            `SELECT availability_id, doctor_id
             FROM doctor_availability
             WHERE availability_id = ?
             LIMIT 1`,
            [availabilityId]
        );

        if (slots.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability slot not found"
            });
        }

        if (slots[0].doctor_id !== doctor.doctor_id) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to update this availability slot"
            });
        }

        // Existing appointments must never silently disappear when a
        // slot is marked as leave. Warn first and require the doctor
        // to explicitly confirm (force=true) before proceeding — the
        // appointments themselves are still never touched here.
        if (leaveValue === 1) {
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
        }

        // -------------------------------------------------
        // Update is_leave — the row is preserved, not deleted
        // Future booking logic must check is_leave = 0
        // before allowing a patient to book this slot
        // -------------------------------------------------

        await pool.execute(
            `UPDATE doctor_availability
             SET is_leave = ?,
                 is_override = 1
             WHERE availability_id = ?`,
            [leaveValue, availabilityId]
        );

        return res.status(200).json({
            success: true,
            message: is_leave
                ? "Availability marked as leave"
                : "Leave cancelled — availability restored",
            availability_id: Number(availabilityId),
            is_leave: leaveValue === 1
        });

    } catch (error) {
        console.error("Toggle leave error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update leave status"
        });
    }
};


// =====================================================
// DELETE AVAILABILITY
// DELETE /api/doctor/availability/:id
// =====================================================

const deleteAvailability = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
            });
        }

        const availabilityId = req.params.id;

        // -------------------------------------------------
        // Fetch slot and verify ownership before deleting
        // -------------------------------------------------

        const [slots] = await pool.execute(
            `SELECT availability_id, doctor_id
             FROM doctor_availability
             WHERE availability_id = ?
             LIMIT 1`,
            [availabilityId]
        );

        if (slots.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability slot not found"
            });
        }

        if (slots[0].doctor_id !== doctor.doctor_id) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to delete this availability slot"
            });
        }

        // -------------------------------------------------
        // Delete the slot
        // -------------------------------------------------

        await pool.execute(
            `DELETE FROM doctor_availability
             WHERE availability_id = ?`,
            [availabilityId]
        );

        return res.status(200).json({
            success: true,
            message: "Availability slot deleted successfully",
            availability_id: Number(availabilityId)
        });

    } catch (error) {
        console.error("Delete availability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete availability"
        });
    }
};


// =====================================================
// GET DOCTOR APPOINTMENTS
// GET /api/doctor/appointments
// =====================================================

const getDoctorAppointments = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
            });
        }

        const { from_date, to_date, session, status } = req.query;

        let query = `
            SELECT
                a.appointment_id,
                a.patient_id,
                a.appointment_date,
                a.session,
                a.token_number,
                a.status,
                a.arrived_time,
                a.remark,
                p.full_name AS patient_name,
                p.phone AS patient_phone
             FROM appointments a
             LEFT JOIN patients p ON a.patient_id = p.patient_id
             WHERE a.doctor_id = ?
        `;

        const params = [doctor.doctor_id];

        if (from_date) {
            query += ` AND a.appointment_date >= ?`;
            params.push(from_date);
        }
        if (to_date) {
            query += ` AND a.appointment_date <= ?`;
            params.push(to_date);
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

        query += ` ORDER BY a.appointment_date DESC, a.session ASC, a.token_number ASC`;

        const [appointments] = await pool.execute(query, params);

        return res.status(200).json({
            success: true,
            count: appointments.length,
            appointments
        });

    } catch (error) {
        console.error("Get doctor appointments error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch appointments"
        });
    }
};

// =====================================================
// UPDATE APPOINTMENT STATUS
// PATCH /api/doctor/appointments/:id/status
// =====================================================

const updateDoctorAppointmentStatus = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);
        const appointmentId = req.params.id;
        const { status, remark } = req.body;

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Doctor profile not found for this user"
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
                message: "Invalid appointment status"
            });
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
               AND doctor_id = ?`,
            [
                status,
                status,
                remark ?? null,
                remark ?? null,
                appointmentId,
                doctor.doctor_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found for this doctor"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Appointment status updated successfully"
        });

    } catch (error) {
        console.error("Update doctor appointment status error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update appointment status",
            error: error.message
        });
    }
};


// =====================================================
// REGULAR SCHEDULE MANAGEMENT
// =====================================================

const getRegularSchedule = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);
        if (!doctor) return res.status(404).json({ success: false, message: "Doctor profile not found" });

        const [schedule] = await pool.execute(
            `SELECT schedule_id, day_of_week, session, start_time, end_time, average_consultation_minutes 
             FROM doctor_regular_schedule WHERE doctor_id = ? 
             ORDER BY day_of_week ASC, FIELD(session, 'Morning', 'Evening') ASC`,
            [doctor.doctor_id]
        );

        return res.status(200).json({ success: true, schedule });
    } catch (error) {
        console.error("Get regular schedule error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch regular schedule" });
    }
};

const updateRegularSchedule = async (req, res) => {
    let connection;
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);
        if (!doctor) return res.status(404).json({ success: false, message: "Doctor profile not found" });

        const { schedule } = req.body; // array of schedule objects

        if (!Array.isArray(schedule)) {
            return res.status(400).json({ success: false, message: "schedule must be an array" });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Delete existing regular schedule
        await connection.execute(`DELETE FROM doctor_regular_schedule WHERE doctor_id = ?`, [doctor.doctor_id]);

        // 2. Insert new regular schedule
        for (const slot of schedule) {
            const { day_of_week, session, start_time, end_time, average_consultation_minutes } = slot;
            const duration = average_consultation_minutes || 10;
            if (day_of_week === undefined || !session || !start_time || !end_time) continue;
            
            await connection.execute(
                `INSERT INTO doctor_regular_schedule 
                 (doctor_id, day_of_week, session, start_time, end_time, average_consultation_minutes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [doctor.doctor_id, day_of_week, session, start_time, end_time, duration]
            );
        }

        // 3. Delete future instantiated slots that are NOT overrides, NOT leaves, and NOT booked
        await connection.execute(
            `DELETE FROM doctor_availability 
             WHERE doctor_id = ? 
               AND available_date > CURRENT_DATE 
               AND is_override = 0 
               AND is_leave = 0 
               AND availability_id NOT IN (SELECT availability_id FROM appointments)`,
            [doctor.doctor_id]
        );

        await connection.commit();
        return res.status(200).json({ success: true, message: "Regular schedule updated successfully" });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Update regular schedule error:", error);
        return res.status(500).json({ success: false, message: "Failed to update regular schedule" });
    } finally {
        if (connection) connection.release();
    }
};

const resetAvailability = async (req, res) => {
    try {
        const doctor = await resolveDoctorFromUser(req.user.user_id);
        if (!doctor) return res.status(404).json({ success: false, message: "Doctor profile not found" });

        const availabilityId = req.params.id;

        const [slots] = await pool.execute(
            `SELECT availability_id, doctor_id FROM doctor_availability WHERE availability_id = ? LIMIT 1`,
            [availabilityId]
        );
        if (slots.length === 0) return res.status(404).json({ success: false, message: "Slot not found" });
        if (slots[0].doctor_id !== doctor.doctor_id) return res.status(403).json({ success: false, message: "Permission denied" });

        // Check if there are appointments
        const [appts] = await pool.execute(
            `SELECT appointment_id FROM appointments WHERE availability_id = ? AND status != 'Cancelled'`,
            [availabilityId]
        );

        if (appts.length > 0) {
            // Cannot simply delete because there are appointments.
            // Best we can do is just unset is_leave and is_override.
            // It will keep the modified times to protect the bookings.
            await pool.execute(
                `UPDATE doctor_availability SET is_leave = 0, is_override = 0 WHERE availability_id = ?`,
                [availabilityId]
            );
        } else {
            // Delete the slot so it will be regenerated from regular schedule next time
            await pool.execute(`DELETE FROM doctor_availability WHERE availability_id = ?`, [availabilityId]);
        }

        return res.status(200).json({ success: true, message: "Slot reset to regular schedule" });
    } catch (error) {
        console.error("Reset availability error:", error);
        return res.status(500).json({ success: false, message: "Failed to reset availability" });
    }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
    createAvailability,
    getAvailability,
    updateAvailability,
    toggleLeave,
    deleteAvailability,
    getDoctorAppointments,
    updateDoctorAppointmentStatus,
    getRegularSchedule,
    updateRegularSchedule,
    resetAvailability
};