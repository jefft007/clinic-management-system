import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';

/* ─── helpers ─────────────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const calcTokens = (startTime, endTime, duration) => {
  if (!startTime || !endTime || !duration || duration <= 0) return 0;
  const [h1, m1] = startTime.split(':').map(Number);
  const [h2, m2] = endTime.split(':').map(Number);
  const total = (h2 * 60 + m2) - (h1 * 60 + m1);
  return total <= 0 ? 0 : Math.floor(total / duration);
};

/* The clinic now enters how many tokens a session should have
   directly — average_consultation_minutes (still what the rest of
   the system stores/uses) is derived from that: how many minutes
   per patient does start→end split into for that token count. */
const minutesRange = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const [h1, m1] = startTime.split(':').map(Number);
  const [h2, m2] = endTime.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
};
const avgFromTokens = (startTime, endTime, totalTokens) => {
  const range = minutesRange(startTime, endTime);
  if (!totalTokens || totalTokens <= 0 || range <= 0) return 15;
  return Math.max(1, Math.floor(range / totalTokens));
};

const ARRIVE_BUFFER_MINUTES = 10;

const SESSION_DEFAULTS = {
  Morning: { start_time: '09:00', end_time: '13:00', total_tokens: 16, is_leave: false },
  Evening: { start_time: '17:00', end_time: '21:00', total_tokens: 16, is_leave: false },
};

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

/* ─── Toast notification ──────────────────────────────── */
const Toast = ({ msg, onDone }) => {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [msg, onDone]);

  if (!msg) return null;
  const isSuccess = msg.type === 'success';
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
      background: isSuccess ? '#052e16' : '#450a0a',
      color: isSuccess ? '#4ade80' : '#f87171',
      border: `1px solid ${isSuccess ? '#166534' : '#991b1b'}`,
      borderRadius: 12, padding: '0.85rem 1.25rem',
      fontWeight: 600, fontSize: '0.875rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      animation: 'fadeInUp 0.3s ease',
      maxWidth: 380,
    }}>
      <span>{isSuccess ? '✅' : '⚠️'}</span>
      <span>{msg.text}</span>
    </div>
  );
};

/* ─── Inline message ──────────────────────────────────── */
const InlineMsg = ({ msg }) => {
  if (!msg) return null;
  const isSuccess = msg.type === 'success';
  return (
    <div style={{
      padding: '0.65rem 1rem', borderRadius: 8, marginBottom: '1rem',
      background: isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      color: isSuccess ? '#6ee7b7' : '#fca5a5',
      border: `1px solid ${isSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
      fontSize: '0.85rem', fontWeight: 600,
    }}>
      {isSuccess ? '✅ ' : '⚠️ '}{msg.text}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   TAB 1: REGULAR SCHEDULE
   ════════════════════════════════════════════════════════ */
const RegularScheduleTab = ({ doctors }) => {
  const [doctorId, setDoctorId]   = useState(doctors[0]?.doctor_id || '');
  const [schedule, setSchedule]   = useState({});   // { "1_Morning": { start, end, dur }, ... }
  const [loading,  setLoading]    = useState(false);
  const [saving,   setSaving]     = useState(false);
  const [msg,      setMsg]        = useState(null);
  const toastTimer = useRef(null);

  /* Load schedule when doctor changes */
  useEffect(() => {
    if (!doctorId) return;
    setLoading(true);
    setSchedule({});
    api.get(`/clinic/doctors/${doctorId}/regular-schedule`)
      .then(res => {
        if (res.data.success) {
          const map = {};
          (res.data.schedule || []).forEach(s => {
            const start = s.start_time?.slice(0, 5) || '';
            const end   = s.end_time?.slice(0, 5)   || '';
            map[`${s.day_of_week}_${s.session}`] = {
              start_time: start,
              end_time:   end,
            };
          });
          setSchedule(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [doctorId]);

  const toggleCell = (day, session) => {
    const key = `${day}_${session}`;
    setSchedule(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        const { start_time, end_time } = SESSION_DEFAULTS[session];
        next[key] = { start_time, end_time };
      }
      return next;
    });
  };

  const updateCell = (day, session, field, value) => {
    const key = `${day}_${session}`;
    setSchedule(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!doctorId) return;
    setSaving(true);
    setMsg(null);
    const slots = Object.entries(schedule).map(([key, val]) => {
      const [dow, sess] = key.split('_');
      return {
        day_of_week: Number(dow),
        session: sess,
        start_time: val.start_time,
        end_time:   val.end_time,
        // Token capacity is no longer set here — it's fully controlled
        // by Booking Settings (weekly split) or a Date Override. This
        // default consultation length is only a fallback for the rare
        // case neither has been configured for a day/session yet.
        average_consultation_minutes: 15,
      };
    }).filter(s => s.start_time && s.end_time);

    try {
      await api.put(`/clinic/doctors/${doctorId}/regular-schedule`, { schedule: slots });
      setMsg({ type: 'success', text: 'Regular schedule saved! Future unedited slots will regenerate automatically.' });
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to save schedule.' });
    } finally {
      setSaving(false);
    }
  };

  const selectedDoctor = doctors.find(d => String(d.doctor_id) === String(doctorId));

  return (
    <div>
      {/* Doctor selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
          <label className="form-label" htmlFor="rs-doctor" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Select Doctor</label>
          <select
            id="rs-doctor"
            className="form-control"
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
          >
            <option value="">-- Select Doctor --</option>
            {doctors.map(d => (
              <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
            ))}
          </select>
        </div>
        {selectedDoctor && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1.15rem' }}>
            {selectedDoctor.specialization && `🩺 ${selectedDoctor.specialization}`}
          </div>
        )}
      </div>

      <InlineMsg msg={msg} />

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 100 }}>
          <div className="spinner" /><span>Loading schedule…</span>
        </div>
      ) : (
        <>
          {/* Info callout — dark-native teal glow */}
          <div style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: 8,
            padding: '0.2rem 0.6rem', marginBottom: '0.3rem',
            fontSize: '0.72rem', color: '#67e8f9',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <span>💡</span>
            <span>
              This is the <strong>weekly repeating template</strong>. Check a day + session cell to enable it,
              and set its start/end time.{' '}
              Token capacity is set separately in <strong>Booking Settings</strong>. Existing{' '}
              <strong>manually edited</strong> slots are never overwritten.
            </span>
          </div>

          {/* Grid */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 2px' }}>
              <thead>
                <tr>
                  <th style={{ width: 50, textAlign: 'left', padding: '0 0 0.25rem 0' }}>
                    <span style={{
                      display: 'inline-block', fontWeight: 700, fontSize: '0.75rem',
                      color: '#94a3b8', background: 'rgba(255,255,255,0.06)',
                      padding: '0.15rem 0.45rem', borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      DAY
                    </span>
                  </th>
                  {['Morning', 'Evening'].map((sess) => (
                    <th key={sess} style={{ textAlign: 'left', padding: '0 0 0.25rem 0.4rem' }}>
                      <span style={{
                        display: 'inline-block', fontWeight: 700, fontSize: '0.75rem',
                        color: sess === 'Morning' ? '#6ee7b7' : '#a5b4fc',
                        background: sess === 'Morning' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                        border: `1px solid ${sess === 'Morning' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        padding: '0.15rem 0.5rem', borderRadius: '4px',
                      }}>
                        {sess === 'Morning' ? '🌅' : '🌆'} {sess.toUpperCase()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map(({ value: dow, label }) => (
                  <tr key={dow}>
                    <td style={{ verticalAlign: 'middle', paddingBottom: '0.08rem' }}>
                      <span style={{
                        display: 'inline-block', fontWeight: 700, fontSize: '0.78rem',
                        color: '#e2e8f0', background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '0.15rem 0.45rem', borderRadius: '5px',
                        letterSpacing: '0.03em',
                      }}>
                        {label}
                      </span>
                    </td>
                    {['Morning', 'Evening'].map(sess => {
                      const key  = `${dow}_${sess}`;
                      const cell = schedule[key];
                      // Dark-native colors: green glow for morning, indigo glow for evening
                      const activeBg     = sess === 'Morning' ? 'rgba(16,185,129,0.1)'  : 'rgba(99,102,241,0.1)';
                      const activeBorder = sess === 'Morning' ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.35)';
                      const activeText   = sess === 'Morning' ? '#6ee7b7'               : '#a5b4fc';
                      return (
                        <td key={sess} style={{ paddingLeft: '0.4rem', paddingBottom: '0.08rem', verticalAlign: 'middle' }}>
                          <div style={{
                            background: cell ? activeBg : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${cell ? activeBorder : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 6,
                            padding: '0.1rem 0.4rem',
                            transition: 'all 0.2s ease',
                            minWidth: 230,
                          }}>
                            {/* Checkbox + label + time fields all on one row, labels inline (not stacked) to keep rows compact */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', flexShrink: 0 }}>
                                <input
                                  type="checkbox"
                                  id={`rs-cell-${dow}-${sess}`}
                                  checked={!!cell}
                                  onChange={() => toggleCell(dow, sess)}
                                  style={{ width: 13, height: 13, cursor: 'pointer', accentColor: sess === 'Morning' ? '#10b981' : '#6366f1' }}
                                />
                                <span style={{ fontWeight: 700, fontSize: '0.75rem', color: cell ? activeText : '#64748b', whiteSpace: 'nowrap' }}>
                                  {cell ? '● Active' : '○ Off'}
                                </span>
                              </label>
                              {cell && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1 }}>
                                    <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>Start</span>
                                    <input
                                      type="time"
                                      className="form-control"
                                      style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.08rem 0.2rem', minHeight: 'auto', border: '1px solid rgba(255,255,255,0.16)', width: '100%', background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', borderRadius: 4 }}
                                      value={cell.start_time}
                                      onChange={e => updateCell(dow, sess, 'start_time', e.target.value)}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1 }}>
                                    <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>End</span>
                                    <input
                                      type="time"
                                      className="form-control"
                                      style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.08rem 0.2rem', minHeight: 'auto', border: '1px solid rgba(255,255,255,0.16)', width: '100%', background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', borderRadius: 4 }}
                                      value={cell.end_time}
                                      onChange={e => updateCell(dow, sess, 'end_time', e.target.value)}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.6rem' }}>
            <button
              id="rs-save-btn"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !doctorId}
              style={{ borderRadius: 7, padding: '0.35rem 1.2rem', fontSize: '0.82rem' }}
            >
              {saving ? '💾 Saving…' : '💾 Save Regular Schedule'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setSchedule({})}
              disabled={saving}
              style={{ borderRadius: 7, padding: '0.45rem 1.3rem', fontSize: '0.82rem' }}
            >
              Clear All
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   TAB 2: DATE OVERRIDE
   ════════════════════════════════════════════════════════ */
const DateOverrideTab = ({ doctors, onSaved }) => {
  const [doctorId,       setDoctorId]       = useState(doctors[0]?.doctor_id || '');
  const [date,           setDate]           = useState('');
  const [activeSessions, setActiveSessions] = useState({ Morning: false, Evening: false });
  const [sessions,       setSessions]       = useState([]);
  const [saving,         setSaving]         = useState(false);
  const [msg,            setMsg]            = useState(null);
  // What's already saved for this doctor+date, so we don't blindly
  // re-apply leave on something that's already on leave, and so
  // staff can see current state before touching anything.
  const [currentStatus,  setCurrentStatus]  = useState({ Morning: null, Evening: null });
  const [statusLoading,  setStatusLoading]  = useState(false);
  // Sessions that came back needing an explicit "yes, mark leave even
  // though appointments already exist" confirmation.
  const [pendingConfirm, setPendingConfirm] = useState(null); // { session, availabilityId, activeAppointments }[]

  // The doctor's saved weekly split (Booking Settings), keyed the same
  // way as BookingSettingsTab: "${day_of_week}_${session}". This is the
  // real source of truth for how many tokens a session should have when
  // nothing has been overridden for this exact date yet — the old code
  // fell back to a hardcoded 16 here instead of reading this.
  const [weeklySplit, setWeeklySplit] = useState({});

  useEffect(() => {
    if (!doctorId) {
      setWeeklySplit({});
      return;
    }
    api.get(`/clinic/doctors/${doctorId}/session-token-settings`)
      .then(res => {
        const map = {};
        (res.data?.settings || []).forEach(row => {
          map[`${row.day_of_week}_${row.session}`] = {
            total_tokens: row.total_tokens || 0,
            onsite_tokens: row.onsite_tokens || 0,
            online_tokens: row.online_tokens || 0,
          };
        });
        setWeeklySplit(map);
      })
      .catch(() => setWeeklySplit({}));
  }, [doctorId]);

  /* Look up what's already saved for this doctor+date whenever
     either changes, so pills/cards can show real current state. */
  useEffect(() => {
    if (!doctorId || !date) {
      setCurrentStatus({ Morning: null, Evening: null });
      return;
    }
    setStatusLoading(true);
    api.get(`/clinic/doctors/${doctorId}/availability`, { params: { from_date: date, to_date: date } })
      .then(res => {
        if (res.data.success) {
          const map = { Morning: null, Evening: null };
          (res.data.availability || []).forEach(row => {
            if (row.session === 'Morning' || row.session === 'Evening') {
              map[row.session] = row;
            }
          });
          setCurrentStatus(map);
        }
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, [doctorId, date]);

  const sessionFromStatus = (name, isLeave) => {
    const existing = currentStatus[name];
    // Sunday=0 ... Saturday=6, matching how Booking Settings keys its days.
    const dow = date ? new Date(date + 'T00:00:00').getDay() : null;
    const weekly = dow !== null ? weeklySplit[`${dow}_${name}`] : null;
    const usedExisting = existing?.total_tokens != null;
    const usedWeekly = !usedExisting && weekly?.total_tokens != null;
    return {
      session: name,
      start_time: existing?.start_time?.slice(0, 5) || SESSION_DEFAULTS[name].start_time,
      end_time:   existing?.end_time?.slice(0, 5)   || SESSION_DEFAULTS[name].end_time,
      // Prefer: 1) an override already saved for this exact date,
      // 2) the doctor's weekly split total for this day/session,
      // 3) the generic 16 fallback if nothing is configured anywhere.
      total_tokens: existing?.total_tokens || weekly?.total_tokens || SESSION_DEFAULTS[name].total_tokens,
      // Per-date on-site/online overrides — '' means "no override, use
      // the doctor's weekly split for this day/session". Only set when
      // something was already saved for this exact date.
      onsite_tokens: existing?.onsite_tokens_override ?? '',
      online_tokens: existing?.online_tokens_override ?? '',
      is_leave: isLeave,
      // Internal only (stripped before saving): true when total_tokens
      // above is still an auto-computed default rather than something
      // the user typed in themselves. Lets us re-sync this card if the
      // weekly split (or the saved-for-this-date status) finishes
      // loading AFTER the user already opened the session — instead of
      // permanently freezing on whatever was available at click-time.
      _tokensAuto: !usedExisting,
      _tokensFromWeekly: usedWeekly,
    };
  };

  // Re-sync any open session's Total Tokens once weeklySplit/currentStatus
  // finish loading — sessionFromStatus() only ran once, at click-time, so
  // without this a session opened before those fetches resolved would be
  // stuck showing the generic 16 fallback forever, even after the real
  // weekly-split total (or saved-for-this-date total) becomes available.
  // Never touches a session once the user has actually typed a value in.
  useEffect(() => {
    const dow = date ? new Date(date + 'T00:00:00').getDay() : null;
    setSessions(prev => prev.map(s => {
      if (!s._tokensAuto || s.is_leave) return s;
      const existing = currentStatus[s.session];
      const weekly = dow !== null ? weeklySplit[`${dow}_${s.session}`] : null;
      const nextTotal = existing?.total_tokens || weekly?.total_tokens || SESSION_DEFAULTS[s.session].total_tokens;
      if (nextTotal === s.total_tokens) return s;
      return { ...s, total_tokens: nextTotal, _tokensFromWeekly: !existing?.total_tokens && weekly?.total_tokens != null };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklySplit, currentStatus, date]);

  const toggleSession = (name) => {
    setActiveSessions(prev => {
      const willBeActive = !prev[name];
      const next = { ...prev, [name]: willBeActive };
      if (willBeActive) {
        setSessions(s => [...s.filter(x => x.session !== name), sessionFromStatus(name, false)]);
      } else {
        setSessions(s => s.filter(x => x.session !== name));
      }
      return next;
    });
  };

  const removeSession = (name) => {
    setActiveSessions(prev => ({ ...prev, [name]: false }));
    setSessions(prev => prev.filter(s => s.session !== name));
  };

  const updateSession = (name, field, value) => {
    setSessions(prev => prev.map(s => {
      if (s.session !== name) return s;
      const next = { ...s, [field]: value };
      // Once the user edits total_tokens by hand, stop auto-syncing it —
      // their typed value always wins from here on.
      if (field === 'total_tokens') next._tokensAuto = false;
      return next;
    }));
  };

  /* One click: pull in both Morning and Evening (using whatever's
     already saved for them, if anything) and mark both as leave —
     no need to toggle each session pill separately first. */
  const markFullDayLeave = () => {
    if (!doctorId || !date) {
      setMsg({ type: 'error', text: 'Please select a doctor and date first.' });
      return;
    }
    setActiveSessions({ Morning: true, Evening: true });
    setSessions([
      sessionFromStatus('Morning', true),
      sessionFromStatus('Evening', true),
    ]);
    setMsg(null);
  };

  const handleApply = async () => {
    if (!doctorId || !date) {
      setMsg({ type: 'error', text: 'Please select a doctor and date.' });
      return;
    }
    const active = sessions.filter(s => s.session && s.start_time && s.end_time);
    if (active.length === 0) {
      setMsg({ type: 'error', text: 'Add at least one session.' });
      return;
    }
    for (const s of active) {
      if (minutesRange(s.start_time, s.end_time) <= 0) {
        setMsg({ type: 'error', text: `"${s.session}": end time must be after start time.` });
        return;
      }
      if (!s.is_leave && (!s.total_tokens || Number(s.total_tokens) <= 0)) {
        setMsg({ type: 'error', text: `"${s.session}": enter the number of tokens.` });
        return;
      }
    }

    setSaving(true);
    setMsg(null);
    setPendingConfirm(null);
    try {
      // Step 1: upsert the date/time/token override for every session.
      // (This always resets is_leave back to 0 on the row — see
      // setAvailability on the backend — so a session that used to be
      // on leave and is no longer checked here is automatically
      // un-marked, no extra call needed.)
      const res = await api.post('/clinic/availability', {
        doctor_id: Number(doctorId),
        available_date: date,
        sessions: active.map(s => ({
          session: s.session,
          start_time: s.start_time,
          end_time: s.end_time,
          consultation_duration: avgFromTokens(s.start_time, s.end_time, Number(s.total_tokens) || 15),
          total_tokens: s.is_leave ? undefined : Number(s.total_tokens),
          onsite_tokens: (s.is_leave || s.onsite_tokens === '') ? undefined : Number(s.onsite_tokens),
          online_tokens: (s.is_leave || s.online_tokens === '') ? undefined : Number(s.online_tokens),
        })),
      });

      const availabilityIds = res.data.availability_ids || [];

      // Step 2: for any session marked "Leave", flip it on now that
      // the row definitely exists. Skip ones already on leave — both
      // as a quick client-side shortcut and because the backend now
      // treats re-marking an already-leave slot as a no-op too, so
      // this never re-triggers the appointments-exist confirmation
      // for something that's already applied.
      const leaveSessions = active
        .map((s, i) => ({ ...s, availabilityId: availabilityIds[i] }))
        .filter(s => s.is_leave && s.availabilityId && !currentStatus[s.session]?.is_leave);

      const needsConfirm = [];
      for (const s of leaveSessions) {
        try {
          await api.patch(`/clinic/availability/${s.availabilityId}/leave`, { force: false });
        } catch (err) {
          if (err?.response?.status === 409) {
            needsConfirm.push({
              session: s.session,
              availabilityId: s.availabilityId,
              message: err.response.data?.message,
              activeAppointments: err.response.data?.existing_appointments || [],
            });
          } else {
            throw err;
          }
        }
      }

      // Refresh current-status so pills/cards reflect what's really
      // saved now, whether or not we clear the form below.
      const statusRes = await api.get(`/clinic/doctors/${doctorId}/availability`, { params: { from_date: date, to_date: date } });
      if (statusRes.data.success) {
        const map = { Morning: null, Evening: null };
        (statusRes.data.availability || []).forEach(row => {
          if (row.session === 'Morning' || row.session === 'Evening') map[row.session] = row;
        });
        setCurrentStatus(map);
      }

      if (needsConfirm.length > 0) {
        setPendingConfirm(needsConfirm);
        setMsg({ type: 'error', text: `Override saved, but ${needsConfirm.length} session(s) already have appointments — confirm below to mark them as leave anyway.` });
      } else {
        setMsg({ type: 'success', text: 'Override applied! The date-specific schedule is now active.' });
        setActiveSessions({ Morning: false, Evening: false });
        setSessions([]);
        if (onSaved) onSaved();
      }
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to apply override.' });
    } finally {
      setSaving(false);
    }
  };

  const confirmLeaveAnyway = async (item) => {
    try {
      await api.patch(`/clinic/availability/${item.availabilityId}/leave`, { force: true });
      setPendingConfirm(prev => prev ? prev.filter(p => p.availabilityId !== item.availabilityId) : null);
      setMsg({ type: 'success', text: `"${item.session}" marked as leave.` });
      setCurrentStatus(prev => ({ ...prev, [item.session]: { ...prev[item.session], is_leave: 1 } }));
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to confirm leave.' });
    }
  };

  /* Quick "undo leave" for a session that's already marked, without
     going through the full override form. */
  const cancelLeave = async (name) => {
    const row = currentStatus[name];
    if (!row?.availability_id) return;
    try {
      await api.post(`/clinic/availability/${row.availability_id}/reset`);
      setCurrentStatus(prev => ({ ...prev, [name]: { ...prev[name], is_leave: 0 } }));
      setMsg({ type: 'success', text: `"${name}" leave cancelled — session is available again.` });
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to cancel leave.' });
    }
  };

  return (
    <div>
      {/* Info callout */}
      <div style={{
        background: 'rgba(217,119,6,0.08)',
        border: '1px solid rgba(217,119,6,0.28)', borderRadius: 8,
        padding: '0.55rem 0.8rem', marginBottom: '0.75rem',
        fontSize: '0.76rem', color: '#fcd34d',
        display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
      }}>
        <span>📅</span>
        <span>
          Use this to <strong>override the regular schedule for a specific date</strong> — e.g., a holiday,
          extra session, changed timings, or to mark the doctor on leave for just that day/session. The
          override takes precedence over the weekly template.
        </span>
      </div>

      <InlineMsg msg={msg} />

      {pendingConfirm && pendingConfirm.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
          padding: '0.75rem 0.9rem', marginBottom: '1rem',
        }}>
          {pendingConfirm.map(item => (
            <div key={item.availabilityId} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '0.75rem', padding: '0.4rem 0',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                <strong>{item.session}</strong> has {item.activeAppointments.length} active appointment(s).
                Marking leave won't cancel them — handle those separately.
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => confirmLeaveAnyway(item)}
                style={{ borderRadius: 6, fontSize: '0.76rem', padding: '0.3rem 0.7rem', whiteSpace: 'nowrap', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                Mark Leave Anyway
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginBottom: '0.85rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="do-doctor">Doctor *</label>
          <select
            id="do-doctor"
            className="form-control"
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
          >
            <option value="">-- Select Doctor --</option>
            {doctors.map(d => (
              <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="do-date">Date *</label>
          <input
            id="do-date"
            type="date"
            className="form-control"
            value={date}
            onChange={e => setDate(e.target.value)}
            min={today()}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
          />
        </div>
      </div>

      {/* Session toggles — click to add, click again to remove */}
      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>
            Sessions to Override — click to add a session
          </label>
          <button
            type="button"
            onClick={markFullDayLeave}
            disabled={!doctorId || !date}
            style={{
              border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#f87171',
              borderRadius: 7, fontSize: '0.76rem', fontWeight: 700,
              padding: '0.3rem 0.7rem', cursor: (!doctorId || !date) ? 'not-allowed' : 'pointer',
              opacity: (!doctorId || !date) ? 0.5 : 1,
            }}
          >
            🚫 Mark Entire Day as Leave
          </button>
        </div>
        <div className="session-toggle-row">
          {['Morning', 'Evening'].map(name => {
            const existing = currentStatus[name];
            const onLeave = !!existing?.is_leave;
            return (
              <div
                key={name}
                id={`do-session-${name.toLowerCase()}`}
                className={`session-pill${activeSessions[name] ? ' active' : ''}`}
                onClick={() => toggleSession(name)}
                style={{ userSelect: 'none', position: 'relative' }}
              >
                <span className="pill-name">
                  {activeSessions[name] ? '✓ ' : '+ '}
                  {name === 'Morning' ? '🌅 ' : '🌆 '}{name}
                </span>
                <span className="pill-time">
                  {existing ? existing.start_time?.slice(0, 5) : SESSION_DEFAULTS[name].start_time} – {existing ? existing.end_time?.slice(0, 5) : SESSION_DEFAULTS[name].end_time}
                </span>
                {statusLoading ? null : onLeave ? (
                  <span style={{
                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                    color: '#dc2626', marginTop: 2,
                  }}>
                    🚫 On Leave
                  </span>
                ) : existing ? (
                  <span style={{
                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                    color: '#16a34a', marginTop: 2,
                  }}>
                    ✅ Active · {existing.total_tokens || '—'} tokens
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {['Morning', 'Evening'].filter(n => currentStatus[n]?.is_leave).length > 0 && (
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['Morning', 'Evening'].filter(n => currentStatus[n]?.is_leave).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => cancelLeave(n)}
                style={{
                  border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', color: '#6ee7b7',
                  borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                  padding: '0.25rem 0.6rem', cursor: 'pointer',
                }}
              >
                ✅ Cancel Leave for {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session config */}
      {sessions.filter(s => s.session).map(s => (
        <div key={s.session} style={{
          background: s.is_leave ? 'rgba(239,68,68,0.07)' : 'var(--bg-elevated)',
          border: `1px solid ${s.is_leave ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
          borderRadius: 8, padding: '0.7rem', marginBottom: '0.6rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
              {s.session === 'Morning' ? '🌅' : '🌆'} {s.session} Session
            </div>
            <button
              type="button"
              onClick={() => removeSession(s.session)}
              title="Remove this session from the override"
              style={{
                border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                padding: '0.2rem 0.55rem', cursor: 'pointer',
              }}
            >
              ✕ Remove
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', marginBottom: '0.3rem' }}>
            <input
              type="checkbox"
              checked={!!s.is_leave}
              onChange={e => updateSession(s.session, 'is_leave', e.target.checked)}
              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#dc2626' }}
            />
            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: s.is_leave ? '#f87171' : 'var(--text-secondary)' }}>
              🚫 Mark doctor on leave for this session
            </span>
          </label>
          {s.is_leave && !!currentStatus[s.session]?.is_leave && (
            <div style={{ fontSize: '0.7rem', color: '#fca5a5', marginBottom: '0.5rem' }}>
              Already marked as leave for this date — applying again won't change anything.
            </div>
          )}
          {!s.is_leave && !!currentStatus[s.session]?.is_leave && (
            <div style={{ fontSize: '0.7rem', color: '#fca5a5', marginBottom: '0.5rem' }}>
              ⚠️ Currently on leave — applying this will bring it back as a normal session.
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.55rem', alignItems: 'end',
            opacity: s.is_leave ? 0.5 : 1, pointerEvents: s.is_leave ? 'none' : 'auto',
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.78rem' }}>Start Time</label>
              <input type="time" className="form-control" value={s.start_time}
                style={{ padding: '0.34rem 0.5rem', fontSize: '0.88rem', fontWeight: 700 }}
                onChange={e => updateSession(s.session, 'start_time', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.78rem' }}>End Time</label>
              <input type="time" className="form-control" value={s.end_time}
                style={{ padding: '0.34rem 0.5rem', fontSize: '0.88rem', fontWeight: 700 }}
                onChange={e => updateSession(s.session, 'end_time', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.78rem' }}>Total Tokens</label>
              <input type="number" className="form-control" value={s.total_tokens}
                min={1} max={200} step={1}
                style={{ padding: '0.34rem 0.5rem', fontSize: '0.85rem' }}
                onChange={e => updateSession(s.session, 'total_tokens', e.target.value)} />
            </div>
          </div>

          {/* On-Site / Online overrides for THIS date only — leave blank
              to keep using the doctor's weekly repeating split. */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', alignItems: 'end',
            marginTop: '0.55rem',
            opacity: s.is_leave ? 0.5 : 1, pointerEvents: s.is_leave ? 'none' : 'auto',
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.72rem', color: '#22d3ee' }}>
                🏥 On-Site Tokens (override)
              </label>
              <input type="number" className="form-control" value={s.onsite_tokens}
                min={0} max={500} step={1} placeholder="Use weekly split"
                style={{ padding: '0.32rem 0.5rem', fontSize: '0.78rem', border: '1px solid rgba(6,182,212,0.4)' }}
                onChange={e => updateSession(s.session, 'onsite_tokens', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.72rem', color: '#fbbf24' }}>
                🌐 Online Tokens (override)
              </label>
              <input type="number" className="form-control" value={s.online_tokens}
                min={0} max={500} step={1} placeholder="Use weekly split"
                style={{ padding: '0.32rem 0.5rem', fontSize: '0.78rem', border: '1px solid rgba(217,119,6,0.4)' }}
                onChange={e => updateSession(s.session, 'online_tokens', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))} />
            </div>
          </div>
          {(s.onsite_tokens !== '' || s.online_tokens !== '') && !s.is_leave && (
            <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: '#5eead4' }}>
              ℹ️ Overriding {s.onsite_tokens !== '' && s.online_tokens !== '' ? 'both pools' : (s.onsite_tokens !== '' ? 'on-site' : 'online')} for {fmtDate(date)} only — the weekly template is unchanged.
            </div>
          )}

          {s.is_leave ? (
            <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#f87171' }}>
              Patients won't be able to book this session on {fmtDate(date)}. Existing appointments (if any) are kept — you'll be asked to confirm.
            </div>
          ) : (s.start_time && s.end_time && s.total_tokens > 0 && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              ≈ {avgFromTokens(s.start_time, s.end_time, Number(s.total_tokens))} min per patient
            </div>
          ))}
        </div>
      ))}

      <button
        id="do-apply-btn"
        className="btn btn-primary"
        onClick={handleApply}
        disabled={saving}
        style={{ borderRadius: 7, padding: '0.45rem 1.3rem', fontSize: '0.82rem', marginTop: '0.4rem' }}
      >
        {saving ? '⏳ Applying…' : '📅 Apply Date Override'}
      </button>
    </div>
  );
};

const BookingSettingsTab = ({ doctors }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [horizonSaving, setHorizonSaving] = useState(false);
  const [horizonMsg, setHorizonMsg] = useState(null);

  // --- Per-doctor weekly On-Site/Online token split, picked token-by-token ---
  const [doctorId, setDoctorId] = useState(doctors[0]?.doctor_id || '');

  const DEFAULT_TOTAL = 30;
  const DEFAULT_ONSITE = 15;
  // Front-loaded pattern: first N positions On-Site, the rest Online.
  // Used as the starting point for a fresh day/session, and to
  // translate any settings saved before token-by-token picking existed
  // (which only stored counts) into an equivalent pick list.
  const buildFrontLoaded = (total, onsite) => {
    const arr = [];
    for (let i = 0; i < total; i++) arr.push(i < onsite ? 'onsite' : 'online');
    return arr;
  };

  // Per-day settings: { "1_Morning": { total, assignments: ['onsite','online',...] }, ... }
  // assignments[i] is the pool for chronological token position i+1.
  const initTokenMap = () => {
    const m = {};
    DAYS.forEach(({ value: dow }) => {
      ['Morning', 'Evening'].forEach(sess => {
        m[`${dow}_${sess}`] = { total: DEFAULT_TOTAL, assignments: buildFrontLoaded(DEFAULT_TOTAL, DEFAULT_ONSITE) };
      });
    });
    return m;
  };
  const [tokenMap, setTokenMap] = useState(initTokenMap);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [hasDoctorSettings, setHasDoctorSettings] = useState(false);

  // Which day's token grids are currently open for editing (both
  // sessions are shown together — no more Morning/Evening tab switch).
  const [editDow, setEditDow] = useState(1);

  const today = new Date();
  const maxDate = new Date();
  maxDate.setMonth(today.getMonth() + 2);
  const formatToYYYYMMDD = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  // Load clinic-wide horizon once
  useEffect(() => {
    api.get('/clinic/dashboard')
      .then(res => {
        if (res.data.success && res.data.clinic) {
          if (res.data.clinic.booking_start_date) setStartDate(res.data.clinic.booking_start_date.slice(0, 10));
          if (res.data.clinic.booking_end_date) setEndDate(res.data.clinic.booking_end_date.slice(0, 10));
        }
      })
      .catch(() => {});
  }, []);

  // Load THIS doctor's weekly on-site/online split whenever the
  // selected doctor changes — same select-a-doctor-then-see-their-week
  // pattern used by Regular Schedule and Book Token, so this screen
  // sets a repeating weekly split per doctor instead of one split
  // shared by the whole clinic.
  useEffect(() => {
    if (!doctorId) return;
    setTokenLoading(true);
    setTokenMap(initTokenMap());
    setHasDoctorSettings(false);
    api.get(`/clinic/doctors/${doctorId}/session-token-settings`)
      .then(res => {
        if (res.data.success && res.data.settings?.length > 0) {
          setHasDoctorSettings(true);
          setTokenMap(prev => {
            const next = { ...prev };
            res.data.settings.forEach(row => {
              const total = row.total_tokens || 0;
              const assignments = (Array.isArray(row.token_assignments) && row.token_assignments.length === total)
                ? row.token_assignments
                : buildFrontLoaded(total, row.onsite_tokens || 0);
              next[`${row.day_of_week}_${row.session}`] = { total, assignments };
            });
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => setTokenLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  const keyOf = (dow, sess) => `${dow}_${sess}`;

  const toggleTile = (dow, sess, idx) => {
    setTokenMap(prev => {
      const key = keyOf(dow, sess);
      const cur = prev[key];
      const assignments = cur.assignments.slice();
      assignments[idx] = assignments[idx] === 'onsite' ? 'online' : 'onsite';
      return { ...prev, [key]: { ...cur, assignments } };
    });
  };

  const countsFor = (dow, sess) => {
    const entry = tokenMap[keyOf(dow, sess)];
    if (!entry) return { total: 0, onsite: 0, online: 0 };
    const onsite = entry.assignments.filter(a => a === 'onsite').length;
    return { total: entry.total, onsite, online: entry.total - onsite };
  };

  // Combined Morning + Evening figures for a day, so staff can see —
  // and adjust — the whole day's capacity without switching sessions.
  const dayCounts = (dow) => {
    const m = countsFor(dow, 'Morning');
    const e = countsFor(dow, 'Evening');
    return {
      total: m.total + e.total,
      onsite: m.onsite + e.onsite,
      online: m.online + e.online,
    };
  };

  // The day is stored internally as two session buckets (Morning /
  // Evening), but staff never see that split — they just see one
  // continuous run of tokens for the day, numbered 1...N. These
  // helpers flatten the two buckets into a single list/index space
  // and translate a "day position" back into the right bucket
  // whenever something needs to be written back.
  const combinedAssignments = (dow) => {
    const m = tokenMap[keyOf(dow, 'Morning')] || { total: 0, assignments: [] };
    const e = tokenMap[keyOf(dow, 'Evening')] || { total: 0, assignments: [] };
    return m.assignments.concat(e.assignments);
  };

  const toggleCombined = (dow, dayIdx) => {
    const m = tokenMap[keyOf(dow, 'Morning')] || { total: 0, assignments: [] };
    if (dayIdx < m.total) toggleTile(dow, 'Morning', dayIdx);
    else toggleTile(dow, 'Evening', dayIdx - m.total);
  };

  // Quick-fill patterns (Split Evenly / Alternate / All On-Site / All
  // Online) now apply across the whole day's token run in one go,
  // then get sliced back into the two hidden buckets.
  const quickFillDay = (dow, mode) => {
    setTokenMap(prev => {
      const mKey = keyOf(dow, 'Morning');
      const eKey = keyOf(dow, 'Evening');
      const mEntry = prev[mKey] || { total: 0, assignments: [] };
      const eEntry = prev[eKey] || { total: 0, assignments: [] };
      const dayTotal = mEntry.total + eEntry.total;
      let full;
      if (mode === 'all-onsite') full = Array(dayTotal).fill('onsite');
      else if (mode === 'all-online') full = Array(dayTotal).fill('online');
      else if (mode === 'half') full = buildFrontLoaded(dayTotal, Math.ceil(dayTotal / 2));
      else if (mode === 'alternate') full = Array.from({ length: dayTotal }, (_, i) => (i % 2 === 0 ? 'onsite' : 'online'));
      else full = mEntry.assignments.concat(eEntry.assignments);
      return {
        ...prev,
        [mKey]: { ...mEntry, assignments: full.slice(0, mEntry.total) },
        [eKey]: { ...eEntry, assignments: full.slice(mEntry.total) },
      };
    });
  };

  // Typing a day total always splits evenly across Morning then
  // Evening (60 → 30 + 30). Extra odd token goes to the first session.
  const setDayTotal = (dow, rawVal) => {
    const newTotal = rawVal === '' ? 0 : Math.max(0, Math.floor(Number(rawVal)));
    setTokenMap(prev => {
      const mKey = keyOf(dow, 'Morning');
      const eKey = keyOf(dow, 'Evening');
      const mEntry = prev[mKey] || { total: 0, assignments: [] };
      const eEntry = prev[eKey] || { total: 0, assignments: [] };
      const mTotal = Math.ceil(newTotal / 2);
      const eTotal = newTotal - mTotal;
      const adjust = (entry, newT) => {
        const assignments = entry.assignments.slice(0, newT);
        while (assignments.length < newT) assignments.push('online');
        return { total: newT, assignments };
      };
      return { ...prev, [mKey]: adjust(mEntry, mTotal), [eKey]: adjust(eEntry, eTotal) };
    });
  };

  // Grow/shrink the day total, then re-split evenly so morning and
  // evening stay equal (or morning +1 on an odd total).
  const bumpDayTotal = (dow, delta) => {
    setTokenMap(prev => {
      const mKey = keyOf(dow, 'Morning');
      const eKey = keyOf(dow, 'Evening');
      const mEntry = prev[mKey] || { total: 0, assignments: [] };
      const eEntry = prev[eKey] || { total: 0, assignments: [] };
      const newDay = Math.max(0, (mEntry.total + eEntry.total) + delta);
      const mTotal = Math.ceil(newDay / 2);
      const eTotal = newDay - mTotal;
      const adjust = (entry, newT) => {
        const assignments = entry.assignments.slice(0, newT);
        while (assignments.length < newT) assignments.push('online');
        return { total: newT, assignments };
      };
      return { ...prev, [mKey]: adjust(mEntry, mTotal), [eKey]: adjust(eEntry, eTotal) };
    });
  };

  const handleSaveHorizon = async () => {
    if (startDate && endDate && startDate > endDate) {
      setHorizonMsg({ type: 'error', text: "Visible From date can't be after the Visible End date." });
      return;
    }
    setHorizonSaving(true);
    setHorizonMsg(null);
    try {
      await api.patch('/clinic/settings', {
        booking_start_date: startDate || null,
        booking_end_date: endDate || null
      });
      setHorizonMsg({ type: 'success', text: 'Booking visibility window saved!' });
    } catch (err) {
      setHorizonMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to save booking visibility window.' });
    } finally {
      setHorizonSaving(false);
    }
  };

  const handleSave = async () => {
    if (!doctorId) {
      setMsg({ type: 'error', text: 'Select a doctor first.' });
      return;
    }
    setSaving(true);
    setMsg(null);

    const looksDefaultEntry = (entry) => {
      if (!entry || entry.total !== DEFAULT_TOTAL) return false;
      const expected = buildFrontLoaded(DEFAULT_TOTAL, DEFAULT_ONSITE);
      if (!entry.assignments || entry.assignments.length !== expected.length) return false;
      return expected.every((v, i) => entry.assignments[i] === v);
    };

    // Copy the day currently on screen onto weekdays that were never
    // customized, so tomorrow uses the same On-Site/Online numbers.
    const srcM = tokenMap[keyOf(editDow, 'Morning')] || { total: 0, assignments: [] };
    const srcE = tokenMap[keyOf(editDow, 'Evening')] || { total: 0, assignments: [] };
    const mapToSave = { ...tokenMap };
    DAYS.forEach(({ value: dow }) => {
      if (dow === editDow) return;
      const m = mapToSave[keyOf(dow, 'Morning')];
      const e = mapToSave[keyOf(dow, 'Evening')];
      if (looksDefaultEntry(m) && looksDefaultEntry(e)) {
        mapToSave[keyOf(dow, 'Morning')] = { total: srcM.total, assignments: (srcM.assignments || []).slice() };
        mapToSave[keyOf(dow, 'Evening')] = { total: srcE.total, assignments: (srcE.assignments || []).slice() };
      }
    });
    setTokenMap(mapToSave);

    const settingsArr = Object.keys(mapToSave).map(key => {
      const [dow, session] = key.split('_');
      const entry = mapToSave[key] || { total: 0, assignments: [] };
      const onsite = (entry.assignments || []).filter(a => a === 'onsite').length;
      return {
        day_of_week: Number(dow),
        session,
        total_tokens: entry.total,
        onsite_tokens: onsite,
        online_tokens: entry.total - onsite,
        token_assignments: entry.assignments,
      };
    });

    try {
      await api.post(`/clinic/doctors/${doctorId}/session-token-settings`, { settings: settingsArr });
      setHasDoctorSettings(true);
      setMsg({ type: 'success', text: `Weekly repeating token picks saved for ${selectedDoctor?.full_name || 'this doctor'} (including other weekdays that still had defaults).` });
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const selectedDoctor = doctors.find(d => String(d.doctor_id) === String(doctorId));

  const pillStyle = (active) => ({
    padding: '0.2rem 0.45rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
    border: `1px solid ${active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)'}`,
    background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
    color: active ? '#f1f5f9' : '#94a3b8', cursor: 'pointer',
    lineHeight: 1.15, textAlign: 'center',
  });
  const ghostBtn = { fontSize: '0.68rem', padding: '0.18rem 0.45rem', borderRadius: 5 };
  const mCount = countsFor(editDow, 'Morning');
  const eCount = countsFor(editDow, 'Evening');
  const dCount = dayCounts(editDow);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - var(--topbar-h, 64px) - 6.1rem)',
      minHeight: 0, overflow: 'hidden', gap: '0.4rem',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem 0.7rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Visible From</span>
        <input
          type="date" className="form-control"
          value={startDate}
          min={formatToYYYYMMDD(today)}
          max={endDate || formatToYYYYMMDD(maxDate)}
          onChange={e => setStartDate(e.target.value)}
          title="Earliest date patients can see/book tokens (blank = today)"
          style={{ width: 148, padding: '0.22rem 0.4rem', fontSize: '0.78rem' }}
        />
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Visible To</span>
        <input
          type="date" className="form-control"
          value={endDate}
          min={startDate || formatToYYYYMMDD(today)}
          max={formatToYYYYMMDD(maxDate)}
          onChange={e => setEndDate(e.target.value)}
          title="Last date patients can book (blank = 2 months)"
          style={{ width: 148, padding: '0.22rem 0.4rem', fontSize: '0.78rem' }}
        />
        <button className="btn btn-ghost" onClick={handleSaveHorizon} disabled={horizonSaving} style={ghostBtn}>
          {horizonSaving ? 'Saving…' : 'Save'}
        </button>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
        <select
          id="bs-doctor"
          className="form-control"
          value={doctorId}
          onChange={e => setDoctorId(e.target.value)}
          style={{ width: 180, padding: '0.22rem 0.4rem', fontSize: '0.78rem' }}
        >
          <option value="">Doctor…</option>
          {doctors.map(d => (
            <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
          ))}
        </select>
      </div>
      {(horizonMsg || msg) && (
        <div style={{ flexShrink: 0 }}>
          <InlineMsg msg={horizonMsg || msg} />
        </div>
      )}

      {!doctorId ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem', fontSize: '0.8rem' }}>
          Select a doctor to set weekly On-Site / Online token numbers.
        </div>
      ) : tokenLoading ? (
        <div className="loading-screen" style={{ minHeight: 60 }}>
          <div className="spinner" /><span>Loading…</span>
        </div>
      ) : (
        <>
          {!hasDoctorSettings && (
            <div style={{
              padding: '0.28rem 0.55rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
              borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.7rem', flexShrink: 0,
            }}>
              No weekly split saved yet — showing defaults. Tap tokens, then Save.
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', flexShrink: 0 }}>
            {DAYS.map(({ value: dow, label }) => {
              const d = dayCounts(dow);
              const active = editDow === dow;
              return (
                <button key={dow} type="button" onClick={() => setEditDow(dow)} style={pillStyle(active)}>
                  <div>{label}</div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 600, color: active ? '#cbd5e1' : '#64748b' }}>
                    {d.total} · <span style={{ color: '#22d3ee' }}>{d.onsite}</span>/<span style={{ color: '#fbbf24' }}>{d.online}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', flexShrink: 0,
            padding: '0.28rem 0.5rem',
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.28)', borderRadius: 7,
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fcd34d', textTransform: 'uppercase' }}>Total</span>
            <button type="button" onClick={() => bumpDayTotal(editDow, -1)} className="btn btn-ghost" style={{ ...ghostBtn, fontWeight: 800 }}>-</button>
            <input
              type="number" min={0} max={400} className="form-control"
              value={dCount.total}
              onChange={e => setDayTotal(editDow, e.target.value)}
              style={{ width: 52, padding: '0.12rem 0.25rem', fontSize: '0.82rem', fontWeight: 800, textAlign: 'center' }}
            />
            <button type="button" onClick={() => bumpDayTotal(editDow, 1)} className="btn btn-ghost" style={{ ...ghostBtn, fontWeight: 800 }}>+</button>
            <button type="button" onClick={() => bumpDayTotal(editDow, 5)} className="btn btn-ghost" style={ghostBtn}>+5</button>
            <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>
              <span style={{ color: '#22d3ee' }}>{dCount.onsite} On-Site</span>
              {' · '}
              <span style={{ color: '#fbbf24' }}>{dCount.online} Online</span>
            </span>
            {dCount.total > 0 && (
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                {'AM 1–' + mCount.total + (eCount.total > 0 ? (' · PM ' + (mCount.total + 1) + '–' + dCount.total) : '')}
              </span>
            )}
            <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
            <button type="button" onClick={() => quickFillDay(editDow, 'half')} className="btn btn-ghost" style={ghostBtn}>Evenly</button>
            <button type="button" onClick={() => quickFillDay(editDow, 'alternate')} className="btn btn-ghost" style={ghostBtn}>Alternate</button>
            <button type="button" onClick={() => quickFillDay(editDow, 'all-onsite')} className="btn btn-ghost" style={{ ...ghostBtn, color: '#22d3ee' }}>All On-Site</button>
            <button type="button" onClick={() => quickFillDay(editDow, 'all-online')} className="btn btn-ghost" style={{ ...ghostBtn, color: '#fbbf24' }}>All Online</button>
          </div>

          <div style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '0.4rem 0.5rem',
          }}>
            {dCount.total === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.75rem', padding: '0.4rem 0' }}>
                Set a total above to pick token numbers.
              </div>
            ) : (
              <div style={{
                flex: 1, minHeight: 0, overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
                gridAutoRows: '48px',
                gap: '0.32rem',
                alignContent: 'start',
              }}>
                {combinedAssignments(editDow).map((pool, idx) => {
                  const isOnsite = pool === 'onsite';
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleCombined(editDow, idx)}
                      title={'Token #' + (idx + 1) + ' — ' + (isOnsite ? 'On-Site' : 'Online') + ' (click to switch)'}
                      style={{
                        height: '48px',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        background: isOnsite ? 'rgba(6,182,212,0.18)' : 'rgba(245,158,11,0.18)',
                        border: '1.5px solid ' + (isOnsite ? '#06b6d4' : '#f59e0b'),
                        color: isOnsite ? '#22d3ee' : '#fbbf24',
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {doctorId && dCount.total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !doctorId}
                style={{ borderRadius: 6, padding: '0.4rem 1.1rem', fontSize: '0.8rem' }}
              >
                {saving ? 'Saving…' : ('Save picks' + (selectedDoctor ? ' · ' + selectedDoctor.full_name.split(' ')[0] : ''))}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ClinicAvailability = () => {
  const [searchParams] = useSearchParams();
  const [doctors, setDoctors]       = useState([]);
  // Deep-linkable so the dashboard's ⚙️ can jump straight to the
  // On-Site/Online split settings instead of landing on the default
  // tab and making staff hunt for it.
  const [activeTab, setActiveTab]   = useState(
    searchParams.get('tab') === 'settings' ? 'settings' : 'regular'
  );
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.get('/clinic/doctors')
      .then(res => {
        if (res.data.success) setDoctors(res.data.doctors || []);
      })
      .catch(() => {});
  }, []);

  const handleOverrideSaved = () => {
    setActiveTab('regular');
  };

  const tabs = [
    { key: 'regular', label: '📅 Regular Schedule',    title: 'Weekly Repeating Template' },
    { key: 'override', label: '📝 Date Override',      title: 'Override for a Specific Date' },
    { key: 'settings', label: '⚙️ Booking Settings',   title: 'Booking Horizon Configuration' },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
      height: 'calc(100vh - var(--topbar-h, 64px) - 2.2rem)',
      minHeight: 0, overflow: 'hidden',
    }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Manage Slots
          </h2>
        </div>
      </div>

      <div className="card" style={{
        padding: activeTab === 'settings' ? '0.45rem 0.7rem' : '0.6rem 1rem',
        flex: 1, minHeight: 0, overflow: activeTab === 'settings' ? 'hidden' : 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Tabs now live inside the same card/table container instead
            of floating above it as a separate strip. */}
        <div style={{
          display: 'flex', gap: '0.25rem',
          background: 'var(--bg-elevated)', borderRadius: 10,
          padding: '0.2rem', marginBottom: '0.4rem', flexShrink: 0,
          alignSelf: 'flex-start',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '0.32rem 0.8rem',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.82rem',
                transition: 'all 0.2s ease',
                background: activeTab === tab.key ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === tab.key ? '#5eead4' : 'var(--text-secondary)',
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'settings' && (
          <div style={{ fontWeight: 700, color: '#5eead4', fontSize: '0.76rem',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
            {tabs.find(t => t.key === activeTab)?.title}
          </div>
        )}

        {activeTab === 'settings' ? (
          <BookingSettingsTab doctors={doctors} />
        ) : doctors.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
            No doctors found. Please add doctors to the clinic first.
          </div>
        ) : (
          <>
            {activeTab === 'regular'  && <RegularScheduleTab doctors={doctors} />}
            {activeTab === 'override' && <DateOverrideTab doctors={doctors} onSaved={handleOverrideSaved} />}
          </>
        )}
      </div>

    </div>
  );
};

export default ClinicAvailability;