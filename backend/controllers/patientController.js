const pool = require("../config/database");
const { getTokenMap } = require("../utils/availabilityHelper");

// =====================================================
// TOKEN TIMING HELPER
// =====================================================
// Turns a token number into an *approximate* clock time.
// This is intentionally a WINDOW, not a single fixed time,
// because real consultations run faster/slower than the
// average and walk-ins/skips shift the queue. We also
// return an "arrive_by" time that is a few minutes before
// the window starts, so patients build in a buffer instead
// of arriving at the literal predicted second.
//
// ARRIVE_BUFFER_MINUTES: how early we ask patients to arrive
// relative to their estimated window start.
const ARRIVE_BUFFER_MINUTES = 10;

const addMinutesToTimeString = (timeStr, minutesToAdd) => {
    const [h, m] = timeStr.split(":").map(Number);
    const total = h * 60 + m + minutesToAdd;
    const wrapped = ((total % 1440) + 1440) % 1440;
    const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
    const mm = String(wrapped % 60).padStart(2, "0");
    return `${hh}:${mm}`;
};

const formatTimeLabel = (timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
};

/**
 * Given a session's start_time, consultation duration, and a
 * token number, returns an approximate arrival/consultation
 * window for that token.
 */
const getTokenTiming = (startTime, avgConsultationMinutes, tokenNumber) => {
    const windowStart = addMinutesToTimeString(
        startTime,
        (tokenNumber - 1) * avgConsultationMinutes
    );
    const windowEnd = addMinutesToTimeString(
        startTime,
        tokenNumber * avgConsultationMinutes
    );
    const arriveBy = addMinutesToTimeString(
        windowStart,
        -ARRIVE_BUFFER_MINUTES
    );

    return {
        estimated_start_time: windowStart,
        estimated_end_time: windowEnd,
        estimated_time_label: `${formatTimeLabel(windowStart)} - ${formatTimeLabel(windowEnd)}`,
        arrive_by_time: arriveBy,
        arrive_by_label: formatTimeLabel(arriveBy),
        note: `This is an approximate time — please arrive by ${formatTimeLabel(arriveBy)} (about ${ARRIVE_BUFFER_MINUTES} min early). Actual time can shift if the doctor runs ahead or behind.`
    };
};

// =====================================================
// GET PATIENT BY ID
// =====================================================

const getPatientById = async (req, res) => {
    try {
        const patientId = req.params.id;

        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: "Patient ID is required"
            });
        }

        const [rows] = await pool.execute(
            `
            SELECT
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
            LIMIT 1
            `,
            [patientId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        return res.status(200).json({
            success: true,
            patient: rows[0]
        });

    } catch (error) {
        console.error("Get patient error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get patient"
        });
    }
};


// =====================================================
// CREATE PATIENT
// =====================================================
// Patient does NOT need password/login.
// =====================================================

const createPatient = async (req, res) => {
    try {
        const {
            clinic_id,
            full_name,
            phone,
            alternate_phone,
            age,
            gender,
            place,
            address
        } = req.body;

        if (!clinic_id) {
            return res.status(400).json({
                success: false,
                message: "Clinic ID is required"
            });
        }

        if (!full_name || !phone || !address) {
            return res.status(400).json({
                success: false,
                message: "Full Name, Phone and Address are required"
            });
        }

        // Check clinic
        const [clinic] = await pool.execute(
            `
            SELECT clinic_id
            FROM clinics
            WHERE clinic_id = ?
            LIMIT 1
            `,
            [clinic_id]
        );

        if (clinic.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Clinic not found"
            });
        }

        // Check duplicate phone within clinic
        const [existingPatient] = await pool.execute(
            `
            SELECT patient_id
            FROM patients
            WHERE phone = ?
              AND clinic_id = ?
            LIMIT 1
            `,
            [phone, clinic_id]
        );

        if (existingPatient.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Patient with this phone number already exists in this clinic"
            });
        }

        const [result] = await pool.execute(
            `
            INSERT INTO patients
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                clinic_id,
                full_name,
                phone,
                alternate_phone || null,
                age || null,
                gender || null,
                place || null,
                address
            ]
        );

        const [patient] = await pool.execute(
            `
            SELECT
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
            LIMIT 1
            `,
            [result.insertId]
        );

        return res.status(201).json({
            success: true,
            message: "Patient created successfully",
            patient: patient[0]
        });

    } catch (error) {
        console.error("Create patient error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create patient"
        });
    }
};


// =====================================================
// UPDATE PATIENT
// =====================================================

const updatePatient = async (req, res) => {
    try {
        const patientId = req.params.id;

        const {
            full_name,
            phone,
            alternate_phone,
            age,
            gender,
            place,
            address
        } = req.body;

        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: "Patient ID is required"
            });
        }

        if (!full_name || !phone || !address) {
            return res.status(400).json({
                success: false,
                message: "Full Name, Phone and Address are required"
            });
        }

        const [existingPatient] = await pool.execute(
            `
            SELECT patient_id
            FROM patients
            WHERE patient_id = ?
            LIMIT 1
            `,
            [patientId]
        );

        if (existingPatient.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        await pool.execute(
            `
            UPDATE patients
            SET
                full_name = ?,
                phone = ?,
                alternate_phone = ?,
                age = ?,
                gender = ?,
                place = ?,
                address = ?
            WHERE patient_id = ?
            `,
            [
                full_name,
                phone,
                alternate_phone || null,
                age || null,
                gender || null,
                place || null,
                address,
                patientId
            ]
        );

        const [updatedPatient] = await pool.execute(
            `
            SELECT
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
            LIMIT 1
            `,
            [patientId]
        );

        return res.status(200).json({
            success: true,
            message: "Patient updated successfully",
            patient: updatedPatient[0]
        });

    } catch (error) {
        console.error("Update patient error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update patient"
        });
    }
};


// =====================================================
// SEARCH PATIENTS
// =====================================================

const searchPatients = async (req, res) => {
    try {
        const { clinic_id, search } = req.query;

        if (!clinic_id) {
            return res.status(400).json({
                success: false,
                message: "Clinic ID is required"
            });
        }

        let sql = `
            SELECT
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
            WHERE clinic_id = ?
        `;

        const params = [clinic_id];

        if (search && search.trim() !== "") {
            sql += `
                AND (
                    full_name LIKE ?
                    OR phone LIKE ?
                    OR alternate_phone LIKE ?
                )
            `;

            const searchValue = `%${search.trim()}%`;

            params.push(
                searchValue,
                searchValue,
                searchValue
            );
        }

        sql += `
            ORDER BY patient_id DESC
        `;

        const [patients] = await pool.execute(
            sql,
            params
        );

        return res.status(200).json({
            success: true,
            count: patients.length,
            patients
        });

    } catch (error) {
        console.error("Search patients error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to search patients"
        });
    }
};


// =====================================================
// GET PATIENT APPOINTMENTS
// =====================================================

const getPatientAppointments = async (req, res) => {
    try {
        const patientId = req.params.id;

        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: "Patient ID is required"
            });
        }

        const [appointments] = await pool.execute(
            `
            SELECT
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

                c.clinic_name,

                u.full_name AS doctor_name,

                d.specialization

            FROM appointments a

            INNER JOIN clinics c
                ON c.clinic_id = a.clinic_id

            INNER JOIN doctors d
                ON d.doctor_id = a.doctor_id

            INNER JOIN users u
                ON u.user_id = d.user_id

            WHERE a.patient_id = ?

            ORDER BY
                a.appointment_date DESC,
                a.token_number ASC
            `,
            [patientId]
        );

        // Patients should never see the internal "Reserved" status
        // (shown to clinic staff as "Blocked") — a clinic staff
        // member holding a token still just looks like a normal
        // booking from the patient's point of view.
        const patientFacingAppointments = appointments.map(appt => ({
            ...appt,
            status:
                appt.status === "Reserved"
                    ? "Booked"
                    : appt.status
        }));

        return res.status(200).json({
            success: true,
            appointments: patientFacingAppointments
        });

    } catch (error) {
        console.error(
            "Get patient appointments error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to get patient appointments"
        });
    }
};


// =====================================================
// GET MY APPOINTMENTS (OTP-authenticated patient)
// =====================================================
// GET /api/patient/appointments/me
// Requires Authorization: Bearer <patient token>
//
// A phone number can correspond to several `patients` rows
// (one per clinic they've booked with — see bookAppointment),
// so this pulls every appointment across all of them, not just
// one clinic's.
// =====================================================

const getMyAppointments = async (req, res) => {
    try {
        const phone = req.patientAuth?.phone;

        if (!phone) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated"
            });
        }

        const [appointments] = await pool.execute(
            `
            SELECT
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

                c.clinic_name,
                c.address AS clinic_address,
                c.city AS clinic_city,
                c.phone AS clinic_phone,

                u.full_name AS doctor_name,

                d.specialization,

                da.start_time,
                da.end_time,
                da.average_consultation_minutes

            FROM appointments a

            INNER JOIN patients p
                ON p.patient_id = a.patient_id

            INNER JOIN clinics c
                ON c.clinic_id = a.clinic_id

            INNER JOIN doctors d
                ON d.doctor_id = a.doctor_id

            INNER JOIN users u
                ON u.user_id = d.user_id

            LEFT JOIN doctor_availability da
                ON da.availability_id = a.availability_id

            WHERE p.phone = ?

            ORDER BY
                a.appointment_date DESC,
                a.token_number ASC
            `,
            [phone]
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const patientFacingAppointments = appointments.map(appt => {
            const apptDate = new Date(appt.appointment_date);
            apptDate.setHours(0, 0, 0, 0);

            return {
                ...appt,
                // Patients should never see the internal "Reserved" status
                // (shown to clinic staff as "Blocked").
                status: appt.status === "Reserved" ? "Booked" : appt.status,
                is_upcoming: apptDate.getTime() >= today.getTime() &&
                    !["Cancelled", "Completed", "Absent"].includes(appt.status)
            };
        });

        return res.status(200).json({
            success: true,
            appointments: patientFacingAppointments,
            upcoming: patientFacingAppointments.filter(a => a.is_upcoming),
            past: patientFacingAppointments.filter(a => !a.is_upcoming)
        });

    } catch (error) {
        console.error("Get my appointments error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get appointments"
        });
    }
};


// =====================================================
// GET PATIENTS BY CLINIC
// =====================================================

const getPatientsByClinic = async (req, res) => {
    try {
        const clinicId = req.params.clinicId;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic ID is required"
            });
        }

        const [patients] = await pool.execute(
            `
            SELECT
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
            WHERE clinic_id = ?

            ORDER BY patient_id DESC
            `,
            [clinicId]
        );

        return res.status(200).json({
            success: true,
            count: patients.length,
            patients
        });

    } catch (error) {
        console.error(
            "Get patients by clinic error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to get clinic patients"
        });
    }
};


// =====================================================
// PUBLIC PATIENT APP
// =====================================================
// No authentication required.
//
// GET /api/patient/clinics
// Optional query params:
//   search — matches clinic_name / city / place text
// =====================================================

const getClinics = async (req, res) => {
    try {
        const { search } = req.query;

        let sql = `
            SELECT
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
                clinic_type,
                status
            FROM clinics
            WHERE status = 'Active'
        `;
        const params = [];

        if (search && search.trim() !== "") {
            sql += ` AND (clinic_name LIKE ? OR city LIKE ? OR address LIKE ? OR pincode LIKE ?)`;
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s);
        }

        sql += ` ORDER BY clinic_name ASC`;

        const [clinics] = await pool.execute(sql, params);

        return res.status(200).json({
            success: true,
            count: clinics.length,
            clinics
        });

    } catch (error) {
        console.error("Get clinics error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch clinics"
        });
    }
};


// =====================================================
// GET NEARBY CLINICS
// =====================================================
// GET /api/patient/clinics/nearby?lat=..&lng=..&radius_km=15
// Straight-line (haversine) distance from the patient's
// current location. Clinics without lat/long are skipped —
// they simply can't be placed on the map.
// =====================================================

const getNearbyClinics = async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const radiusKm = req.query.radius_km ? parseFloat(req.query.radius_km) : 25;

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return res.status(400).json({
                success: false,
                message: "lat and lng query params are required"
            });
        }

        const [clinics] = await pool.execute(
            `
            SELECT
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
                clinic_type,
                status,
                (
                    6371 * ACOS(
                        COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                        COS(RADIANS(longitude) - RADIANS(?)) +
                        SIN(RADIANS(?)) * SIN(RADIANS(latitude))
                    )
                ) AS distance_km
            FROM clinics
            WHERE status = 'Active'
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            HAVING distance_km <= ?
            ORDER BY distance_km ASC
            `,
            [lat, lng, lat, radiusKm]
        );

        const clinicsRounded = clinics.map(c => ({
            ...c,
            distance_km: Math.round(c.distance_km * 10) / 10
        }));

        return res.status(200).json({
            success: true,
            count: clinicsRounded.length,
            clinics: clinicsRounded
        });

    } catch (error) {
        console.error("Get nearby clinics error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch nearby clinics"
        });
    }
};


// =====================================================
// GET DOCTORS OF A CLINIC
// =====================================================
// GET /api/patient/clinics/:clinicId/doctors
// =====================================================

const getClinicDoctors = async (req, res) => {
    try {
        const clinicId = req.params.clinicId;

        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic ID is required"
            });
        }

        const [doctors] = await pool.execute(
            `
            SELECT
                d.doctor_id,
                d.clinic_id,
                d.user_id,
                u.full_name,
                u.email,
                u.phone,
                u.designation,
                d.specialization,
                d.qualification,
                d.consultation_fee,
                d.status

            FROM doctors d

            INNER JOIN users u
                ON d.user_id = u.user_id

            WHERE d.clinic_id = ?
              AND d.status = 'Active'
              AND u.status = 'Active'

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
// GET DOCTOR AVAILABILITY
// =====================================================
// GET /api/patient/doctors/:doctorId/availability
// =====================================================

const getDoctorAvailability = async (req, res) => {
    try {
        const doctorId = req.params.doctorId;
        const { date } = req.query; // optional: filter by date

        if (!doctorId) {
            return res.status(400).json({
                success: false,
                message: "Doctor ID is required"
            });
        }

        // Check doctor
        const [doctor] = await pool.execute(
            `
            SELECT
                d.doctor_id,
                d.clinic_id,
                u.full_name AS doctor_name,
                d.specialization

            FROM doctors d

            INNER JOIN users u
                ON u.user_id = d.user_id

            WHERE d.doctor_id = ?
              AND d.status = 'Active'
              AND u.status = 'Active'

            LIMIT 1
            `,
            [doctorId]
        );

        if (doctor.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Doctor not found"
            });
        }

        // Generate regular slots for next 30 days if no date filter
        const { ensureRegularSlotsExist } = require('../utils/availabilityHelper');
        const fromDate = date || new Date().toISOString().split('T')[0];
        const toDateObj = new Date(fromDate);
        toDateObj.setDate(toDateObj.getDate() + 30);
        const toDate = toDateObj.toISOString().split('T')[0];
        await ensureRegularSlotsExist(doctorId, fromDate, toDate);

        let sql = `
            SELECT
                availability_id,
                doctor_id,
                available_date,
                session,
                start_time,
                end_time,
                average_consultation_minutes,
                is_leave,
                is_override

            FROM doctor_availability

            WHERE doctor_id = ?
              AND is_leave = 0
              AND (
                    available_date > CURDATE()
                    OR (available_date = CURDATE() AND end_time > CURTIME())
                  )
        `;
        const params = [doctorId];

        if (date) {
            sql += ` AND available_date = ?`;
            params.push(date);
        }

        sql += ` ORDER BY available_date ASC, FIELD(session, 'Morning', 'Evening') ASC, start_time ASC`;

        const [availability] = await pool.execute(sql, params);

        return res.status(200).json({
            success: true,

            doctor: doctor[0],

            availability
        });

    } catch (error) {
        console.error(
            "Get doctor availability error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to get doctor availability"
        });
    }
};


// =====================================================
// GET AVAILABLE TOKENS
// =====================================================
// GET /api/patient/availability/:availabilityId/tokens
// =====================================================

const getAvailabilityTokens = async (req, res) => {
    try {
        const availabilityId =
            req.params.availabilityId;

        if (!availabilityId) {
            return res.status(400).json({
                success: false,
                message: "Availability ID is required"
            });
        }

        // Get availability from doctor_availability
        const [availability] = await pool.execute(
            `
            SELECT
                da.availability_id,
                da.doctor_id,
                da.available_date,
                da.session,
                da.start_time,
                da.end_time,
                da.average_consultation_minutes,
                da.total_tokens,
                da.is_leave,
                d.clinic_id

            FROM doctor_availability da
            INNER JOIN doctors d ON d.doctor_id = da.doctor_id

            WHERE da.availability_id = ?

            LIMIT 1
            `,
            [availabilityId]
        );

        if (availability.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Availability not found"
            });
        }

        const slot = availability[0];

        if (slot.is_leave) {
            return res.status(200).json({
                success: true,
                availability: slot,
                total_tokens: 0,
                booked_tokens: 0,
                remaining_tokens: 0,
                available_tokens: []
            });
        }

        const tokenMap = await getTokenMap(availabilityId, slot.clinic_id, "all");
        const tokens = (tokenMap && tokenMap.tokens) ? tokenMap.tokens : [];
        
        // available_tokens array for legacy compatibility (if needed)
        const availableTokens = tokens.filter(t => t.is_available && t.booking_source === 'online').map(t => t.token_number);
        
        // We now send ALL tokens (onsite, online, booked, etc) so the frontend can build the full grid
        const allTokenDetails = tokens.map(t => ({
            token_number: t.token_number,
            estimated_start_time: t.estimated_start_time,
            estimated_end_time: t.estimated_end_time,
            estimated_time_label: t.estimated_time_label,
            arrive_by_time: t.arrive_by_time,
            arrive_by_label: t.arrive_by_label,
            note: t.note,
            booking_source: t.booking_source,
            is_available: t.is_available,
            status: t.status
        }));

        return res.status(200).json({
            success: true,
            availability: slot,
            total_tokens: tokenMap ? tokenMap.total_tokens : 0,
            booked_tokens: tokenMap ? tokenMap.booked_tokens : 0,
            remaining_tokens: availableTokens.length,
            available_tokens: availableTokens,
            available_token_details: allTokenDetails
        });

    } catch (error) {
        console.error(
            "Get availability tokens error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to get available tokens"
        });
    }
};


// =====================================================
// BOOK APPOINTMENT
// =====================================================
// POST /api/patient/appointments
//
// Patient does NOT login.
//
// Request:
// {
//   "availability_id": 1,
//   "patient_id": 1,
//   "full_name": "John",
//   "phone": "9876543210",
//   "alternate_phone": "...",
//   "age": 25,
//   "gender": "Male",
//   "place": "Bangalore",
//   "address": "....",
//   "token_number": 5
// }
// =====================================================

const bookAppointment = async (req, res) => {
    const connection =
        await pool.getConnection();

    try {
        const {
            availability_id,
            patient_id,
            full_name,
            phone,
            alternate_phone,
            age,
            gender,
            place,
            address,
            token_number
        } = req.body;

        if (!availability_id) {
            return res.status(400).json({
                success: false,
                message: "Availability ID is required"
            });
        }

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required"
            });
        }

        if (!full_name) {
            return res.status(400).json({
                success: false,
                message: "Full name is required"
            });
        }

        // =================================================
        // START TRANSACTION
        // =================================================

        await connection.beginTransaction();

        // =================================================
        // GET AVAILABILITY
        // FOR UPDATE prevents two people getting same slot
        // =================================================

        const [availabilityRows] =
            await connection.execute(
                `
                SELECT
                    da.availability_id,
                    da.doctor_id,
                    da.available_date,
                    da.session,
                    da.start_time,
                    da.end_time,
                    da.average_consultation_minutes,
                    da.total_tokens,
                    da.is_leave,
                    d.clinic_id

                FROM doctor_availability da
                INNER JOIN doctors d ON d.doctor_id = da.doctor_id

                WHERE da.availability_id = ?

                LIMIT 1

                FOR UPDATE
                `,
                [availability_id]
            );

        if (availabilityRows.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Availability not found"
            });
        }

        const availability =
            availabilityRows[0];

        // =================================================
        // CHECK AVAILABILITY STATUS
        // =================================================

        if (availability.is_leave) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Doctor is not available for this session"
            });
        }

        // =================================================
        // CHECK DATE
        // =================================================

        const appointmentDate =
            new Date(availability.available_date);

        const today = new Date();

        appointmentDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (appointmentDate < today) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Cannot book an appointment for a past date"
            });
        }

        // =================================================
        // CHECK SESSION HASN'T ALREADY ENDED
        // =================================================
        // Same date isn't enough — if it's today and the session's
        // end time has already passed, there's nobody left to see.
        // Applies to patient self-booking exactly like clinic staff.

        const [endH, endM] = String(availability.end_time).split(':');
        const isoEndStr = `${availability.available_date}T${endH.padStart(2, '0')}:${endM.padStart(2, '0')}:00+05:30`;
        const sessionEndsAt = new Date(isoEndStr);

        if (sessionEndsAt.getTime() <= Date.now()) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: `This session ended at ${String(availability.end_time).slice(0, 5)} and can no longer be booked. Please choose an upcoming session.`
            });
        }

        // =================================================
        // PATIENT
        // =================================================

        let finalPatientId = patient_id;

        if (finalPatientId) {

            // Existing patient
            const [patientRows] =
                await connection.execute(
                    `
                    SELECT
                        patient_id,
                        clinic_id

                    FROM patients

                    WHERE patient_id = ?

                    LIMIT 1
                    `,
                    [finalPatientId]
                );

            if (patientRows.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Get doctor's clinic to validate patient belongs there
            const [doctorClinicRows] =
                await connection.execute(
                    `SELECT clinic_id FROM doctors WHERE doctor_id = ? LIMIT 1`,
                    [availability.doctor_id]
                );
            const doctorClinicId = doctorClinicRows[0]?.clinic_id;

            // Make sure patient belongs to same clinic (if clinic_id is set)
            if (
                patientRows[0].clinic_id &&
                doctorClinicId &&
                Number(patientRows[0].clinic_id) !==
                Number(doctorClinicId)
            ) {
                await connection.rollback();

                return res.status(403).json({
                    success: false,
                    message:
                        "Patient does not belong to this clinic"
                });
            }

        } else {

            // =================================================
            // CREATE PATIENT
            // =================================================

            // Get doctor's clinic for patient creation
            const [dClinicRows] =
                await connection.execute(
                    `SELECT clinic_id FROM doctors WHERE doctor_id = ? LIMIT 1`,
                    [availability.doctor_id]
                );
            const dClinicId = dClinicRows[0]?.clinic_id;

            const [existingPatients] =
                await connection.execute(
                    `
                    SELECT patient_id

                    FROM patients

                    WHERE phone = ?
                      AND clinic_id = ?

                    LIMIT 1
                    `,
                    [
                        phone,
                        dClinicId
                    ]
                );

            if (existingPatients.length > 0) {

                finalPatientId =
                    existingPatients[0].patient_id;

                // Update basic details
                await connection.execute(
                    `
                    UPDATE patients

                    SET
                        full_name = ?,
                        alternate_phone = ?,
                        age = ?,
                        gender = ?,
                        place = ?,
                        address = ?

                    WHERE patient_id = ?
                    `,
                    [
                        full_name,
                        alternate_phone || null,
                        age || null,
                        gender || null,
                        place || null,
                        address || place || '',
                        finalPatientId
                    ]
                );

            } else {

                const [patientResult] =
                    await connection.execute(
                        `
                        INSERT INTO patients
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

                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        [
                            dClinicId,
                            full_name,
                            phone,
                            alternate_phone || null,
                            age || null,
                            gender || null,
                            place || null,
                            address || place || ''
                        ]
                    );

                finalPatientId =
                    patientResult.insertId;
            }
        }

        // =================================================
        // DETERMINE TOKEN
        // =================================================

        let finalTokenNumber =
            token_number
                ? Number(token_number)
                : null;

        const liveMap = await getTokenMap(availability_id, availability.clinic_id, "online");
        const onlineTokens = (liveMap && liveMap.tokens) ? liveMap.tokens : [];
        const availableOnline = onlineTokens.filter(t => t.is_available);
        const onlineNumbers = new Set(onlineTokens.map(t => Number(t.token_number)));

        if (!finalTokenNumber) {
            finalTokenNumber = availableOnline.length > 0
                ? Number(availableOnline[0].token_number)
                : null;
        }

        if (!finalTokenNumber || !onlineNumbers.has(Number(finalTokenNumber))) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "No valid token is available"
            });
        }

        // =================================================
        // CHECK TOKEN AGAIN
        // =================================================

        const [existingToken] =
            await connection.execute(
                `
                SELECT appointment_id

                FROM appointments

                WHERE availability_id = ?
                  AND token_number = ?
                  AND booking_source = 'online'

                  AND status IN (
                    'Booked',
                    'Reserved',
                    'In Progress',
                    'Completed'
                  )

                LIMIT 1
                `,
                [
                    availability_id,
                    finalTokenNumber
                ]
            );

        if (existingToken.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    `Token ${finalTokenNumber} is already booked`
            });
        }

        // Get clinic_id from doctors table (doctor_availability has no clinic_id)
        const [clinicRows] = await connection.execute(
            `SELECT clinic_id FROM doctors WHERE doctor_id = ? LIMIT 1`,
            [availability.doctor_id]
        );
        const appointmentClinicId = clinicRows[0]?.clinic_id;

        const [appointmentResult] =
            await connection.execute(
                `
                INSERT INTO appointments
                (
                    patient_id,
                    doctor_id,
                    clinic_id,
                    availability_id,
                    appointment_date,
                    session,
                    token_number,
                    status,
                    booking_source,
                    booking_time
                )

                VALUES (?, ?, ?, ?, ?, ?, ?, 'Booked', 'online', NOW())
                `,
                [
                    finalPatientId,
                    availability.doctor_id,
                    appointmentClinicId,
                    availability.availability_id,
                    availability.available_date,
                    availability.session,
                    finalTokenNumber
                ]
            );

        // =================================================
        // COMMIT
        // =================================================

        await connection.commit();

        // =================================================
        // RESPONSE
        // =================================================

        const bookedToken = onlineTokens.find(t => Number(t.token_number) === Number(finalTokenNumber));
        const timing = bookedToken || {};

        return res.status(201).json({
            success: true,
            message:
                "Appointment booked successfully",

            appointment: {
                appointment_id:
                    appointmentResult.insertId,

                patient_id:
                    finalPatientId,

                doctor_id:
                    availability.doctor_id,

                clinic_id:
                    appointmentClinicId,

                availability_id:
                    availability.availability_id,

                appointment_date:
                    availability.available_date,

                session:
                    availability.session,

                token_number:
                    finalTokenNumber,

                status:
                    "Booked",

                // Approximate consultation window + arrival
                // guidance for this token (see getTokenTiming).
                estimated_start_time:
                    timing.estimated_start_time,
                estimated_end_time:
                    timing.estimated_end_time,
                estimated_time_label:
                    timing.estimated_time_label,
                arrive_by_time:
                    timing.arrive_by_time,
                arrive_by_label:
                    timing.arrive_by_label,
                timing_note:
                    timing.note
            }
        });

    } catch (error) {

        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error(
                "Rollback error:",
                rollbackError
            );
        }

        console.error(
            "Book appointment error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to book appointment"
        });

    } finally {
        connection.release();
    }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    // Patient management
    getPatientById,
    createPatient,
    updatePatient,
    searchPatients,
    getPatientAppointments,
    getPatientsByClinic,

    // Public patient application
    getClinics,
    getNearbyClinics,
    getClinicDoctors,
    getDoctorAvailability,
    getAvailabilityTokens,
    bookAppointment,
    getMyAppointments
};