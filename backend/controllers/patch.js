const fs = require('fs');
let code = fs.readFileSync('clinicController.js', 'utf8');

const bookTokenStr = `
// =====================================================
// BOOK TOKEN
// =====================================================
const bookToken = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const clinicId = req.user.clinic_id;
        const { doctor_id, availability_id, appointment_date, session, token_number, patient_name, patient_phone, patient_alt_phone, patient_address } = req.body;

        if (!clinicId) return res.status(403).json({ success: false, message: 'Unauthorized' });
        if (!doctor_id || !availability_id || !appointment_date || !session || !token_number || !patient_name || !patient_phone) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const [docCheck] = await connection.execute('SELECT doctor_id FROM doctors WHERE doctor_id = ? AND clinic_id = ?', [doctor_id, clinicId]);
        if (docCheck.length === 0) {
            connection.release();
            return res.status(403).json({ success: false, message: 'Doctor not found in this clinic' });
        }

        const [availCheck] = await connection.execute(
            'SELECT start_time, end_time, average_consultation_minutes, is_leave FROM doctor_availability WHERE availability_id = ? AND doctor_id = ?',
            [availability_id, doctor_id]
        );
        if (availCheck.length === 0) {
            connection.release();
            return res.status(404).json({ success: false, message: 'Availability slot not found' });
        }
        if (availCheck[0].is_leave) {
            connection.release();
            return res.status(400).json({ success: false, message: 'Doctor is on leave for the selected date' });
        }

        const slot = availCheck[0];
        const [h1, m1] = slot.start_time.split(':').map(Number);
        const [h2, m2] = slot.end_time.split(':').map(Number);
        const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        const maxTokens = Math.floor(totalMinutes / (slot.average_consultation_minutes || 15));

        if (token_number > maxTokens || token_number < 1) {
            connection.release();
            return res.status(400).json({ success: false, message: \`Token number \${token_number} is outside the valid range for this session (max \${maxTokens}).\` });
        }

        await connection.beginTransaction();

        const [tokenCheck] = await connection.execute(
            'SELECT appointment_id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND session = ? AND token_number = ? AND status != \\'Cancelled\\'',
            [doctor_id, appointment_date, session, token_number]
        );
        if (tokenCheck.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ success: false, message: 'This token is no longer available. Please select another token.' });
        }

        if (token_number > 1) {
            const [earlierTokensCheck] = await connection.execute(
                'SELECT COUNT(*) as earlierBooked FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND session = ? AND token_number < ? AND status != \\'Cancelled\\'',
                [doctor_id, appointment_date, session, token_number]
            );
            
            if (earlierTokensCheck[0].earlierBooked < (token_number - 1)) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ success: false, message: \`Please select the next available token in order. (Next is Token \${earlierTokensCheck[0].earlierBooked + 1})\` });
            }
        }

        let patientId;
        const [patCheck] = await connection.execute('SELECT patient_id FROM patients WHERE phone = ? LIMIT 1', [patient_phone]);
        if (patCheck.length > 0) {
            patientId = patCheck[0].patient_id;
        } else {
            const [newPat] = await connection.execute(
                'INSERT INTO patients (full_name, phone, alternate_phone, address) VALUES (?, ?, ?, ?)',
                [patient_name.trim(), patient_phone.trim(), patient_alt_phone || null, patient_address || '']
            );
            patientId = newPat.insertId;
        }

        const [appt] = await connection.execute(
            'INSERT INTO appointments (patient_id, doctor_id, clinic_id, availability_id, appointment_date, session, token_number, status, reserved_by) VALUES (?, ?, ?, ?, ?, ?, ?, \\'Booked\\', ?)',
            [patientId, doctor_id, clinicId, availability_id, appointment_date, session, token_number, req.user.user_id]
        );

        await connection.commit();
        connection.release();
        return res.status(201).json({ success: true, message: 'Token booked successfully', appointment_id: appt.insertId });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Book token error:', error);
        return res.status(500).json({ success: false, message: 'Failed to book token' });
    }
};

`;

code = code.replace(/\/\/ =====================================================\n\/\/ BOOK TOKEN(?:[\s\S]*?)(?=\/\/ =====================================================\n\/\/ UPDATE TOKEN STATUS)/, '');
code = code.replace(/\/\/ =====================================================\n\/\/ =====================================================\nconst updateTokenStatus/, bookTokenStr + '// =====================================================\n// UPDATE TOKEN STATUS\n// =====================================================\nconst updateTokenStatus');
code = code.replace(/module\.exports = \{([\s\S]*?)\}/, (match, inner) => {
    if (!inner.includes('bookToken')) {
        return 'module.exports = {\n    bookToken,' + inner + '}';
    }
    return match;
});

fs.writeFileSync('clinicController.js', code);
