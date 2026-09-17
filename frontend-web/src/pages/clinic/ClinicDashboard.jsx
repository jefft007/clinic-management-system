import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import TokenGrid from '../../components/TokenGrid';

/* ─── helpers ─────────────────────────────────────────── */
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
// Short DD/MM/YY form used next to the "Appointments" heading —
// parsed directly from the yyyy-mm-dd string to avoid timezone drift.
const fmtDateShort = (d) => {
  if (!d) return '—';
  const parts = String(d).split('-');
  if (parts.length !== 3) return fmtDate(d);
  const [y, m, day] = parts;
  return `${day}/${m}/${y.slice(-2)}`;
};
const initials = (name) =>
  (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

// A session has "ended" once its end_time has passed on today's date
// (past dates are always considered ended; future dates never are).
// Mirrors the same check used on the Book Token / Freeze Slots pages
// so an expired, never-booked token shows "Ended" here too instead
// of staying "Available" forever.
const isSessionExpired = (session, dateStr) => {
  if (!session || !session.end_time) return false;
  if (dateStr < today()) return true;
  if (dateStr > today()) return false;
  const parts = String(session.end_time).split(':').map(Number);
  const end = new Date();
  end.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
  return end.getTime() <= Date.now();
};

// True only when the given appointment_date is today. Tomorrow's and
// later appointments shouldn't be markable as "Reported" yet — that
// only makes sense once the patient can actually be at the clinic.
const isToday = (dateValue) => {
  if (!dateValue) return false;
  return String(dateValue).slice(0, 10) === today();
};

/* ─── appointment session helpers ─────────────────────── */

// Convert MySQL TIME / 12-hour time into minutes from midnight.
const timeToMinutes = (value) => {
  if (!value) return null;

  const time = String(value).trim().toUpperCase();

  // MySQL TIME: HH:MM or HH:MM:SS
  const mysqlMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (mysqlMatch) {
    const hour = Number(mysqlMatch[1]);
    const minute = Number(mysqlMatch[2]);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return hour * 60 + minute;
    }
  }

  // 12-hour time: 5:30 PM
  const amPmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2]);
    const period = amPmMatch[3];

    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour !== 12) hour += 12;

    return hour * 60 + minute;
  }

  return null;
};

const getDateOnly = (value) => {
  if (!value) return '';

  const stringValue = String(value);
  const match = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) return match[1];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/*
 * Sort the dashboard's appointment list so it reads the way the
 * front desk actually calls patients in:
 *
 * 1. Earliest date first (today before tomorrow before later dates).
 * 2. Within the same date, ascending by token number — #1, #2, #3…
 *    — regardless of which order they were booked in, so walk-ins
 *    booked later still fall into their correct token slot instead
 *    of jumping to the top of the list.
 */
const sortAppointmentsByCurrentSession = (appointments, now = new Date()) => {
  if (!Array.isArray(appointments)) return [];

  return [...appointments].sort((a, b) => {
    // Earliest date first
    const dateA = String(a.appointment_date || '').slice(0, 10);
    const dateB = String(b.appointment_date || '').slice(0, 10);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    // Same date → lowest token number first
    return (Number(a.token_number) || 0) - (Number(b.token_number) || 0);
  });
};

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
const ClinicDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* ── date filter state ── */
  const [activePreset, setActivePreset] = useState('today');
  const [fromDate, setFromDate] = useState(today());
  const [toDate,   setToDate]   = useState(today());
  const [appliedFromDate, setAppliedFromDate] = useState(today());
  const [appliedToDate,   setAppliedToDate]   = useState(today());

  /* ── dashboard data ── */
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  /* ── doctors (drives the live-queue panel below) ── */
  const [doctors,     setDoctors]     = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);

  /* ── "Book Token" (Week / Month / Custom range) navigates to the
     dedicated Book Token page instead of opening a modal, carrying
     the currently selected doctor + date range along in the URL ── */
  const goToBookToken = () => {
    // Use the live from/to inputs (not appliedFromDate/appliedToDate) —
    // those only update when "Apply" is clicked, so relying on them here
    // would send staff to Book Token with a stale range if they picked a
    // custom date and clicked straight through without hitting Apply.
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    fetchDashboard(fromDate, toDate);

    const params = new URLSearchParams();
    if (selectedDoc) params.set('doctor_id', selectedDoc.doctor_id);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    navigate(`/clinic/book-token?${params.toString()}`);
  };

  /* ─── fetch dashboard ─────────────────────────────── */
  const fetchDashboard = useCallback(async (fd = fromDate, td = toDate, isPolling = false) => {
    try {
      if (!isPolling) setLoading(true);
      setError(null);
      const res = await api.get('/clinic/dashboard', {
        params: { fromDate: fd, toDate: td }
      });
      if (res.data.success) {
        setData(res.data.dashboard);
        try {
          const doctorsRes = await api.get('/clinic/doctors');
          if (doctorsRes.data.success) {
            const docs = doctorsRes.data.doctors || [];
            const activeDocs = docs.filter(doctor => doctor.status === 'Active');
            setDoctors(activeDocs);
            if (activeDocs.length > 0) {
              setSelectedDoc(prev => {
                if (!prev) return null;
                const stillExists = activeDocs.find(d => Number(d.doctor_id) === Number(prev.doctor_id));
                return stillExists || null;
              });
            }
          }
        } catch (doctorErr) {
          console.error('Failed to load clinic doctors:', doctorErr);
          setDoctors([]);
        }
      }
    } catch {
      setError('Unable to fetch dashboard data.');
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    fetchDashboard(fromDate, toDate);
    const interval = setInterval(() => {
      fetchDashboard(fromDate, toDate, true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard, fromDate, toDate]); // initial load & poll

  const handleApplyFilter = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    fetchDashboard(fromDate, toDate);
  };

  /* ─── stats ──────────────────────────────────────── */
  const stats = data?.statistics || {};
  const clinicName = data?.clinic?.clinic_name || 'Your Clinic';

  /* ─── render ─────────────────────────────────────── */
  if (loading && !data) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  /* ── quick preset helpers ── */
  const applyPreset = (preset) => {
    const now = new Date();
    const fmt = (d) => {
      const dt = new Date(d);
      dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
      return dt.toISOString().split('T')[0];
    };
    let fd, td;
    if (preset === 'today') {
      fd = td = fmt(now);
    } else if (preset === 'tomorrow') {
      const t = new Date(now); t.setDate(t.getDate() + 1);
      fd = td = fmt(t);
    } else if (preset === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.setDate(diff));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      fd = fmt(startOfWeek);
      td = fmt(endOfWeek);
    } else if (preset === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      fd = fmt(startOfMonth);
      td = fmt(endOfMonth);
    }
    setActivePreset(preset);
    setFromDate(fd);
    setToDate(td);
    setAppliedFromDate(fd);
    setAppliedToDate(td);
    fetchDashboard(fd, td);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <style>{`
        .highlight-date-val::-webkit-datetime-edit-day-field,
        .highlight-date-val::-webkit-datetime-edit-month-field,
        .highlight-date-val::-webkit-datetime-edit-year-field {
          color: #15803d !important;
          background: rgba(21, 128, 61, 0.2);
          border-radius: 4px;
        }
        .highlight-date-val::-webkit-datetime-edit-text {
          color: #fff !important;
        }
      `}</style>

      {/* ── HEADER — toolbar ── */}
      <div className="card" style={{ padding: '0.6rem 1rem', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingRight: '19rem' }}>

          {/* Preset pills */}
          {[
            { key: 'today',    label: 'Today' },
            { key: 'tomorrow', label: 'Tomorrow' },
            { key: 'week',     label: 'This Week' },
            { key: 'month',    label: 'This Month' },
          ].map(p => {
            const isActive = activePreset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                style={{
                  padding: '0.42rem 1.05rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  border: isActive ? 'none' : '1px solid var(--border)',
                  borderRadius: 999,
                  background: isActive
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--bg-elevated)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: isActive ? '0 3px 10px rgba(37,99,235,0.4)' : 'none',
                  transform: isActive ? 'translateY(-1px)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--primary-glow)';
                    e.currentTarget.style.color = 'var(--primary-light)';
                    e.currentTarget.style.borderColor = 'var(--primary-light)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }
                }}
              >
                {p.label}
              </button>
            );
          })}

          {/* Divider */}
          <div style={{ width: 1, height: 26, background: 'var(--border)', margin: '0 0.3rem', flexShrink: 0 }} />

          {/* Date range display — always visible, highlights when any preset active */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            flexWrap: 'wrap',
            padding: '0.3rem 0.6rem',
            borderRadius: 10,
            border: activePreset
              ? '1.5px solid rgba(37,99,235,0.55)'
              : '1.5px solid var(--border)',
            background: activePreset
              ? 'rgba(37,99,235,0.08)'
              : 'transparent',
            boxShadow: activePreset
              ? '0 0 0 3px rgba(37,99,235,0.12)'
              : 'none',
            transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {/* "From" label */}
            <span style={{
              fontSize: '0.86rem',
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              whiteSpace: 'nowrap',
              transition: 'color 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}>
              <span style={{ fontSize: '1.35rem' }}>📅</span> From:
            </span>

            <input
              type="date"
              className={`form-control ${activePreset ? 'highlight-date-val' : ''}`}
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setActivePreset('custom'); }}
              style={{
                padding: '0.32rem 0.5rem',
                fontSize: '0.94rem',
                width: 148,
                borderRadius: 7,
                border: activePreset
                  ? '1px solid rgba(37,99,235,0.45)'
                  : '1px solid var(--border)',
                background: activePreset
                  ? 'rgba(37,99,235,0.1)'
                  : 'var(--bg-elevated)',
                color: activePreset ? '#fff' : 'var(--text-secondary)',
                fontWeight: activePreset ? 600 : 400,
                transition: 'all 0.2s',
                outline: 'none',
              }}
            />

            <span style={{
              fontSize: '0.86rem',
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              transition: 'color 0.2s',
            }}>TO:</span>

            <input
              type="date"
              className={`form-control ${activePreset ? 'highlight-date-val' : ''}`}
              value={toDate}
              onChange={e => { setToDate(e.target.value); setActivePreset('custom'); }}
              style={{
                padding: '0.32rem 0.5rem',
                fontSize: '0.94rem',
                width: 148,
                borderRadius: 7,
                border: activePreset
                  ? '1px solid rgba(37,99,235,0.45)'
                  : '1px solid var(--border)',
                background: activePreset
                  ? 'rgba(37,99,235,0.1)'
                  : 'var(--bg-elevated)',
                color: activePreset ? '#fff' : 'var(--text-secondary)',
                fontWeight: activePreset ? 600 : 400,
                transition: 'all 0.2s',
                outline: 'none',
              }}
            />

            <button
              id="dash-apply-filter"
              onClick={handleApplyFilter}
              style={{
                padding: '0.34rem 1rem',
                fontSize: '0.88rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                cursor: 'pointer',
                transition: 'all 0.18s',
                boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              Apply
            </button>
          </div>

          {/* Doctor picker box — matches the FROM/TO box styling,
              pinned to the card's top-right corner via absolute
              positioning so it never eats into the row's flex space
              (no big empty gap on wide screens). Drives the same
              selectedDoc state as the Doctors widget cards below, so
              picking here highlights the matching card too. */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.6rem',
            borderRadius: 10,
            position: 'absolute',
            top: '0.6rem',
            right: '1rem',
            border: selectedDoc
              ? '1.5px solid rgba(37,99,235,0.55)'
              : '1.5px solid var(--border)',
            background: selectedDoc
              ? 'rgba(37,99,235,0.08)'
              : 'transparent',
            boxShadow: selectedDoc
              ? '0 0 0 3px rgba(37,99,235,0.12)'
              : 'none',
            transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <span style={{
              fontSize: '0.86rem',
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}>
              <span style={{ fontSize: '1.35rem' }}>🩺</span> Doctor:
            </span>

            <select
              value={selectedDoc?.doctor_id || ''}
              onChange={e => {
                const id = e.target.value;
                const doc = doctors.find(d => String(d.doctor_id) === String(id)) || null;
                setSelectedDoc(doc);
              }}
              style={{
                padding: '0.32rem 0.5rem',
                fontSize: '0.94rem',
                minWidth: 170,
                borderRadius: 7,
                border: selectedDoc
                  ? '1px solid rgba(37,99,235,0.45)'
                  : '1px solid var(--border)',
                background: selectedDoc
                  ? 'rgba(37,99,235,0.1)'
                  : 'var(--bg-elevated)',
                color: selectedDoc ? '#fff' : 'var(--text-secondary)',
                fontWeight: selectedDoc ? 600 : 400,
                transition: 'all 0.2s',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="" style={{ color: '#1e293b', background: '#fff' }}>All Doctors</option>
              {doctors.map(doc => (
                <option
                  key={doc.doctor_id}
                  value={doc.doctor_id}
                  style={{ color: '#1e293b', background: '#fff' }}
                >
                  {doc.full_name}{doc.specialization ? ` — ${doc.specialization}` : ''}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {error && <div className="auth-error">⚠️ {error}</div>}

      {/* ── DOCTORS IN CLINIC — full width ── */}
      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Doctors</h3>
          <Link to="/clinic/doctors" style={{ fontSize: '0.75rem', color: 'var(--primary-light)', fontWeight: 600 }}>
            All ({stats.total_active_doctors ?? stats.total_doctors ?? 0}) →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem', alignItems: 'flex-start' }}>
          {doctors.map(doc => {
            const isActive = selectedDoc?.doctor_id === doc.doctor_id;
            return (
              <div
                key={doc.doctor_id}
                id={`doctor-card-${doc.doctor_id}`}
                onClick={() => setSelectedDoc(prev => (prev?.doctor_id === doc.doctor_id ? null : doc))}
                title={doc.phone ? `${doc.full_name} · ${doc.phone}` : doc.full_name}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: isActive ? 'var(--primary-glow)' : 'var(--bg-elevated)',
                  border: `1.5px solid ${isActive ? 'var(--primary-light)' : 'var(--border)'}`,
                  borderRadius: '8px', padding: '0.4rem 0.6rem',
                  cursor: 'pointer', transition: 'all var(--transition)',
                  overflow: 'hidden'
                }}
              >
                <div className="user-avatar" style={{ width: 34, height: 34, fontSize: '0.85rem', flexShrink: 0 }}>
                  {initials(doc.full_name)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.full_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.specialization}
                  </div>
                </div>
              </div>
            );
          })}
          {doctors.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '0.4rem 0' }}>No active doctors found.</div>
          )}
        </div>
      </div>


      {/* ── QUICK TOKEN BOOKING BAR — Today / Tomorrow only ── */}
      {(activePreset === 'today' || activePreset === 'tomorrow') && (
        <TokenBookingBar
          doctor={selectedDoc}
          date={appliedFromDate}
          onBooked={() => fetchDashboard(fromDate, toDate)}
        />
      )}

      {/* ── APPOINTMENTS LIST ── */}
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', width: '100%', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, textAlign: 'left' }}>
            Appointments {selectedDoc ? `— ${selectedDoc.full_name}` : '— All Doctors'}
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 500 }}>
              ({appliedFromDate === appliedToDate ? fmtDateShort(appliedFromDate) : `${fmtDateShort(appliedFromDate)} to ${fmtDateShort(appliedToDate)}`})
            </span>
          </h3>

          {/* Week / Month / Custom range can't show a single day's
              token bar, so give staff a "Book Token" button that
              takes them to the Book Token page, pre-filtered to the
              same doctor + date range selected here. */}
          {(activePreset === 'week' || activePreset === 'month' || activePreset === 'custom') && (
            <button
              className="btn btn-primary"
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={goToBookToken}
            >
              + Book Token
            </button>
          )}
        </div>
        <DoctorAppointmentsList 
          selectedDoc={selectedDoc} 
          triggerRefresh={data} 
          fromDate={appliedFromDate} 
          toDate={appliedToDate} 
        />
      </div>

    </div>
  );
};

/* ════════════════════════════════════════════════════════
   TOKEN BOOKING PANEL (shared logic)
   Given a doctor + a single date, merges every session's on-site
   tokens into ONE continuous list (no separate Morning/Evening —
   Evening's numbering picks up right where Morning's total left
   off) and lets staff pick a free token and book it on the spot.
   Used both by the inline bar (Today/Tomorrow) and the "Book
   Token" modal (Week/Month/Custom range).
   ════════════════════════════════════════════════════════ */
const PHONE_PATTERN = /^[6-9]\d{9}$/;

const TokenBookingPanel = ({ doctor, date, onBooked }) => {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [onLeave, setOnLeave] = useState(false);

  const [tokens, setTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const [selectedToken, setSelectedToken] = useState('');
  const [selectedTokenObj, setSelectedTokenObj] = useState(null);

  const [form, setForm] = useState({
    patient_name: '', patient_phone: '', patient_alt_phone: '',
    patient_address: '', patient_age: '', patient_gender: 'Male'
  });
  const [booking, setBooking] = useState(false);
  const [msg, setMsg] = useState(null);

  const resetSelection = () => {
    setSelectedToken('');
    setSelectedTokenObj(null);
    setForm({ patient_name: '', patient_phone: '', patient_alt_phone: '', patient_address: '', patient_age: '', patient_gender: 'Male' });
    setMsg(null);
  };

  /* fetch the doctor's sessions for the chosen day (Morning + Evening etc.) */
  const fetchSessions = useCallback(async () => {
    if (!doctor?.doctor_id || !date) { setSessions([]); setOnLeave(false); return; }
    setLoadingSessions(true);
    try {
      const res = await api.get(`/clinic/doctors/${doctor.doctor_id}/availability`, {
        params: { from_date: date, to_date: date }
      });
      if (res.data.success) {
        const dayRecords = (res.data.availability || []).filter(a =>
          a.available_date && String(a.available_date).slice(0, 10) === date
        );
        const valid = dayRecords.filter(a => !a.is_leave);
        // Keep session order stable (Morning before Evening) so the
        // continuous numbering always picks up from the earlier session.
        valid.sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
        setSessions(valid);
        // If every session configured for the day is marked as leave
        // (and none remain bookable), the doctor is off that day —
        // distinct from no session ever being configured at all.
        setOnLeave(valid.length === 0 && dayRecords.some(a => a.is_leave));
      }
    } catch (err) {
      console.error(err);
      setSessions([]);
      setOnLeave(false);
    } finally {
      setLoadingSessions(false);
    }
  }, [doctor?.doctor_id, date]);

  useEffect(() => { resetSelection(); fetchSessions(); }, [fetchSessions]);

  /* fetch tokens (on-site AND online) for EVERY session and merge them
     into one continuously-numbered list. Passing no booking_source
     filter to the API returns both pools together, already sorted by
     token_number — same continuous 1..N sequence shown on the Book
     Token page's "All" view. */
  const fetchAllTokens = useCallback(async () => {
    if (sessions.length === 0) { setTokens([]); return; }
    setLoadingTokens(true);
    try {
      const results = await Promise.all(
        sessions.map(s =>
          api.get(`/clinic/availability/${s.availability_id}/tokens`)
        )
      );
      const merged = [];
      results.forEach((res, idx) => {
        const sess = sessions[idx];
        const sessionExpired = isSessionExpired(sess, date);
        const list = (res.data.success && res.data.tokens) ? res.data.tokens : [];
        list.forEach(t => {
          merged.push({
            ...t,
            unique_id: `${sess.availability_id}_${t.token_number}`,
            display_number: t.token_number,
            availability_id: sess.availability_id,
            session: sess.session,
            session_expired: sessionExpired,
            session_ref: sess,
          });
        });
      });
      merged.sort((a, b) => Number(a.token_number) - Number(b.token_number));
      setTokens(merged);
    } catch (err) {
      console.error(err);
      setTokens([]);
    } finally {
      setLoadingTokens(false);
    }
  }, [sessions]);

  useEffect(() => { resetSelection(); fetchAllTokens(); }, [fetchAllTokens]);

  const handleSelectToken = (tKey, t) => {
    setSelectedToken(tKey);
    setSelectedTokenObj(t);
    setMsg(null);
  };

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedTokenObj) return;

    if (!PHONE_PATTERN.test(form.patient_phone)) {
      setMsg({ type: 'error', text: 'Enter a valid 10-digit phone number starting with 6-9.' });
      return;
    }

    setBooking(true);
    setMsg(null);
    try {
      await api.post('/clinic/appointments/book', {
        doctor_id: doctor.doctor_id,
        appointment_date: date,
        availability_id: selectedTokenObj.availability_id,
        session: selectedTokenObj.session,
        token_number: selectedTokenObj.token_number,
        booking_source: selectedTokenObj.booking_source === 'online' ? 'online' : 'walk_in',
        patient_name: form.patient_name,
        patient_phone: form.patient_phone,
        patient_alt_phone: form.patient_alt_phone,
        patient_address: form.patient_address,
        patient_age: form.patient_age,
        patient_gender: form.patient_gender
      });
      setMsg({ type: 'success', text: `Token #${selectedTokenObj.display_number} booked for ${form.patient_name}.` });
      resetSelection();
      fetchAllTokens();
      if (onBooked) onBooked();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to book token.' });
    } finally {
      setBooking(false);
    }
  };

  if (loadingSessions) {
    return <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading sessions…</div>;
  }

  if (sessions.length === 0) {
    if (onLeave) {
      return (
        <div style={{
          fontSize: '0.82rem', color: '#ef4444', padding: '0.5rem 0.75rem',
          background: 'rgba(239,68,68,0.12)', borderRadius: 6, fontWeight: 600
        }}>
          🚫 {doctor.full_name} is on leave on {fmtDateShort(date)}.
        </div>
      );
    }
    return (
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
        No session configured for {doctor.full_name} on {fmtDateShort(date)}.
      </div>
    );
  }

  return (
    <>
      <TokenGrid
        tokens={tokens}
        selectedToken={selectedToken}
        onSelect={handleSelectToken}
        loading={loadingTokens}
        emptyText="No tokens available for this day."
      />

      {selectedTokenObj && (
        <form onSubmit={handleBook} style={{
          marginTop: '0.75rem', padding: '0.75rem', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-elevated)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
            <input type="text" required placeholder="Patient Full Name *" className="form-control"
              value={form.patient_name}
              onChange={e => setForm({ ...form, patient_name: e.target.value })} />
            <input type="text" required placeholder="Phone (10-digit) *" className="form-control"
              pattern="[6-9][0-9]{9}"
              value={form.patient_phone}
              onChange={e => setForm({ ...form, patient_phone: e.target.value })} />
            <input type="text" placeholder="Alt Phone" className="form-control"
              pattern="[6-9][0-9]{9}"
              value={form.patient_alt_phone}
              onChange={e => setForm({ ...form, patient_alt_phone: e.target.value })} />
            <input type="text" required placeholder="Address *" className="form-control"
              value={form.patient_address}
              onChange={e => setForm({ ...form, patient_address: e.target.value })} />
            <input type="number" min="0" max="150" placeholder="Age" className="form-control"
              value={form.patient_age}
              onChange={e => setForm({ ...form, patient_age: e.target.value })} />
            <select className="form-control" value={form.patient_gender}
              onChange={e => setForm({ ...form, patient_gender: e.target.value })}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.65rem' }}>
            <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem' }}
              onClick={resetSelection} disabled={booking}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem' }}
              disabled={booking}>
              {booking ? 'Booking…' : `Book Token #${selectedTokenObj.display_number}`}
            </button>
          </div>
        </form>
      )}

      {msg && (
        <div style={{
          marginTop: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: 6,
          fontSize: '0.8rem', fontWeight: 600,
          background: msg.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
          color: msg.type === 'error' ? '#ef4444' : '#10b981'
        }}>
          {msg.text}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════
   TOKEN BOOKING BAR (inline)
   Shown at the top of the appointments list whenever staff
   pick the "Today" or "Tomorrow" preset — the doctor + date are
   already known from the page's own filters, so it renders the
   panel directly with no extra pickers.
   ════════════════════════════════════════════════════════ */
const TokenBookingBar = ({ doctor, date, onBooked }) => {
  // No doctor selected yet — don't show anything for the token bar
  // by default; it only appears once staff click a doctor above.
  if (!doctor) {
    return null;
  }

  return (
    <div className="card" style={{ padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.98rem' }}>
          Book a Token — {doctor.full_name}
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 500 }}>
            ({fmtDateShort(date)})
          </span>
        </h3>
      </div>

      <TokenBookingPanel doctor={doctor} date={date} onBooked={onBooked} />
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   DOCTOR APPOINTMENTS LIST
   Replaces the Live Queue view, showing a simple list of appointments
   for the selected doctor (or all doctors) based on date filter, with quick actions.
   ════════════════════════════════════════════════════════ */

// Darker, filled status colors — solid dark background + white text +
// a persistent matching glow so the pill always reads as "highlighted"
// (not just a pastel tint), same idea across both the Status badge and
// the Token number badge in the table below.
const STATUS_COLORS = {
  Booked:        { bg: '#2563eb', glow: 'rgba(37,99,235,0.45)' },
  Reserved:      { bg: '#9a3412', glow: 'rgba(154,52,18,0.45)' },
  // Waiting is yellow — needs a dark text color instead of the usual
  // white, since white-on-yellow doesn't read well.
  'Waiting':     { bg: '#fbbf24', glow: 'rgba(251,191,36,0.5)', text: '#1c1917' },
  'In Progress': { bg: '#92400e', glow: 'rgba(146,64,14,0.45)' },
  Completed:     { bg: '#15803d', glow: 'rgba(21,128,61,0.45)' },
  Cancelled:     { bg: '#581c87', glow: 'rgba(88,28,135,0.45)' },
  Skipped:       { bg: '#374151', glow: 'rgba(55,65,81,0.45)' },
  Absent:        { bg: '#dc2626', glow: 'rgba(220,38,38,0.45)' }
};

const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: '#374151', glow: 'rgba(55,65,81,0.4)' };
  // Display "Consulted" for Completed
  const displayStatus = status === 'Completed' ? 'Consulted' : status === 'Reserved' ? 'Blocked' : status;
  return (
    <span style={{
      background: s.bg, color: s.text || '#ffffff',
      borderRadius: '20px', padding: '0.35rem 0.9rem',
      fontSize: '0.88rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{displayStatus}</span>
  );
};

const fmtTime = (iso) => {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// Time fields sometimes come as a range ("10:00 AM - 10:15 AM") — the
// appointments table only wants the start time.
const startTimeOnly = (label) => {
  if (!label) return label;
  const parts = String(label).split(' - ');
  return parts[0] || label;
};

const DoctorAppointmentsList = ({ selectedDoc, triggerRefresh, fromDate, toDate }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Re-run session sorting automatically as the clock moves from
  // Morning -> Evening (and between any configured sessions).
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const params = { from_date: fromDate, to_date: toDate };
      if (selectedDoc) {
        params.doctor_id = selectedDoc.doctor_id;
      }
      const apptRes = await api.get('/clinic/appointments', { params });
      if (apptRes.data.success) setAppointments(apptRes.data.appointments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedDoc, fromDate, toDate]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments, triggerRefresh]);

  const sortedAppointments = sortAppointmentsByCurrentSession(
    appointments,
    currentTime
  );

  const updateStatus = async (id, status, remark) => {
    try {
      const payload = remark !== undefined ? { status, remark } : { status };
      await api.patch(`/clinic/appointments/${id}/status`, payload);
      fetchAppointments();
      // Dispatch an event to refresh dashboard stats if needed, or we rely on triggerRefresh in parent
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };



  return (
    <div style={{ width: '100%' }}>
      {loading ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading appointments…</div>
      ) : sortedAppointments.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
          No appointments found for the selected date range.
        </div>
      ) : (
        <div
          className="table-wrapper"
          style={{
            // Header (48px) + exactly 10 data rows (52px each) = 568px,
            // so the first 10 appointments are always visible without
            // scrolling; anything beyond that scrolls inside the box.
            maxHeight: 'calc(48px + 52px * 10)',
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            borderRadius: '8px',
            border: '1px solid var(--border)'
          }}
        >
          <style>{`
            .appointments-table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              table-layout: fixed;
            }
            .appointments-table td, .appointments-table th {
              padding: 0 1rem !important;
              vertical-align: middle;
              border-bottom: 1px solid rgba(255, 255, 255, 0.06);
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .appointments-table thead th {
              height: 48px;
              font-size: 0.82rem;
              text-transform: uppercase;
              letter-spacing: 0.03em;
            }
            .appointments-table tbody tr {
              height: 52px;
              background-color: transparent;
              transition: background 0.15s;
            }
            .appointments-table th:not(:last-child),
            .appointments-table td:not(:last-child) {
              border-right: 1px solid rgba(255, 255, 255, 0.03);
            }
            .appointments-table tbody tr:nth-child(even) {
              background-color: rgba(0, 0, 0, 0.12);
            }
            .appointments-table tbody tr:hover {
              background-color: rgba(37, 99, 235, 0.15) !important;
            }
          `}</style>
          <table className="appointments-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-elevated)' }}>
              <tr>
                <th style={{ width: '8%' }}>Date</th>
                <th style={{ width: '7%' }}>Token</th>
                <th style={{ width: selectedDoc ? '14%' : '11%' }}>Patient</th>
                <th style={{ width: '11%' }}>Phone Number</th>
                {!selectedDoc && <th style={{ width: '9%' }}>Doctor</th>}
                <th style={{ width: selectedDoc ? '11%' : '10%' }}>Place</th>
                <th style={{ width: '9%' }}>Time</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '9%' }}>Arrived</th>
                <th style={{ width: selectedDoc ? '21%' : '15%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAppointments.map(a => (
                <tr key={a.appointment_id}>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {fmtDate(a.appointment_date)}
                  </td>
                  <td>
                    {(() => {
                      const s = STATUS_COLORS[a.status] || { bg: '#374151', glow: 'rgba(55,65,81,0.4)' };
                      return (
                        <span style={{
                          display: 'inline-block',
                          background: s.bg, color: s.text || '#ffffff',
                          borderRadius: '6px', padding: '0.25rem 0.6rem',
                          fontSize: '0.92rem', fontWeight: 800, lineHeight: 1.2,
                        }}>#{a.token_number}</span>
                      );
                    })()}
                  </td>
                  <td title={a.patient_name || '—'}>
                    <span style={{ fontWeight: 600 }}>{a.patient_name || '—'}</span>
                  </td>
                  <td title={a.patient_phone || '—'}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{a.patient_phone || '—'}</span>
                  </td>
                  {!selectedDoc && (
                    <td title={a.doctor_name}>
                      <span style={{ fontWeight: 500 }}>{a.doctor_name}</span>
                    </td>
                  )}
                  <td title={a.patient_address || '—'}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{a.patient_address || '—'}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {startTimeOnly(a.estimated_time_label || a.estimated_time || a.appointment_time || a.session)}
                    </span>
                  </td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    {a.arrived_time ? (
                      <span
                        style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}
                        title={a.arrived_estimated ? 'Estimated from booking time — reporting wasn\'t recorded' : undefined}
                      >
                        🕐 {fmtTime(a.arrived_time)}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', overflow: 'visible' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {['Booked', 'Reserved'].includes(a.status) && isToday(a.appointment_date) && (
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                          onClick={() => updateStatus(a.appointment_id, 'Waiting')}
                        >
                          Reported
                        </button>
                      )}
                      {(a.status === 'Waiting' || a.status === 'In Progress') && (
                        <button
                          className="btn btn-success"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                          onClick={() => updateStatus(a.appointment_id, 'Completed')}
                        >
                          Consulted
                        </button>
                      )}
                      {['Booked', 'Reserved'].includes(a.status) && (
                        <button 
                          className="btn btn-danger-outline" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                          onClick={() => window.confirm('Cancel this appointment?') && updateStatus(a.appointment_id, 'Cancelled')}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


    </div>
  );
};

export default ClinicDashboard;