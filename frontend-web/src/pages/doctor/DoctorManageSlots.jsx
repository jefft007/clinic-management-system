import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';

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
const tokensFromAvg = (startTime, endTime, avgMinutes) => calcTokens(startTime, endTime, avgMinutes);

const SESSION_DEFAULTS = {
  Morning: { start_time: '09:00', end_time: '13:00', total_tokens: 16, is_leave: false },
  Evening: { start_time: '17:00', end_time: '21:00', total_tokens: 16, is_leave: false },
};

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

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
      background: isSuccess ? '#052e16' : '#450a0a', color: isSuccess ? '#4ade80' : '#f87171',
      border: `1px solid ${isSuccess ? '#166534' : '#991b1b'}`,
      borderRadius: 12, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: '0.875rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '0.6rem',
      animation: 'fadeInUp 0.3s ease', maxWidth: 380,
    }}>
      <span>{isSuccess ? '✅' : '⚠️'}</span>
      <span>{msg.text}</span>
    </div>
  );
};

const InlineMsg = ({ msg }) => {
  if (!msg) return null;
  const isSuccess = msg.type === 'success';
  return (
    <div style={{
      padding: '0.65rem 1rem', borderRadius: 8, marginBottom: '1rem',
      background: isSuccess ? '#f0fdf4' : '#fef2f2', color: isSuccess ? '#16a34a' : '#dc2626',
      border: `1px solid ${isSuccess ? '#bbf7d0' : '#fecaca'}`, fontSize: '0.85rem', fontWeight: 600,
    }}>
      {isSuccess ? '✅ ' : '⚠️ '}{msg.text}
    </div>
  );
};

const DoctorManageSlots = () => {
  const [activeTab, setActiveTab] = useState('regular'); // 'regular' or 'specific'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // --- Regular Schedule State ---
  const [regSchedule, setRegSchedule] = useState({});
  const [regMsg, setRegMsg] = useState(null);

  // --- Specific Dates State ---
  const [availabilities, setAvailabilities] = useState([]);
  const [monthRange, setMonthRange] = useState({
    from: today(),
    to: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
  });

  const [modalMode, setModalMode] = useState(null); // 'create', 'edit'
  const [modalData, setModalData] = useState(null);
  const [modalMsg, setModalMsg] = useState(null);

  const [confirmLeave, setConfirmLeave] = useState(null); // { id, force, message }

  const showToast = (text, type = 'success') => setToast({ text, type });

  // --- Load Regular Schedule ---
  const loadRegularSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/doctor/regular-schedule');
      if (res.data.success) {
        const sched = {};
        DAYS.forEach(d => { sched[d.value] = { Morning: null, Evening: null }; });
        res.data.schedule.forEach(slot => {
          if (sched[slot.day_of_week]) {
            sched[slot.day_of_week][slot.session] = {
              ...slot,
              total_tokens: tokensFromAvg(slot.start_time, slot.end_time, slot.average_consultation_minutes)
            };
          }
        });
        setRegSchedule(sched);
      }
    } catch (err) {
      setRegMsg({ type: 'error', text: 'Failed to load regular schedule' });
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Load Specific Dates ---
  const loadSpecificDates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/doctor/availability?from_date=${monthRange.from}&to_date=${monthRange.to}`);
      if (res.data.success) {
        setAvailabilities(res.data.availability || []);
      }
    } catch (err) {
      showToast('Failed to load specific dates', 'error');
    } finally {
      setLoading(false);
    }
  }, [monthRange]);

  useEffect(() => {
    if (activeTab === 'regular') loadRegularSchedule();
    else loadSpecificDates();
  }, [activeTab, loadRegularSchedule, loadSpecificDates]);


  // --- Regular Handlers ---
  const handleRegToggle = (day, session) => {
    setRegSchedule(prev => {
      const p = { ...prev };
      if (p[day][session]) {
        p[day][session] = null;
      } else {
        p[day][session] = { ...SESSION_DEFAULTS[session] };
      }
      return p;
    });
  };

  const handleRegChange = (day, session, field, val) => {
    setRegSchedule(prev => {
      const p = { ...prev };
      p[day][session][field] = val;
      return p;
    });
  };

  const saveRegularSchedule = async () => {
    setSaving(true);
    setRegMsg(null);
    const payload = [];
    Object.keys(regSchedule).forEach(day => {
      ['Morning', 'Evening'].forEach(sess => {
        const s = regSchedule[day][sess];
        if (s) {
          payload.push({
            day_of_week: Number(day),
            session: sess,
            start_time: s.start_time,
            end_time: s.end_time,
            average_consultation_minutes: avgFromTokens(s.start_time, s.end_time, Number(s.total_tokens))
          });
        }
      });
    });

    try {
      const res = await api.put('/doctor/regular-schedule', { schedule: payload });
      if (res.data.success) {
        setRegMsg({ type: 'success', text: 'Regular schedule updated. Future specific dates have been recalculated.' });
      }
    } catch (err) {
      setRegMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };


  // --- Specific Date Handlers ---
  const openCreateModal = () => {
    setModalData({
      available_date: today(),
      session: 'Morning',
      ...SESSION_DEFAULTS['Morning']
    });
    setModalMode('create');
    setModalMsg(null);
  };

  const openEditModal = (slot) => {
    setModalData({
      ...slot,
      total_tokens: tokensFromAvg(slot.start_time, slot.end_time, slot.average_consultation_minutes)
    });
    setModalMode('edit');
    setModalMsg(null);
  };

  const saveModal = async () => {
    setSaving(true);
    setModalMsg(null);
    try {
      const payload = {
        available_date: modalData.available_date,
        session: modalData.session,
        start_time: modalData.start_time,
        end_time: modalData.end_time,
        total_tokens: modalData.total_tokens,
        average_consultation_minutes: avgFromTokens(modalData.start_time, modalData.end_time, Number(modalData.total_tokens))
      };

      if (modalMode === 'create') {
        await api.post('/doctor/availability', payload);
        showToast('Slot created');
      } else {
        await api.put(`/doctor/availability/${modalData.availability_id}`, payload);
        showToast('Slot updated');
      }
      setModalMode(null);
      loadSpecificDates();
    } catch (err) {
      setModalMsg({ type: 'error', text: err.response?.data?.message || 'Error saving slot' });
    } finally {
      setSaving(false);
    }
  };

  const toggleLeave = async (id, currentIsLeave, force = false) => {
    try {
      const res = await api.patch(`/doctor/availability/${id}/leave`, { is_leave: !currentIsLeave, force });
      if (res.data.requires_confirmation) {
        setConfirmLeave({ id, message: res.data.message });
      } else {
        showToast(res.data.message);
        loadSpecificDates();
        setConfirmLeave(null);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to toggle leave', 'error');
    }
  };

  const resetToSchedule = async (id) => {
    try {
      await api.post(`/doctor/availability/${id}/reset`);
      showToast('Slot reset to regular schedule');
      loadSpecificDates();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reset', 'error');
    }
  };


  return (
    <div>
      <Toast msg={toast} onDone={() => setToast(null)} />

      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Manage Slots & Availability</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Configure your regular weekly schedule or override specific dates.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('regular')}
          style={{
            background: 'none', border: 'none', padding: '0.75rem 0.25rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === 'regular' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'regular' ? 'var(--primary)' : 'var(--text-muted)'
          }}
        >
          Regular Schedule
        </button>
        <button
          onClick={() => setActiveTab('specific')}
          style={{
            background: 'none', border: 'none', padding: '0.75rem 0.25rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === 'specific' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'specific' ? 'var(--primary)' : 'var(--text-muted)'
          }}
        >
          Specific Dates & Leaves
        </button>
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
      ) : activeTab === 'regular' ? (
        /* ── REGULAR SCHEDULE TAB ── */
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
          <InlineMsg msg={regMsg} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {DAYS.map(day => (
              <div key={day.value} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ background: 'var(--bg-elevated)', padding: '0.65rem 1rem', fontWeight: 700, borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
                  <span style={{ width: '40px' }}>{day.label}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!regSchedule[day.value]?.Morning} onChange={() => handleRegToggle(day.value, 'Morning')} /> Morning
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!regSchedule[day.value]?.Evening} onChange={() => handleRegToggle(day.value, 'Evening')} /> Evening
                  </label>
                </div>

                <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {['Morning', 'Evening'].map(sess => {
                    const s = regSchedule[day.value]?.[sess];
                    if (!s) return null;
                    return (
                      <div key={sess} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-base)', padding: '0.65rem 1rem', borderRadius: 6, border: '1px dashed var(--border)' }}>
                        <div style={{ width: '70px', fontWeight: 600, fontSize: '0.85rem' }}>{sess}</div>
                        
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input type="time" className="form-control" style={{ width: '110px', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} value={s.start_time.slice(0,5)} onChange={e => handleRegChange(day.value, sess, 'start_time', e.target.value)} required />
                          <span style={{ color: 'var(--text-muted)' }}>to</span>
                          <input type="time" className="form-control" style={{ width: '110px', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} value={s.end_time.slice(0,5)} onChange={e => handleRegChange(day.value, sess, 'end_time', e.target.value)} required />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: 'auto' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tokens:</span>
                          <input type="number" className="form-control" style={{ width: '70px', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} min="1" max="100" value={s.total_tokens || ''} onChange={e => handleRegChange(day.value, sess, 'total_tokens', e.target.value)} required />
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '70px', textAlign: 'right' }}>
                            (~{avgFromTokens(s.start_time, s.end_time, s.total_tokens)} min/pt)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {!regSchedule[day.value]?.Morning && !regSchedule[day.value]?.Evening && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions active for {day.label}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveRegularSchedule} disabled={saving}>
              {saving ? 'Saving...' : 'Save Regular Schedule'}
            </button>
          </div>
        </div>
      ) : (
        /* ── SPECIFIC DATES TAB ── */
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>From Date</label>
                <input type="date" className="form-control" style={{ padding: '0.35rem', fontSize: '0.85rem' }} value={monthRange.from} onChange={e => setMonthRange(p => ({ ...p, from: e.target.value }))} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>To Date</label>
                <input type="date" className="form-control" style={{ padding: '0.35rem', fontSize: '0.85rem' }} value={monthRange.to} onChange={e => setMonthRange(p => ({ ...p, to: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={openCreateModal} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              + Add Override Slot
            </button>
          </div>

          {availabilities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No slots found in this date range.
            </div>
          ) : (
            <div className="table-wrapper">
              <table style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>Time</th>
                    <th>Tokens</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {availabilities.map(slot => (
                    <tr key={slot.availability_id} style={{ opacity: slot.is_leave ? 0.6 : 1, background: slot.is_override ? 'var(--bg-elevated)' : 'transparent' }}>
                      <td><strong>{fmtDate(slot.available_date)}</strong></td>
                      <td>{slot.session}</td>
                      <td>{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}</td>
                      <td>
                        <strong>{tokensFromAvg(slot.start_time, slot.end_time, slot.average_consultation_minutes)}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.4rem' }}>
                          ({slot.average_consultation_minutes}m)
                        </span>
                      </td>
                      <td>
                        {slot.is_leave ? <span className="badge badge-danger">Leave</span> : <span className="badge badge-success">Active</span>}
                        {slot.is_override === 1 && !slot.is_leave && <span className="badge badge-warning" style={{ marginLeft: '0.4rem' }}>Override</span>}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openEditModal(slot)} disabled={slot.is_leave}>
                            Edit
                          </button>
                          <button className={`btn ${slot.is_leave ? 'btn-ghost' : 'btn-danger-outline'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleLeave(slot.availability_id, slot.is_leave)}>
                            {slot.is_leave ? 'Cancel Leave' : 'Mark Leave'}
                          </button>
                          {slot.is_override === 1 && (
                            <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }} onClick={() => resetToSchedule(slot.availability_id)}>
                              Reset
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
      )}

      {/* ── MODALS ── */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-base)', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>{modalMode === 'create' ? 'Create Custom Slot' : 'Edit Slot'}</h3>
            <InlineMsg msg={modalMsg} />

            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Date</label>
                <input type="date" className="form-control" value={modalData.available_date.slice(0,10)} onChange={e => setModalData({...modalData, available_date: e.target.value})} disabled={modalMode === 'edit'} />
              </div>
              
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Session</label>
                <select className="form-control" value={modalData.session} onChange={e => setModalData({...modalData, session: e.target.value})} disabled={modalMode === 'edit'}>
                  <option value="Morning">Morning</option>
                  <option value="Evening">Evening</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Time</label>
                  <input type="time" className="form-control" value={modalData.start_time.slice(0,5)} onChange={e => setModalData({...modalData, start_time: e.target.value})} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>End Time</label>
                  <input type="time" className="form-control" value={modalData.end_time.slice(0,5)} onChange={e => setModalData({...modalData, end_time: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Total Tokens</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="number" className="form-control" min="1" max="150" value={modalData.total_tokens || ''} onChange={e => setModalData({...modalData, total_tokens: e.target.value})} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    (~{avgFromTokens(modalData.start_time, modalData.end_time, modalData.total_tokens)} min/patient)
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setModalMode(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveModal} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: 'var(--bg-base)', borderRadius: '12px', maxWidth: '400px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--danger)' }}>Confirm Leave</h3>
            <p style={{ fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>{confirmLeave.message}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmLeave(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => toggleLeave(confirmLeave.id, false, true)}>Force Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorManageSlots;
