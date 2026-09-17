const pool = require("../config/database");

// =====================================================
// SESSION AUTOMATION
// =====================================================
// Rules:
// 1. AUTO-START: a 'Scheduled' session automatically becomes 'Live'
//    once the current time falls inside its [start_time, end_time)
//    window on its own date. (Only staff/doctor can start it early
//    via the existing manual startSession endpoint.)
//
// 2. AUTO-END AFTER END TIME: when CURTIME() >= end_time and the
//    session is still 'Live', it is auto-completed ONLY IF there are
//    no appointments in a pending/active state (Booked, Reserved,
//    Waiting, In Progress). If pending appointments remain, the
//    session stays Live until they are all resolved, then it will
//    be swept up by autoCompleteFinishedSessions on the next tick.
//
// 3. AUTO-COMPLETE ON EMPTY QUEUE: once every appointment for a Live
//    session has reached a final state (Completed / Skipped /
//    Cancelled / Absent) the session is auto-completed regardless of
//    the current time. A session with zero appointments is NOT
//    auto-completed by this rule (it needs end-time or manual end).
// =====================================================

const PENDING_STATUSES = ["Booked", "Reserved", "Waiting", "In Progress"];
const pendingPlaceholders = PENDING_STATUSES.map(() => "?").join(",");

// Once a session's end_time has passed, any appointment still sitting in
// 'Booked' or 'Waiting' means nothing was ever done about it — the patient
// was never marked arrived, or was marked arrived but never consulted.
// Auto-mark those as 'Absent' so the session isn't stuck open forever
// waiting on a token nobody ever acted on. This runs BEFORE the
// auto-complete/auto-end checks below so a session can finish in the same
// tick once its last pending token is resolved this way.
const autoMarkAbsentForEndedSessions = async () => {
    await pool.execute(
        `UPDATE appointments a
         LEFT JOIN doctor_availability da
            ON da.availability_id = a.availability_id
         SET a.status = 'Absent',
             a.remark = CASE WHEN a.remark IS NULL OR a.remark = '' THEN 'Auto-marked absent — session ended with no action taken' ELSE a.remark END
         WHERE a.status IN ('Booked', 'Waiting')
           AND (
                a.appointment_date < CURDATE()
                OR (
                    a.appointment_date = CURDATE()
                    AND da.end_time IS NOT NULL
                    AND da.end_time < CURTIME()
                )
           )`
    );
};

const autoStartDueSessions = async () => {
    await pool.execute(
        `UPDATE doctor_availability
         SET session_state = 'Live'
         WHERE session_state = 'Scheduled'
           AND is_leave = 0
           AND available_date = CURDATE()
           AND CURTIME() >= start_time
           AND CURTIME() < end_time`
    );
};

// Auto-complete a Live session once ALL its appointments are in a
// final state — regardless of whether end_time has been reached.
// (Sessions with zero appointments are excluded here so they don't
//  vanish immediately after starting with no patients booked.)
const autoCompleteFinishedSessions = async () => {
    await pool.execute(
        `UPDATE doctor_availability da
         SET da.session_state = 'Completed'
         WHERE da.session_state = 'Live'
           AND EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.availability_id = da.availability_id
           )
           AND NOT EXISTS (
                SELECT 1 FROM appointments a2
                WHERE a2.availability_id = da.availability_id
                  AND a2.status IN (${pendingPlaceholders})
           )`,
        PENDING_STATUSES
    );
};

// Auto-end a Live session once its scheduled end_time has passed AND
// there are no pending/active appointments (including zero-appt
// sessions — those end automatically once the window closes).
const autoEndExpiredSessions = async () => {
    await pool.execute(
        `UPDATE doctor_availability da
         SET da.session_state = 'Completed'
         WHERE da.session_state = 'Live'
           AND available_date = CURDATE()
           AND CURTIME() >= end_time
           AND NOT EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.availability_id = da.availability_id
                  AND a.status IN (${pendingPlaceholders})
           )`,
        PENDING_STATUSES
    );
};

const runSessionAutomation = async () => {
    try {
        await autoMarkAbsentForEndedSessions();
        await autoStartDueSessions();
        await autoCompleteFinishedSessions();
        await autoEndExpiredSessions();
    } catch (error) {
        console.error("Session automation error:", error);
    }
};

const startSessionAutomation = (intervalMs = 30000) => {
    // Run once immediately, then on a repeating timer.
    runSessionAutomation();
    setInterval(runSessionAutomation, intervalMs);
};

module.exports = {
    runSessionAutomation,
    startSessionAutomation
};