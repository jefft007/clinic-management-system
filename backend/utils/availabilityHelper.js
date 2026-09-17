const pool = require("../config/database");

const ensureRegularSlotsExist = async (doctorId, fromDate, toDate) => {
    if (!fromDate || !toDate) return;

    // Fetch regular schedule
    const [regular] = await pool.execute(
        `SELECT day_of_week, session, start_time, end_time, average_consultation_minutes 
         FROM doctor_regular_schedule WHERE doctor_id = ?`,
        [doctorId]
    );

    if (regular.length === 0) return;

    const scheduleMap = {};
    regular.forEach(r => {
        if (!scheduleMap[r.day_of_week]) scheduleMap[r.day_of_week] = [];
        scheduleMap[r.day_of_week].push(r);
    });

    // Fetch existing slots
    const [existing] = await pool.execute(
        `SELECT DATE_FORMAT(available_date, '%Y-%m-%d') as date_str, session 
         FROM doctor_availability 
         WHERE doctor_id = ? AND available_date >= ? AND available_date <= ?`,
        [doctorId, fromDate, toDate]
    );

    const existingSet = new Set(existing.map(e => `${e.date_str}_${e.session}`));

    // Iterate dates
    const startDate = new Date(fromDate + "T00:00:00Z");
    const endDate = new Date(toDate + "T00:00:00Z");

    for (let d = startDate; d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const dayOfWeek = d.getUTCDay(); // 0 is Sunday

        if (scheduleMap[dayOfWeek]) {
            for (const sess of scheduleMap[dayOfWeek]) {
                if (!existingSet.has(`${dateStr}_${sess.session}`)) {
                    await pool.execute(
                        `INSERT INTO doctor_availability 
                         (doctor_id, available_date, session, start_time, end_time, average_consultation_minutes, is_leave, is_override)
                         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
                        [
                            doctorId,
                            dateStr,
                            sess.session,
                            sess.start_time,
                            sess.end_time,
                            sess.average_consultation_minutes
                        ]
                    );
                }
            }
        }
    }
};

// =====================================================
// TOKEN TIMING HELPERS
// =====================================================
// Turns a token number into an approximate clock time window,
// plus a suggested "arrive by" time a few minutes earlier.
// Shared by any controller that needs to show patients/staff
// when a given token is expected to be seen (theatre/bus-ticket
// style token maps, booking confirmations, etc).
const ARRIVE_BUFFER_MINUTES = 10;

const addMinutesToTimeString = (timeStr, minutesToAdd) => {
    const [h, m] = String(timeStr || "00:00").split(":").map(Number);
    const total = Math.round((h || 0) * 60 + (m || 0) + Number(minutesToAdd || 0));
    const wrapped = ((total % 1440) + 1440) % 1440;
    const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
    const mm = String(wrapped % 60).padStart(2, "0");
    return `${hh}:${mm}`;
};

// Calendar weekday from a MySQL DATE / 'YYYY-MM-DD' string, ignoring
// the host timezone so IST vs UTC never picks the wrong week's settings.
const parseDayOfWeek = (availableDate) => {
    if (!availableDate) return null;
    const raw = typeof availableDate === "string"
        ? availableDate
        : (availableDate instanceof Date
            ? availableDate.toISOString()
            : String(availableDate));
    const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
    const key = match ? match[1] : null;
    if (!key) return null;
    return new Date(`${key}T12:00:00.000Z`).getUTCDay();
};

const sessionDurationMinutes = (slot) => {
    if (!slot || !slot.start_time || !slot.end_time) return 0;
    const [h1, m1] = String(slot.start_time).split(":").map(Number);
    const [h2, m2] = String(slot.end_time).split(":").map(Number);
    return (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
};

// Minutes each token occupies inside THIS session. Uses the session
// window divided by the session's token count so 30 evening tokens
// starting at 5:00 fill the evening window evenly, instead of stacking
// the stored consultation average (which overruns past end_time).
const minutesPerToken = (slot, tokenCount) => {
    const duration = sessionDurationMinutes(slot);
    const n = Number(tokenCount) || 0;
    if (duration > 0 && n > 0) return duration / n;
    return Number(slot && slot.average_consultation_minutes) || 15;
};

const isMorningSession = (session) =>
    String(session || "").toLowerCase() === "morning";

// Evening tokens continue the day's numbering (e.g. day total 60 →
// morning 1–30, evening 31–60). Morning's effective count is the offset.
const getDayTokenOffset = async (slot, clinicId, dayOfWeek) => {
    if (!slot || isMorningSession(slot.session)) return 0;

    const dateStr = typeof slot.available_date === "string"
        ? slot.available_date.slice(0, 10)
        : String(slot.available_date || "").slice(0, 10);

    let morningSlot = null;
    if (slot.doctor_id && dateStr) {
        try {
            const [rows] = await pool.execute(
                `SELECT doctor_id, session, start_time, end_time, average_consultation_minutes,
                        total_tokens, is_leave, is_clinic_blocked,
                        onsite_tokens_override, online_tokens_override,
                        extra_onsite_tokens, extra_online_tokens
                 FROM doctor_availability
                 WHERE doctor_id = ? AND available_date = ? AND session = 'Morning'
                 LIMIT 1`,
                [slot.doctor_id, dateStr]
            );
            if (rows.length > 0) morningSlot = rows[0];
        } catch (e) {
            morningSlot = null;
        }
    }

    const { onsiteLimit, totalOverride } = await getOnsiteTokenLimit(
        clinicId, dayOfWeek, "Morning", slot.doctor_id
    );

    let morningTotal = 0;
    if (morningSlot && !morningSlot.is_leave && !morningSlot.is_clinic_blocked) {
        const counts = await getEffectiveSessionCounts(morningSlot, clinicId, dayOfWeek);
        morningTotal = counts.rawTotal
            + (Number(morningSlot.extra_onsite_tokens) || 0)
            + (Number(morningSlot.extra_online_tokens) || 0);
    } else if (totalOverride !== null) {
        morningTotal = totalOverride;
    }

    return Math.max(0, Number(morningTotal) || 0);
};

// Single source of truth for a session's effective total + pool
// split, given all three layers of override (session duration
// default → weekly per-day-of-week total override → per-date
// on-site/online override). getTokenMap uses this for the slot it
// was asked about; getDayTokenOffset (below) uses the SAME function
// for the sibling Morning slot when computing where Evening's
// numbering should continue from — so the two can never disagree
// about how many tokens Morning actually has, which is what used to
// cause Evening/Online tokens to start at the wrong number (e.g.
// jumping from 8 straight to 27 instead of continuing at 9).
const getEffectiveSessionCounts = async (slot, clinicId, dayOfWeek) => {
    let rawTotal = (slot.is_leave || slot.is_clinic_blocked) ? 0 : getEffectiveTotalTokens(slot);

    const { onsiteLimit, totalOverride } = await getOnsiteTokenLimit(
        clinicId, dayOfWeek, slot.session, slot.doctor_id
    );

    // The weekly Booking Settings total is only a DEFAULT for days
    // that haven't been touched. If staff already set an explicit
    // total_tokens for THIS date (e.g. via Manage Slots), that must
    // win — otherwise a stale weekly default silently overwrites a
    // capacity the staff just set for today, which is exactly the
    // "explicit override" getEffectiveTotalTokens is supposed to
    // guarantee never gets ignored.
    const hasExplicitDateTotal = slot.total_tokens !== null && slot.total_tokens !== undefined;

    if (!hasExplicitDateTotal && totalOverride !== null && !slot.is_leave && !slot.is_clinic_blocked) {
        rawTotal = totalOverride;
    }

    let { onsiteCount, onlineCount } = getPoolCounts(rawTotal, onsiteLimit);

    const hasDateOverride =
        !slot.is_leave && !slot.is_clinic_blocked &&
        (slot.onsite_tokens_override !== null || slot.online_tokens_override !== null);

    if (hasDateOverride) {
        if (slot.onsite_tokens_override !== null) onsiteCount = Number(slot.onsite_tokens_override);
        if (slot.online_tokens_override !== null) onlineCount = Number(slot.online_tokens_override);
        rawTotal = onsiteCount + onlineCount;
    }

    return { rawTotal, onsiteCount, onlineCount, onsiteLimit, totalOverride, hasDateOverride };
};

const formatTimeLabel = (timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
};

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
        note: `Approximate — please arrive by ${formatTimeLabel(arriveBy)} (about ${ARRIVE_BUFFER_MINUTES} min early). Actual time can shift if the doctor runs ahead or behind.`
    };
};

const calcTotalTokens = (slot) => {
    const [h1, m1] = slot.start_time.split(":").map(Number);
    const [h2, m2] = slot.end_time.split(":").map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    const avgMin = Number(slot.average_consultation_minutes) || 15;
    return totalMinutes > 0 ? Math.floor(totalMinutes / avgMin) : 0;
};

// =====================================================
// EFFECTIVE TOTAL TOKENS
// =====================================================
// A date/session's real capacity: the manually-overridden
// total_tokens if one has been set, otherwise the calculated
// default (duration / consultation minutes). This is the ONLY
// place capacity should ever be computed — every booking,
// token-map, and remaining-count read must go through this
// (or getTokenMap, which already calls it) so an override
// staff set is never silently ignored or recalculated away.
// =====================================================
const getEffectiveTotalTokens = (slot) => {
    if (slot.total_tokens !== null && slot.total_tokens !== undefined) {
        return Number(slot.total_tokens);
    }
    return calcTotalTokens(slot);
};

// =====================================================
// ON-SITE / ONLINE TOKEN SPLIT
// =====================================================
// Every session's tokens are divided into two pools: on-site
// (walk-in, booked by clinic staff at the counter) and online
// (booked by patients through the app). clinics.onsite_token_limit
// is an absolute COUNT set by the clinic (e.g. "15") — not a
// percentage — and can be changed any time. Whatever's left after
// that count, up to the session's own total, becomes the online
// pool: total=30, onsite_limit=15 → 15 on-site + 15 online.
//
// Both pools are numbered INDEPENDENTLY starting at 1 — on-site
// token 1 and online token 1 both exist in the same session at the
// same time, they are not the same seat. Physically they still map
// to different chronological time slots within the session (on-site
// takes the first block of time, online the remainder) so estimated
// times stay sensible; only the *display number* resets per pool.
//
// Clinic staff can book from EITHER pool (the dashboard's On Site
// and Online Booking cards each open their own token picker scoped
// to that pool) — including using the online pool for a walk-in
// patient once on-site tokens run out. Patients booking through the
// app only ever see/use the online pool. Uses the same 'walk_in' /
// 'online' vocabulary as appointments.booking_source so pool math
// and the booking_source column always agree.

// Looks up the on-site token limit for a specific clinic + day + session.
// Priority: per-day row in doctor_session_token_settings (this specific
// doctor's own weekly repeating template) → per-day row in
// clinic_session_token_settings (clinic-wide fallback, kept for clinics
// that haven't set a per-doctor split yet) → global clinics.onsite_token_limit
// → fallback to 50/50 (null).
const DEFAULT_SESSION_TOTAL = 30;
const DEFAULT_SESSION_ONSITE = 15;

const parseAssignmentList = (raw) => {
    if (!raw) return null;
    try {
        const list = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(list) || list.length === 0) return null;
        return list.map((v) => (v === "online" ? "online" : "onsite"));
    } catch (e) {
        return null;
    }
};

const isDefaultSessionRow = (row) => {
    const total = Number(row.total_tokens) || 0;
    const onsite = Number(row.onsite_tokens) || 0;
    if (total !== DEFAULT_SESSION_TOTAL || onsite !== DEFAULT_SESSION_ONSITE) return false;
    const list = parseAssignmentList(row.token_assignments);
    if (!list) return true;
    if (list.length !== DEFAULT_SESSION_TOTAL) return false;
    return list.every((v, i) => v === (i < DEFAULT_SESSION_ONSITE ? "onsite" : "online"));
};

const normalizeAssignments = (list, expectedTotal) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const n = Number(expectedTotal);
    if (!n || n <= 0) return list;
    if (list.length === n) return list;
    if (list.length > n) return list.slice(0, n);
    return list.concat(Array(n - list.length).fill("online"));
};

// Weekly template for one doctor + weekday + session. If that weekday
// was never customized (still the factory 30/15 split) but another
// weekday was, reuse the customized day so tomorrow doesn't ignore
// the picks staff just saved for "today".
const getDoctorDaySessionSettings = async (doctorId, dayOfWeek, session) => {
    if (doctorId === null || dayOfWeek === null || !session) return null;
    try {
        const [rows] = await pool.execute(
            `SELECT day_of_week, session, total_tokens, onsite_tokens, online_tokens, token_assignments
             FROM doctor_session_token_settings
             WHERE doctor_id = ? AND session = ?`,
            [doctorId, session]
        );
        if (rows.length === 0) return null;

        const exact = rows.find((r) => Number(r.day_of_week) === Number(dayOfWeek));
        const custom = rows.filter((r) => !isDefaultSessionRow(r));

        let chosen = exact;
        if (exact && isDefaultSessionRow(exact) && custom.length > 0) {
            chosen = custom.find((r) => Number(r.day_of_week) === 1) || custom[0];
        } else if (!exact && custom.length > 0) {
            chosen = custom.find((r) => Number(r.day_of_week) === 1) || custom[0];
        } else if (!exact) {
            chosen = rows[0];
        }

        if (!chosen) return null;
        return {
            ...chosen,
            token_assignments: parseAssignmentList(chosen.token_assignments)
        };
    } catch (e) {
        return null;
    }
};

const getOnsiteTokenLimit = async (clinicId, dayOfWeek = null, session = null, doctorId = null) => {
    // Try the per-doctor per-day per-session table first
    if (doctorId !== null && dayOfWeek !== null && session !== null) {
        try {
            const row = await getDoctorDaySessionSettings(doctorId, dayOfWeek, session);
            if (row && row.onsite_tokens !== null && row.onsite_tokens !== undefined) {
                return { onsiteLimit: Number(row.onsite_tokens), totalOverride: Number(row.total_tokens) };
            }
        } catch (e) {
            // table may not exist yet if migration hasn't run, fall through
        }
    }
    // Next: the clinic-wide per-day per-session table
    if (dayOfWeek !== null && session !== null) {
        try {
            const [rows] = await pool.execute(
                `SELECT onsite_tokens, total_tokens FROM clinic_session_token_settings
                 WHERE clinic_id = ? AND day_of_week = ? AND session = ?
                 LIMIT 1`,
                [clinicId, dayOfWeek, session]
            );
            if (rows.length > 0 && rows[0].onsite_tokens !== null) {
                return { onsiteLimit: Number(rows[0].onsite_tokens), totalOverride: Number(rows[0].total_tokens) };
            }
        } catch (e) {
            // table may not exist yet on first boot, fall through
        }
    }
    // Fallback: global clinic-level limit
    const [rows] = await pool.execute(
        `SELECT onsite_token_limit FROM clinics WHERE clinic_id = ? LIMIT 1`,
        [clinicId]
    );
    const limit = rows[0] ? rows[0].onsite_token_limit : null;
    return { onsiteLimit: (limit === null || limit === undefined) ? null : Number(limit), totalOverride: null };
};

// Looks up specific token-NUMBER picks for a doctor's weekly
// template (see migration v5 / token_assignments column). Returns
// null when nothing has been saved for this exact doctor+day+session
// (or when the saved list's length no longer matches the session's
// current total token count — in that case we fall back to the
// simple count-based split rather than risk an out-of-range pick).
const getTokenAssignments = async (doctorId, dayOfWeek, session, expectedTotal) => {
    if (doctorId === null || dayOfWeek === null || !session) return null;
    try {
        const row = await getDoctorDaySessionSettings(doctorId, dayOfWeek, session);
        if (!row || !row.token_assignments) return null;
        return normalizeAssignments(row.token_assignments, expectedTotal);
    } catch (e) {
        return null;
    }
};

// Splits a session's total tokens into on-site/online COUNTS given
// the clinic's configured onsite limit (or null for "not set").
// When not set, defaults to an even 50/50 split (rounded up for
// on-site) so a fresh clinic still gets a sensible split with zero
// configuration.
// Ordered list of every "add extra tokens" action for a date/session
// (see migration_v8's extra_token_log). Falls back to treating the
// row's extra_onsite_tokens/extra_online_tokens counts as ONE legacy
// on-site-then-online batch when no log is present yet (rows written
// before migration_v8, or before this row's first add since) — this
// matches exactly what staff were already shown, so nothing already
// on the grid renumbers itself just from reading it again.
const getExtraTokenBatches = (slot, extraOnsite, extraOnline) => {
    let log = slot && slot.extra_token_log;
    if (log) {
        try {
            const parsed = typeof log === 'string' ? JSON.parse(log) : log;
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
            // fall through to legacy synthesis below
        }
    }
    const legacy = [];
    if (extraOnsite > 0) legacy.push({ pool: 'walk_in', count: extraOnsite });
    if (extraOnline > 0) legacy.push({ pool: 'online', count: extraOnline });
    return legacy;
};

const getPoolCounts = (totalTokens, onsiteLimit) => {
    if (!totalTokens || totalTokens <= 0) return { onsiteCount: 0, onlineCount: 0 };
    const rawLimit = (onsiteLimit === null || onsiteLimit === undefined)
        ? Math.ceil(totalTokens / 2)
        : onsiteLimit;
    const onsiteCount = Math.min(Math.max(rawLimit, 0), totalTokens);
    const onlineCount = totalTokens - onsiteCount;
    return { onsiteCount, onlineCount };
};

// =====================================================
// GET TOKEN MAP
// =====================================================
// Given an availability_id, returns EVERY token in that
// session — now as two independently-numbered pools — with each
// token's status (Available / Booked / Reserved (shown to clinic
// staff as "Blocked") / Waiting / In Progress / Completed / Skipped
// / Absent) and its estimated time window + arrive-by time. This is
// the single source of truth for any "theatre seat map" / "bus
// ticket" style token picker in the UI.
//
// clinicId is required to compute the on-site/online split;
// bookingSourceFilter ('walk_in' | 'online' | null) optionally
// restricts the returned tokens to just that pool — pass 'online'
// for anything patient-facing so an online caller can never even
// see on-site tokens.
const getTokenMap = async (availabilityId, clinicId, bookingSourceFilter = null) => {
    const [availRows] = await pool.execute(
        `SELECT
            availability_id,
            doctor_id,
            available_date,
            session,
            start_time,
            end_time,
            average_consultation_minutes,
            total_tokens,
            is_leave,
            is_clinic_blocked,
            onsite_tokens_override,
            online_tokens_override,
            extra_onsite_tokens,
            extra_online_tokens,
            extra_token_log
         FROM doctor_availability
         WHERE availability_id = ?
         LIMIT 1`,
        [availabilityId]
    );

    if (availRows.length === 0) return null;

    const slot = availRows[0];
    const dayOfWeek = parseDayOfWeek(slot.available_date);

    const counts = await getEffectiveSessionCounts(slot, clinicId, dayOfWeek);
    let rawTotal = counts.rawTotal;
    let onsiteCount = counts.onsiteCount;
    let onlineCount = counts.onlineCount;
    const onsiteLimit = counts.onsiteLimit;

    // "Extra tokens" appended by clinic staff from the Token Booking
    // screen itself (see addExtraTokens in clinicController.js). These
    // always sit AFTER the base day-continuous range computed above —
    // never inserted into it — so no existing token (booked or not,
    // on-site or online) ever changes number when extras are added.
    const extraOnsite = Number(slot.extra_onsite_tokens) || 0;
    const extraOnline = Number(slot.extra_online_tokens) || 0;
    const hasExtraTokens = extraOnsite > 0 || extraOnline > 0;

    // NOTE: this must NOT also fold in hasExtraTokens. Adding extra
    // tokens is an additive action on top of whatever's already
    // there — it says nothing about whether TODAY's base tokens
    // should ignore the doctor's saved weekly on-site/online
    // template. Treating "has extras" as "has a date override" used
    // to silently throw away that template for the whole session
    // the moment a single extra token was added — e.g. a custom
    // alternating on-site/online pattern for tokens 1-20 would
    // collapse into a plain "first half on-site, second half online"
    // block for every token already on the grid, not just the new
    // one. Only a REAL per-date override (onsite_tokens_override /
    // online_tokens_override, i.e. counts.hasDateOverride) is a
    // deliberate "ignore the weekly template for today" action.
    const hasDateOverride = counts.hasDateOverride;

    // Specific token-NUMBER picks from the doctor's weekly template
    // (Booking Settings > pick which exact numbers are On-Site vs
    // Online). Only applies when there's no per-date override for
    // this session — a date override is a deliberate "ignore the
    // weekly template for today" action, so it keeps using the
    // simple front-loaded split instead.
    const assignments = hasDateOverride
        ? null
        : await getTokenAssignments(slot.doctor_id, dayOfWeek, slot.session, rawTotal);

    // Existing bookings are still stored/looked-up by (token_number,
    // booking_source) — never by token_number alone, since it's no
    // longer unique on its own (both pools start at 1).
    const [apptRows] = await pool.execute(
        `SELECT
            a.appointment_id,
            a.token_number,
            a.booking_source,
            a.status,
            a.booking_group_id,
            a.procedure_note,
            p.full_name AS patient_name,
            p.phone AS patient_phone,
            p.age AS patient_age
         FROM appointments a
         LEFT JOIN patients p
            ON p.patient_id = a.patient_id
         WHERE a.availability_id = ?
           AND a.status <> 'Cancelled'`,
        [availabilityId]
    );

    const byToken = {}; // key: `${booking_source}:${token_number}`
    apptRows.forEach(row => {
        const src = row.booking_source || 'walk_in';
        byToken[`${src}:${Number(row.token_number)}`] = row;
    });

    // Day-continuous numbers match Booking Settings (morning 1–N,
    // evening N+1…dayTotal). Times are always session-local so the
    // first evening token starts at that session's start_time (e.g. 5:00).
    const dayOffset = await getDayTokenOffset(slot, clinicId, dayOfWeek);
    const avgMin = minutesPerToken(slot, rawTotal);

    const makeToken = (poolName, dayNumber, physicalIndex, poolRelative) => {
        // IMPORTANT: match strictly by the canonical day-continuous number
        // the appointment was actually booked under. A previous version of
        // this also fell back to matching by pool-relative position
        // (`byToken[poolName:poolRelative]`) when the direct lookup missed.
        // That fallback used a DIFFERENT numbering scheme (position within
        // the pool, not the day's running number), so whenever the day's
        // offset shifted — e.g. staff edited the Morning session's token
        // count after some Evening tokens were already booked — it could
        // match a completely unrelated appointment onto this tile. That
        // wrong occupant's status, patient, and booking_group_id (procedure
        // link) would then render on a token nobody selected, and the same
        // real booking could appear on two tiles at once. Matching by
        // dayNumber only avoids that; if the offset genuinely shifted, the
        // affected appointment should be re-pointed to its correct
        // token_number rather than papered over with a guess here.
        const occupant = byToken[`${poolName}:${dayNumber}`] || null;
        console.log(`[makeToken DEBUG] poolName=${poolName}, dayNumber=${dayNumber}, poolRelative=${poolRelative}, occupantFound=${!!occupant}`);
        const timing = getTokenTiming(slot.start_time, avgMin, physicalIndex);
        return {
            token_number: dayNumber,
            booking_source: poolName,
            is_available: !occupant,
            status: occupant ? occupant.status : "Available",
            appointment_id: occupant ? occupant.appointment_id : null,
            patient_name: occupant ? (occupant.patient_name || (occupant.status === 'Reserved' ? 'Blocked' : null)) : null,
            patient_phone: occupant ? occupant.patient_phone : null,
            // Senior-citizen flag (age > 80) so the token grid can highlight
            // these tiles in a distinct shade once booked. Only meaningful
            // for occupied tokens — a free/blocked (no patient) token has
            // no age to check.
            patient_age: occupant ? (occupant.patient_age != null ? Number(occupant.patient_age) : null) : null,
            is_senior_citizen: !!(occupant && occupant.patient_age != null && Number(occupant.patient_age) > 80),
            // Multi-token ("procedure") bookings: every token booked
            // together for one patient shares this UUID so the grid can
            // highlight them as one linked group, in their own color,
            // distinct from ordinary single-token bookings.
            booking_group_id: occupant ? (occupant.booking_group_id || null) : null,
            procedure_note: occupant ? (occupant.procedure_note || null) : null,
            ...timing
        };
    };

    let onsiteTokens, onlineTokens;

    if (assignments) {
        // Exact picks from Manage Slots > Booking Settings: token
        // number on the tile IS the number staff tapped (plus the
        // evening offset so 31…60 land in the 5:00 session).
        onsiteTokens = [];
        onlineTokens = [];
        let onsiteN = 0, onlineN = 0;
        assignments.forEach((poolName, idx) => {
            const physicalIndex = idx + 1;
            const dayNumber = dayOffset + physicalIndex;
            if (poolName === 'onsite') {
                onsiteN += 1;
                onsiteTokens.push(makeToken('walk_in', dayNumber, physicalIndex, onsiteN));
            } else {
                onlineN += 1;
                onlineTokens.push(makeToken('online', dayNumber, physicalIndex, onlineN));
            }
        });
        onsiteCount = onsiteN;
        onlineCount = onlineN;
    } else {
        // Count-based: first onsiteCount positions On-Site, the rest
        // Online — still numbered with the day's running token numbers.
        onsiteTokens = [];
        onlineTokens = [];
        for (let n = 1; n <= rawTotal; n++) {
            const isOnsite = n <= onsiteCount;
            const poolName = isOnsite ? 'walk_in' : 'online';
            const poolRelative = isOnsite ? n : (n - onsiteCount);
            const token = makeToken(poolName, dayOffset + n, n, poolRelative);
            if (isOnsite) onsiteTokens.push(token);
            else onlineTokens.push(token);
        }
    }

    // Extra tokens (see migration_v7 / migration_v8): appended
    // strictly AFTER every token generated above, and replayed IN
    // THE ORDER THEY WERE ADDED (extra_token_log) — never as "every
    // on-site extra first, then every online extra" — so a batch
    // keeps the day-numbers it was given no matter what gets added
    // to either pool afterward. See migration_v8 for the bug this
    // avoids: numbering on-site-before-online unconditionally would
    // silently renumber an already-added online extra the next time
    // an on-site extra came in.
    if (hasExtraTokens) {
        const batches = getExtraTokenBatches(slot, extraOnsite, extraOnline);
        let physicalIndex = rawTotal;
        let onsiteSeen = 0;
        let onlineSeen = 0;
        batches.forEach((batch) => {
            const batchPool = batch.pool === 'online' ? 'online' : 'walk_in';
            const batchCount = Math.max(0, Number(batch.count) || 0);
            for (let i = 0; i < batchCount; i++) {
                physicalIndex += 1;
                if (batchPool === 'walk_in') {
                    onsiteSeen += 1;
                    onsiteTokens.push(makeToken('walk_in', dayOffset + physicalIndex, physicalIndex, onsiteCount + onsiteSeen));
                } else {
                    onlineSeen += 1;
                    onlineTokens.push(makeToken('online', dayOffset + physicalIndex, physicalIndex, onlineCount + onlineSeen));
                }
            }
        });
        onsiteCount += extraOnsite;
        onlineCount += extraOnline;
        rawTotal += extraOnsite + extraOnline;
    }

    const walkInBooked = onsiteTokens.filter(t => !t.is_available).length;
    const onlineBooked = onlineTokens.filter(t => !t.is_available).length;
    const bookedCount = walkInBooked + onlineBooked;

    let tokens;
    if (bookingSourceFilter === 'walk_in') tokens = onsiteTokens;
    else if (bookingSourceFilter === 'online') tokens = onlineTokens;
    else tokens = [...onsiteTokens, ...onlineTokens];

    tokens.sort((a, b) => Number(a.token_number) - Number(b.token_number));

    return {
        availability: slot,
        total_tokens: rawTotal,
        booked_tokens: bookedCount,
        remaining_tokens: rawTotal - bookedCount,
        onsite_token_limit: onsiteLimit,
        walk_in: { total: onsiteCount, booked: walkInBooked, remaining: onsiteCount - walkInBooked },
        online: { total: onlineCount, booked: onlineBooked, remaining: onlineCount - onlineBooked },
        has_date_override: hasDateOverride,
        onsite_tokens_override: slot.onsite_tokens_override,
        online_tokens_override: slot.online_tokens_override,
        tokens
    };
};

// =====================================================
// BOOKING HORIZON (how far into the future booking is visible)
// =====================================================
// Each clinic can configure clinics.booking_end_date (Clinic Portal
// > Manage Slots > Booking Settings). When unset, the system falls
// back to exactly 2 months from today, same default communicated in
// that settings screen. This is the single source of truth used by
// every availability/booking endpoint — patient app, clinic staff
// booking, and slot-blocking — so nobody (patient or staff) can see
// or act on dates past what the clinic configured, regardless of
// which client/API call is used to get there.

const getBookingHorizon = async (clinicId) => {
    const [rows] = await pool.execute(
        `SELECT booking_end_date FROM clinics WHERE clinic_id = ? LIMIT 1`,
        [clinicId]
    );

    const configured = rows[0]?.booking_end_date;

    if (configured) {
        return typeof configured === "string"
            ? configured.slice(0, 10)
            : new Date(configured).toISOString().slice(0, 10);
    }

    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 2);
    return fallback.toISOString().slice(0, 10);
};

module.exports = {
    ensureRegularSlotsExist,
    ARRIVE_BUFFER_MINUTES,
    getTokenTiming,
    calcTotalTokens,
    getEffectiveTotalTokens,
    getTokenMap,
    getBookingHorizon,
    getOnsiteTokenLimit,
    getTokenAssignments,
    getPoolCounts,
    parseDayOfWeek,
    minutesPerToken
};