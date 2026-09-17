import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';

const STATUS_COLORS = {
  Booked:      { bg: '#dbeafe', color: '#1d4ed8' },
  Reserved:    { bg: '#fff1ec', color: '#c2410c' },
  Waiting:     { bg: '#e0e7ff', color: '#4338ca' },
  'In Progress': { bg: '#fef3c7', color: '#b45309' },
  Completed:   { bg: '#d1fae5', color: '#065f46' },
  Cancelled:   { bg: '#fee2e2', color: '#b91c1c' },
  Absent:      { bg: '#fee2e2', color: '#991b1b' },
  Skipped:     { bg: '#f3f4f6', color: '#4b5563' },
};

const fmtTime = (iso) => {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const STATUS_LABELS = { Completed: 'Consulted', Reserved: 'Blocked' };
const displayStatus = (status) => STATUS_LABELS[status] || status;

const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: '20px', padding: '0.28rem 0.8rem',
      fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
      letterSpacing: '0.01em'
    }}>{displayStatus(status)}</span>
  );
};

const DoctorAppointments = () => {
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const today = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  })();

  const [filters, setFilters] = useState({
    from_date: searchParams.get('from_date') || today,
    to_date: searchParams.get('to_date') || today,
    session: '',
    status: searchParams.get('status') || ''
  });

  const [absentTarget, setAbsentTarget] = useState(null);
  const [absentRemark, setAbsentRemark] = useState('');
  const [markingAbsent, setMarkingAbsent] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelRemark, setCancelRemark] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAppointments = useCallback(async (overrideFilters, isPolling = false) => {
    const f = overrideFilters || filters;
    try {
      if (!isPolling) setLoading(true);
      const params = new URLSearchParams();
      if (f.from_date) params.set('from_date', f.from_date);
      if (f.to_date)   params.set('to_date',   f.to_date);
      if (f.session)   params.set('session',   f.session);
      if (f.status)    params.set('status',    f.status);

      const res = await api.get(`/doctor/appointments?${params.toString()}`);
      if (res.data.success) setAppointments(res.data.appointments);
    } catch (err) {
      console.error(err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAppointments();
    const interval = setInterval(() => fetchAppointments(null, true), 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = appointments.reduce((acc, appt) => {
    const dateKey = new Date(appt.appointment_date).toLocaleDateString('en-IN', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(appt);
    return acc;
  }, {});

  const updateStatus = async (id, status, remark) => {
    try {
      const payload = remark !== undefined ? { status, remark } : { status };
      await api.patch(`/doctor/appointments/${id}/status`, payload);
      showToast(`Appointment status updated to ${displayStatus(status)}`);
      fetchAppointments();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  const openAbsentModal = (id) => {
    setAbsentTarget(id);
    setAbsentRemark('');
  };

  const confirmMarkAbsent = async () => {
    if (!absentTarget) return;
    setMarkingAbsent(true);
    try {
      await api.patch(`/doctor/appointments/${absentTarget}/status`, {
        status: 'Absent',
        remark: absentRemark.trim() || null,
      });
      showToast('Marked as Absent');
      setAbsentTarget(null);
      setAbsentRemark('');
      fetchAppointments();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setMarkingAbsent(false);
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
      await api.patch(`/doctor/appointments/${cancelTarget}/status`, {
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

  const clearFilters = () => {
    const reset = { from_date: today, to_date: today, session: '', status: '' };
    setFilters(reset);
    fetchAppointments(reset);
  };

  return (
    <div>
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

      <div className="page-header flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Appointments</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{appointments.length} appointment{appointments.length !== 1 ? 's' : ''} found</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
          <div className="filter-group">
            <label className="form-label" style={{ marginBottom: '0.2rem', display: 'block', fontSize: '0.75rem' }}>From Date</label>
            <input type="date" className="form-control" style={{ minWidth: '130px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} value={filters.from_date} onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))} />
          </div>
          <div className="filter-group">
            <label className="form-label" style={{ marginBottom: '0.2rem', display: 'block', fontSize: '0.75rem' }}>To Date</label>
            <input type="date" className="form-control" style={{ minWidth: '130px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} value={filters.to_date} onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))} />
          </div>
          <div className="filter-group">
            <label className="form-label" style={{ marginBottom: '0.2rem', display: 'block', fontSize: '0.75rem' }}>Session</label>
            <select className="form-control" style={{ minWidth: '120px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} value={filters.session} onChange={e => setFilters(f => ({ ...f, session: e.target.value }))}>
              <option value="">All Sessions</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label" style={{ marginBottom: '0.2rem', display: 'block', fontSize: '0.75rem' }}>Status</label>
            <select className="form-control" style={{ minWidth: '120px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              <option value="Booked">Booked</option>
              <option value="Waiting">Waiting</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Consulted</option>
              <option value="Absent">Absent</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => fetchAppointments()} style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', alignSelf: 'flex-end', height: '33px' }}>Apply</button>
          <button className="btn btn-ghost" onClick={clearFilters} style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', alignSelf: 'flex-end', height: '33px' }}>Clear</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner"></div><span>Loading appointments...</span></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📅</div>
          <p style={{ fontSize: '0.9rem' }}>No appointments found for the selected filters.</p>
        </div>
      ) : (
        <div style={{ marginBottom: 0 }}>
          {Object.entries(grouped).map(([dateLabel, appts]) => (
            <div key={dateLabel} className="table-wrapper" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ background: 'var(--primary)', color: '#fff', borderRadius: '6px', padding: '0.25rem 0.85rem', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{dateLabel}</div>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{appts.length} token{appts.length !== 1 ? 's' : ''}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient</th>
                    <th>Session</th>
                    <th>Status</th>
                    <th>Reported</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appts.map(a => (
                    <tr key={a.appointment_id}>
                      <td>
                        {(() => {
                          let bg = 'var(--primary-glow)';
                          let color = 'var(--primary)';
                          switch (a.status) {
                            case 'Completed': bg = 'rgba(16, 185, 129, 0.15)'; color = '#10b981'; break;
                            case 'In Progress': bg = 'rgba(245, 158, 11, 0.15)'; color = '#f59e0b'; break;
                            case 'Waiting': bg = 'rgba(59, 130, 246, 0.15)'; color = '#3b82f6'; break;
                            case 'Booked':
                            case 'Reserved': bg = 'rgba(148, 163, 184, 0.12)'; color = '#94a3b8'; break;
                          }
                          return (
                            <span style={{
                              background: bg, color: color,
                              borderRadius: '8px', padding: '0.25rem 0.65rem',
                              fontSize: '0.92rem', fontWeight: 800, letterSpacing: '0.01em'
                            }}>#{a.token_number}</span>
                          );
                        })()}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.97rem', color: 'var(--text-primary)' }}>{a.patient_name || '—'}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{a.patient_phone}</div>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.95rem' }}>{a.session}</td>
                      <td>
                        <StatusBadge status={a.status} />
                        {a.status === 'Absent' && a.remark && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic', maxWidth: 170 }}>"{a.remark}"</div>
                        )}
                      </td>
                      <td>
                        {a.arrived_time ? (
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>🕐 {fmtTime(a.arrived_time)}</span>
                        ) : (
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {['Booked', 'Reserved'].includes(a.status) && (
                            <button className="btn btn-ghost" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '7px' }} onClick={() => updateStatus(a.appointment_id, 'Waiting')}>Reported</button>
                          )}
                          {['Booked', 'Reserved', 'Waiting'].includes(a.status) && (
                            <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '7px' }} onClick={() => updateStatus(a.appointment_id, 'In Progress')}>Start</button>
                          )}
                          {a.status === 'In Progress' && (
                            <button className="btn btn-success" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '7px' }} onClick={() => updateStatus(a.appointment_id, 'Completed')}>Mark as Consulted</button>
                          )}
                          {a.status === 'Waiting' && (
                            <button className="btn btn-danger-outline" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '7px' }} onClick={() => openAbsentModal(a.appointment_id)}>Absent</button>
                          )}
                          {['Booked', 'Reserved', 'Waiting'].includes(a.status) && (
                            <button className="btn btn-danger-outline" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '7px' }} onClick={() => openCancelModal(a.appointment_id)}>Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {absentTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div style={{ background: '#fafbfa', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '1.5rem' }}>
            <h3 style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 0.35rem' }}>Mark as Absent</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>Optionally add a remark — e.g. "Called, no answer" or "Asked to reschedule".</p>
            <textarea className="form-control" rows={3} placeholder="Remark (optional)" value={absentRemark} onChange={e => setAbsentRemark(e.target.value)} style={{ resize: 'vertical', marginBottom: '1.25rem' }} autoFocus />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setAbsentTarget(null); setAbsentRemark(''); }} disabled={markingAbsent}>Cancel</button>
              <button type="button" className="btn btn-danger-outline" onClick={confirmMarkAbsent} disabled={markingAbsent}>{markingAbsent ? 'Saving...' : 'Mark Absent'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div style={{ background: '#fafbfa', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '1.5rem' }}>
            <h3 style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 0.35rem' }}>Cancel Appointment</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>Are you sure you want to cancel this appointment? Optionally add a reason.</p>
            <textarea className="form-control" rows={3} placeholder="Reason (optional)" value={cancelRemark} onChange={e => setCancelRemark(e.target.value)} style={{ resize: 'vertical', marginBottom: '1.25rem' }} autoFocus />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setCancelTarget(null); setCancelRemark(''); }} disabled={cancelling}>Go Back</button>
              <button type="button" className="btn btn-danger-outline" onClick={confirmCancel} disabled={cancelling}>{cancelling ? 'Cancelling...' : 'Confirm Cancel'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorAppointments;
