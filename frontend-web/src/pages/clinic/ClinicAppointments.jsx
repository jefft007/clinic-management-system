import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import TokenGrid from '../../components/TokenGrid';

const initials = (name) =>
  (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const AVATAR_COLORS = ['#2563eb', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'];
const avatarColor = (id) => AVATAR_COLORS[Number(id || 0) % AVATAR_COLORS.length];

// Status badge — dark solid filled pill with white text,
// identical to the ClinicDashboard appointments table.
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
  Absent:        { bg: '#dc2626', glow: 'rgba(220,38,38,0.45)' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: '#374151', glow: 'rgba(55,65,81,0.4)' };
  const displayStatus = status === 'Completed' ? 'Consulted' : status === 'Reserved' ? 'Blocked' : status;
  return (
    <span style={{
      background: s.bg, color: s.text || '#ffffff',
      borderRadius: '20px', padding: '0.35rem 0.9rem',
      fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
      letterSpacing: '0.01em',
    }}>{displayStatus}</span>
  );
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const dt = new Date(iso);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (iso) => {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};


const ClinicAppointments = () => {
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Filters
  const today = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  })();
  // Tomorrow, same local-date-safe approach as `today` above.
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  })();
  // Walk-in staff booking today/tomorrow should only ever see the
  // On-Site pool — those near-term slots are walk-in territory, and
  // patients may already be mid-booking the Online pool for those
  // same dates. Further-out dates still show both pools together.
  const isNearTermDate = (dateStr) => dateStr === today || dateStr === tomorrow;
  const [filters, setFilters] = useState({
    from_date: searchParams.get('from_date') || today,
    to_date: searchParams.get('to_date') || today,
    doctor_id: '',
    session: '',
    status: searchParams.get('status') || ''
  });

  // Booking state
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    doctor_id: '',
    appointment_date: today,
    availability_id: '',
    session: '',
    token_number: '',
    patient_name: '',
    patient_phone: '',
    patient_alt_phone: '',
    patient_address: '',
    patient_age: '',
    patient_gender: 'Male',
    booking_source: 'walk_in'
  });
  const [availability, setAvailability] = useState(null);
  const [tokenMap, setTokenMap] = useState(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [booking, setBooking] = useState(false);

  // Cancel confirmation modal: prevents accidental cancellations.
  const [cancelTarget, setCancelTarget] = useState(null); // appointment_id being cancelled
  const [cancelRemark, setCancelRemark] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDoctors = async () => {
    try {
      const res = await api.get('/clinic/doctors');
      if (res.data.success) setDoctors(res.data.doctors.filter(d => d.status === 'Active'));
    } catch (err) { console.error(err); }
  };

  const fetchAppointments = useCallback(async (overrideFilters, isPolling = false) => {
    const f = overrideFilters || filters;
    try {
      if (!isPolling) setLoading(true);
      const params = new URLSearchParams();
      if (f.from_date) params.set('from_date', f.from_date);
      if (f.to_date)   params.set('to_date',   f.to_date);
      if (f.doctor_id) params.set('doctor_id', f.doctor_id);
      if (f.session)   params.set('session',   f.session);
      if (f.status)    params.set('status',    f.status);

      const res = await api.get(`/clinic/appointments?${params.toString()}`);
      if (res.data.success) setAppointments(res.data.appointments);
    } catch (err) {
      console.error(err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchDoctors();
  }, []);

  // Filters are applied on demand (via the "Apply" button) rather than
  // firing a request on every keystroke/selection — this only loads
  // once up front, on mount, with today's date as the default range.
  // Also run auto-absent to silently clean up past no-shows.
  useEffect(() => {
    runAutoMarkAbsent().then(() => fetchAppointments());
    const interval = setInterval(() => fetchAppointments(null, true), 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const updateStatus = async (id, status, remark) => {
    try {
      const payload = remark !== undefined ? { status, remark } : { status };
      await api.patch(`/clinic/appointments/${id}/status`, payload);
      showToast(`Appointment status updated to ${displayStatus(status)}`);
      fetchAppointments();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  const openCancelModal = (id) => {
    setCancelTarget(id);
    setCancelRemark('');
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.patch(`/clinic/appointments/${cancelTarget}/status`, {
        status: 'Cancelled',
        remark: cancelRemark.trim() || null,
      });
      showToast('Appointment cancelled');
      setCancelTarget(null);
      setCancelRemark('');
      fetchAppointments();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to cancel appointment', 'error');
    } finally {
      setCancelling(false);
    }
  };

  // Silently batch-mark past-date Booked/Waiting appointments as Absent on load.
  const runAutoMarkAbsent = useCallback(async () => {
    try {
      await api.post('/clinic/appointments/auto-absent');
    } catch (err) {
      // Non-critical — log only, don't surface to the user.
      console.warn('Auto-absent failed (non-critical):', err);
    }
  }, []);

  // Releases a blocked token completely — unlike the other status
  // changes, this removes the hold rather than moving it to another
  // status, so the token immediately becomes available again for
  // patients to book.
  const handleUnblock = async (id) => {
    try {
      await api.delete(`/clinic/appointments/${id}/unblock`);
      showToast('Token unblocked — it is now available for patients to book');
      fetchAppointments();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to unblock token', 'error');
    }
  };

  const checkAvailability = async () => {
    if (!bookingForm.doctor_id || !bookingForm.appointment_date) return;
    try {
      const res = await api.get(`/clinic/doctors/${bookingForm.doctor_id}/availability`);
      if (res.data.success) {
        const avail = res.data.availability.find(a =>
          a.available_date && a.available_date.startsWith(bookingForm.appointment_date) && !a.is_leave
        );
        setAvailability(avail || null);
        if (avail) {
          setBookingForm(prev => ({ ...prev, availability_id: avail.availability_id, session: avail.session, token_number: '' }));
        } else {
          setTokenMap(null);
        }
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (showBookModal) checkAvailability();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingForm.doctor_id, bookingForm.appointment_date, showBookModal]);

  // Fetch the full token map (theatre/bus-ticket style) once a
  // valid availability slot has been resolved for the modal.
  const fetchTokenMap = useCallback(async (availabilityId, dateStr) => {
    if (!availabilityId) { setTokenMap(null); return; }
    setLoadingTokens(true);
    try {
      const params = isNearTermDate(dateStr) ? { booking_source: 'walk_in' } : {};
      const res = await api.get(`/clinic/availability/${availabilityId}/tokens`, { params });
      if (res.data.success) setTokenMap(res.data);
    } catch (err) {
      console.error(err);
      setTokenMap(null);
    } finally {
      setLoadingTokens(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (availability?.availability_id) fetchTokenMap(availability.availability_id, bookingForm.appointment_date);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, fetchTokenMap, bookingForm.appointment_date]);

  const handleBook = async (e) => {
    e.preventDefault();
    setBooking(true);
    try {
      await api.post('/clinic/appointments/book', bookingForm);
      showToast('Token booked successfully');
      setShowBookModal(false);
      setBookingForm({
        doctor_id: '', appointment_date: today, availability_id: '',
        session: '', token_number: '', patient_name: '',
        patient_phone: '', patient_alt_phone: '', patient_address: '',
        patient_age: '', patient_gender: 'Male', booking_source: 'walk_in'
      });
      setAvailability(null);
      setTokenMap(null);
      fetchAppointments();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to book token', 'error');
    } finally {
      setBooking(false);
    }
  };

  const clearFilters = () => {
    const reset = { from_date: today, to_date: today, doctor_id: '', session: '', status: '' };
    setFilters(reset);
    fetchAppointments(reset);
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 3000,
          background: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', padding: '0.85rem 1.25rem', borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex',
          alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem',
          fontWeight: 600, maxWidth: '380px'
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.message}
        </div>
      )}

      {/* PAGE HEADER */}
      <div className="page-header flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Appointments</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manage and book tokens — {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} found</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowBookModal(true)}>
          + Book Token
        </button>
      </div>

      {/* FILTERS */}
      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.65rem 1rem', background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', margin: 0 }}>From</label>
            <input
              type="date" className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={filters.from_date}
              onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', margin: 0 }}>To</label>
            <input
              type="date" className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={filters.to_date}
              onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))}
            />
          </div>

          <div style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }} />

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', margin: 0 }}>Doctor</label>
            <select className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '150px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={filters.doctor_id}
              onChange={e => setFilters(f => ({ ...f, doctor_id: e.target.value }))}>
              <option value="">All Doctors</option>
              {doctors.map(d => (
                <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', margin: 0 }}>Session</label>
            <select className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '120px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={filters.session}
              onChange={e => setFilters(f => ({ ...f, session: e.target.value }))}>
              <option value="">All Sessions</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', margin: 0 }}>Status</label>
            <select className="form-control"
              style={{ padding: '0.42rem 0.65rem', fontSize: '0.9rem', minWidth: '130px', border: '1.5px solid rgba(99,102,241,0.55)', background: 'rgba(99,102,241,0.12)' }}
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              <option value="Reported">Reported (Arrived)</option>
              <option value="Booked">Booked</option>
              <option value="Waiting">Waiting</option>
              <option value="Completed">Consulted</option>
              <option value="Absent">Absent</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }} />

          <button className="btn btn-primary" onClick={() => fetchAppointments()}
            style={{ padding: '0.45rem 1.05rem', fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Apply
          </button>
          <button className="btn btn-ghost" onClick={clearFilters}
            style={{ padding: '0.45rem 1.05rem', fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Clear
          </button>
        </div>
      </div>

      {/* APPOINTMENTS TABLE */}
      {loading ? (
        <div className="loading-screen"><div className="spinner"></div><span>Loading appointments...</span></div>
      ) : appointments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📅</div>
          <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>No appointments found for the selected filters.</p>
        </div>
      ) : (
        <div
          className="table-wrapper"
          style={{
            maxHeight: 'calc(48px + 52px * 12)',
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          <style>{`
            .appt-table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              table-layout: fixed;
            }
            .appt-table td, .appt-table th {
              padding: 0 1rem !important;
              vertical-align: middle;
              border-bottom: 1px solid rgba(255,255,255,0.06);
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .appt-table thead th {
              height: 48px;
              font-size: 0.78rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              color: var(--text-secondary);
              background: var(--bg-elevated);
            }
            .appt-table tbody tr {
              height: 52px;
              transition: background 0.14s;
            }
            .appt-table tbody tr:nth-child(even) {
              background-color: rgba(0,0,0,0.10);
            }
            .appt-table tbody tr:hover {
              background-color: rgba(37,99,235,0.13) !important;
            }
            .appt-table th:not(:last-child),
            .appt-table td:not(:last-child) {
              border-right: 1px solid rgba(255,255,255,0.03);
            }
            .appt-table tbody tr:last-child td {
              border-bottom: none;
            }
          `}</style>
          <table className="appt-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ width: '9%' }}>Date</th>
                <th style={{ width: '7%' }}>Token</th>
                <th style={{ width: '15%' }}>Patient</th>
                <th style={{ width: '12%' }}>Phone</th>
                <th style={{ width: '12%' }}>Doctor</th>
                <th style={{ width: '9%' }}>Time</th>
                <th style={{ width: '11%' }}>Status</th>
                <th style={{ width: '9%' }}>Arrived</th>
                <th style={{ width: '16%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map(a => {
                // Token badge — same solid dark bg + white text as the
                // ClinicDashboard appointments table (STATUS_COLORS).
                const tc = STATUS_COLORS[a.status] || { bg: '#374151', glow: 'rgba(55,65,81,0.4)' };
                return (
                  <tr key={a.appointment_id}>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {fmtDate(a.appointment_date)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        background: tc.bg,
                        color: tc.text || '#ffffff',
                        borderRadius: '6px',
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.92rem',
                        fontWeight: 800,
                        lineHeight: 1.2,
                      }}>#{a.token_number}</span>
                    </td>
                    <td title={a.patient_name || '—'}>
                      <span style={{ fontWeight: 600 }}>{a.patient_name || '—'}</span>
                    </td>
                    <td title={a.patient_phone || '—'}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{a.patient_phone || '—'}</span>
                    </td>
                    <td title={a.doctor_name || '—'}>
                      <span style={{ fontWeight: 500 }}>{a.doctor_name || '—'}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                        {(a.estimated_time_label || a.estimated_time || a.appointment_time || a.session || '—').toString().split('–')[0].trim()}
                      </span>
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>
                      {a.arrived_time ? (
                        <span
                          style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}
                          title={a.arrived_estimated ? "Estimated from booking time — reporting wasn't recorded" : undefined}
                        >
                          🕐 {fmtTime(a.arrived_time)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', overflow: 'visible' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {a.status === 'Reserved' && a.patient_name && (
                          <button className="btn btn-primary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                            onClick={() => updateStatus(a.appointment_id, 'Booked')}>
                            Confirm
                          </button>
                        )}
                        {a.status === 'Reserved' && (
                          <button className="btn btn-success"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                            onClick={() => handleUnblock(a.appointment_id)}>
                            Unblock
                          </button>
                        )}
                        {['Booked', 'Reserved'].includes(a.status) && (
                          <button className="btn btn-ghost"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                            onClick={() => updateStatus(a.appointment_id, 'Waiting')}>
                            Reported
                          </button>
                        )}
                        {a.status === 'Waiting' && (
                          <button className="btn btn-success"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                            onClick={() => updateStatus(a.appointment_id, 'Completed')}>
                            Consulted
                          </button>
                        )}
                        {['Booked', 'Reserved', 'Waiting'].includes(a.status) && (
                          <button className="btn btn-danger-outline"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                            onClick={() => openCancelModal(a.appointment_id)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BOOK TOKEN MODAL */}
      {showBookModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#fafbfa', borderRadius: '16px', width: '100%', maxWidth: '600px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0',
              position: 'sticky', top: 0, background: '#fafbfa', zIndex: 10,
              borderTopLeftRadius: '16px', borderTopRightRadius: '16px'
            }}>
              <h3 style={{ color: '#0f172a', fontWeight: 800, margin: 0 }}>Book Token</h3>
              <button onClick={() => setShowBookModal(false)} style={{
                background: 'transparent', border: 'none', color: '#64748b',
                fontSize: '1.5rem', cursor: 'pointer'
              }}>&times;</button>
            </div>

            <form onSubmit={handleBook} className="inline-form" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="form-group">
                  <label className="form-label">Doctor <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <select required className="form-control"
                      value={bookingForm.doctor_id}
                      onChange={e => setBookingForm({ ...bookingForm, doctor_id: e.target.value, availability_id: '', session: '', token_number: '' })}>
                      <option value="">Select Doctor</option>
                      {doctors.map(d => (
                        <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="date" required className="form-control"
                      min={today}
                      value={bookingForm.appointment_date}
                      onChange={e => setBookingForm({ ...bookingForm, appointment_date: e.target.value, availability_id: '', token_number: '' })} />
                  </div>
                </div>
              </div>

              {!availability && bookingForm.doctor_id && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                  padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem',
                  fontSize: '0.85rem'
                }}>
                  ⚠️ Doctor is not available on this date or is on leave.
                </div>
              )}

              {availability && (
                <>
                  <div className="form-group">
                    <label className="form-label">Session</label>
                    <div>
                      <input type="text" readOnly className="form-control"
                        value={`${availability.session || bookingForm.session} (${availability.start_time?.slice(0,5)})`} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Select a Token <span style={{ color: '#ef4444' }}>*</span></label>
                    <div>
                      <TokenGrid
                        tokens={tokenMap?.tokens}
                        selectedToken={bookingForm.token_number}
                        onSelect={(n, t) => setBookingForm({
                          ...bookingForm,
                          token_number: n,
                          booking_source: t?.booking_source === 'online' ? 'online' : 'walk_in'
                        })}
                        loading={loadingTokens}
                        emptyText="No tokens available — the doctor may be on leave or fully booked."
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="form-group">
                      <label className="form-label">Patient Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <div>
                        <input type="text" required className="form-control"
                          value={bookingForm.patient_name}
                          onChange={e => setBookingForm({ ...bookingForm, patient_name: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Patient Phone <span style={{ color: '#ef4444' }}>*</span></label>
                      <div>
                        <input type="text" required className="form-control" pattern="[6-9][0-9]{9}"
                          placeholder="10-digit number"
                          value={bookingForm.patient_phone}
                          onChange={e => setBookingForm({ ...bookingForm, patient_phone: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Phone 2</label>
                      <div>
                        <input type="text" className="form-control" pattern="[6-9][0-9]{9}"
                          value={bookingForm.patient_alt_phone}
                          onChange={e => setBookingForm({ ...bookingForm, patient_alt_phone: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Patient Address</label>
                      <div>
                        <input type="text" className="form-control"
                          value={bookingForm.patient_address}
                          onChange={e => setBookingForm({ ...bookingForm, patient_address: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Age</label>
                      <div>
                        <input type="number" className="form-control" min="0" max="150"
                          value={bookingForm.patient_age}
                          onChange={e => setBookingForm({ ...bookingForm, patient_age: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Gender</label>
                      <div>
                        <select className="form-control" value={bookingForm.patient_gender} onChange={e => setBookingForm({ ...bookingForm, patient_gender: e.target.value })}>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div style={{
                display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
                marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0'
              }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowBookModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!availability || !bookingForm.token_number || booking}>
                  {booking ? 'Booking...' : 'Book Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CANCEL APPOINTMENT MODAL */}
      {cancelTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#fafbfa', borderRadius: '16px', width: '100%', maxWidth: '420px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '1.5rem'
          }}>
            <h3 style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 0.35rem' }}>Cancel Appointment</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Are you sure you want to cancel this appointment? Optionally add a reason.
            </p>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Reason (optional)"
              value={cancelRemark}
              onChange={e => setCancelRemark(e.target.value)}
              style={{ resize: 'vertical', marginBottom: '1.25rem' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setCancelTarget(null); setCancelRemark(''); }}
                disabled={cancelling}
              >
                Go Back
              </button>
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={confirmCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicAppointments;