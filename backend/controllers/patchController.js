const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'clinicController.js');
let code = fs.readFileSync(target, 'utf8');

// 1. Update addClinicPatient
code = code.replace(/const addClinicPatient = async \(req, res\) => \{[\s\S]*?return res\.status\(201\)\.json\(\{[\s\S]*?\}\);\s*\} catch \(error\) \{/m, (match) => {
    return `const addClinicPatient = async (req, res) => {
    try {
        const {
            full_name,
            phone,
            alternate_phone,
            address,
            age,
            gender,
            place
        } = req.body;

        if (!full_name || !phone) {
            return res.status(400).json({
                success: false,
                message: "full_name and phone are required"
            });
        }

        const clinicId = req.user.clinic_id;
        if (!clinicId) {
            return res.status(400).json({
                success: false,
                message: "Clinic is not assigned to this user"
            });
        }

        const [result] = await pool.execute(
            \`INSERT INTO patients
                (full_name, phone, alternate_phone, address, clinic_id, age, gender, place)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
            [
                full_name,
                phone,
                alternate_phone || null,
                address || null,
                clinicId,
                age || null,
                gender || 'Other',
                place || null
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Patient created successfully",
            patient: {
                patient_id: result.insertId,
                full_name,
                phone,
                alternate_phone: alternate_phone || null,
                address: address || null,
                age: age || null,
                gender: gender || 'Other',
                place: place || null
            }
        });

    } catch (error) {`;
});

// 2. Add updateClinicPatient and getClinicPatientDetails
const newPatientFunctions = `
// =====================================================
// UPDATE CLINIC PATIENT
// PUT /api/clinic/patients/:id
// =====================================================

const updateClinicPatient = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { id } = req.params;
        const { full_name, phone, alternate_phone, address, age, gender, place } = req.body;

        if (!clinicId) return res.status(400).json({ success: false, message: "Clinic not assigned" });

        // Verify patient belongs to this clinic
        const [patCheck] = await pool.execute(
            \`SELECT patient_id FROM patients WHERE patient_id = ? AND clinic_id = ?\`,
            [id, clinicId]
        );

        if (patCheck.length === 0) {
            return res.status(404).json({ success: false, message: "Patient not found in this clinic" });
        }

        await pool.execute(
            \`UPDATE patients
             SET full_name = ?, phone = ?, alternate_phone = ?, address = ?, age = ?, gender = ?, place = ?
             WHERE patient_id = ?\`,
            [
                full_name, phone, alternate_phone || null, address || null, 
                age || null, gender || 'Other', place || null, id
            ]
        );

        return res.status(200).json({ success: true, message: "Patient updated successfully" });
    } catch (error) {
        console.error("Update patient error:", error);
        return res.status(500).json({ success: false, message: "Failed to update patient" });
    }
};

// =====================================================
// GET CLINIC PATIENT DETAILS
// GET /api/clinic/patients/:id/details
// =====================================================

const getClinicPatientDetails = async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { id } = req.params;

        if (!clinicId) return res.status(400).json({ success: false, message: "Clinic not assigned" });

        // Verify patient belongs to this clinic or has booked a token here
        const [patients] = await pool.execute(
            \`SELECT p.* FROM patients p WHERE p.patient_id = ? AND p.clinic_id = ? LIMIT 1\`,
            [id, clinicId]
        );
        let patient = patients.length > 0 ? patients[0] : null;

        if (!patient) {
            // Check if they booked here
            const [apptCheck] = await pool.execute(
                \`SELECT p.* FROM patients p INNER JOIN appointments a ON p.patient_id = a.patient_id WHERE p.patient_id = ? AND a.clinic_id = ? LIMIT 1\`,
                [id, clinicId]
            );
            if (apptCheck.length > 0) patient = apptCheck[0];
        }

        if (!patient) {
            return res.status(404).json({ success: false, message: "Patient not found in this clinic" });
        }

        // Get past appointments at this clinic
        const [appointments] = await pool.execute(
            \`SELECT a.appointment_date, a.session, a.token_number, a.status, u.full_name AS doctor_name, d.specialization 
             FROM appointments a 
             INNER JOIN doctors d ON a.doctor_id = d.doctor_id 
             INNER JOIN users u ON d.user_id = u.user_id 
             WHERE a.patient_id = ? AND a.clinic_id = ?
             ORDER BY a.appointment_date DESC, a.created_at DESC\`,
            [id, clinicId]
        );

        // Get distinct doctors
        const doctorsVisited = [];
        const seenDocs = new Set();
        appointments.forEach(a => {
            if (!seenDocs.has(a.doctor_name)) {
                seenDocs.add(a.doctor_name);
                doctorsVisited.push({ doctor_name: a.doctor_name, specialization: a.specialization });
            }
        });

        return res.status(200).json({
            success: true,
            patient,
            appointments,
            doctorsVisited
        });
    } catch (error) {
        console.error("Get patient details error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch patient details" });
    }
};........

`;

code = code.replace(/\/\/ =====================================================\n\/\/ GET CLINIC DOCTOR AVAILABILITY/, newPatientFunctions + '// =====================================================\n// GET CLINIC DOCTOR AVAILABILITY');


// 3. Update bookToken to handle age and gender
// Find the destructuring of req.body in bookToken
code = code.replace(/const \{\s*doctor_id,\s*availability_id,\s*appointment_date,\s*session,\s*token_number,\s*patient_name,\s*patient_phone,\s*patient_alt_phone,\s*patient_address,\s*status\s*\} = req\.body;/, `const {
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
            status
        } = req.body;`);

// Find the FIND OR CREATE PATIENT block
const createPatRegex = /const \[newPat\] =\s*await connection\.execute\([\s\S]*?\]\s*\);\s*patientId =\s*newPat\.insertId;/;
const newCreatePat = `const [newPat] =
                await connection.execute(
                    \`INSERT INTO patients
                        (
                            full_name,
                            phone,
                            alternate_phone,
                            address,
                            clinic_id,
                            age,
                            gender
                        )
                     VALUES
                        (?, ?, ?, ?, ?, ?, ?)\`,
                    [
                        patient_name.trim(),
                        patient_phone.trim(),
                        patient_alt_phone || null,
                        patient_address || "",
                        clinicId,
                        patient_age || null,
                        patient_gender || 'Other'
                    ]
                );

            patientId = newPat.insertId;`;
code = code.replace(createPatRegex, newCreatePat);

// Now update the existing patient update block
const findPatRegex = /if \(patCheck\.length > 0\) \{\s*patientId =\s*patCheck\[0\]\.patient_id;\s*\}/;
const newFindPat = `if (patCheck.length > 0) {
            patientId = patCheck[0].patient_id;
            // Update age/gender if provided
            if (patient_age !== undefined || patient_gender !== undefined) {
                await connection.execute(
                    \`UPDATE patients SET 
                        age = COALESCE(?, age), 
                        gender = COALESCE(?, gender) 
                     WHERE patient_id = ?\`,
                    [patient_age || null, patient_gender || null, patientId]
                );
            }
        }`;
code = code.replace(findPatRegex, newFindPat);

// 4. Export new functions
code = code.replace(/addClinicPatient,/, "addClinicPatient,\n    updateClinicPatient,\n    getClinicPatientDetails,");

fs.writeFileSync(target, code);
console.log('Patch successful');
