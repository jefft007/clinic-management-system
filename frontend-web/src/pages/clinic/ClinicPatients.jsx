import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const initials = (name) =>
  (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const AVATAR_COLORS = ['#2563eb', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'];
const avatarColor = (id) => AVATAR_COLORS[Number(id) % AVATAR_COLORS.length];

const ClinicPatients = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [form, setForm] = useState({
    full_name: '', phone: '', alternate_phone: '', address: '',
    age: '', gender: 'Other', place: ''
  });
  const [editingPatient, setEditingPatient] = useState(null);
  
  // View Details State
  const [detailsModal, setDetailsModal] = useState({ open: false, data: null });
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const res = await api.get('/clinic/patients');
      if (res.data.success) setPatients(res.data.patients);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPatients(); }, []);

  const handleAdd = () => {
    setEditingPatient(null);
    setForm({ full_name: '', phone: '', alternate_phone: '', address: '', age: '', gender: 'Other', place: '' });
    setErrorMsg('');
    setShowModal(true);
  };

  const handleEdit = (p) => {
    setEditingPatient(p.patient_id);
    setForm({
      full_name: p.full_name || '',
      phone: p.phone || '',
      alternate_phone: p.alternate_phone || '',
      address: p.address || '',
      age: p.age || '',
      gender: p.gender || 'Other',
      place: p.place || ''
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const handleViewDetails = async (id) => {
    setDetailsModal({ open: true, data: null });
    setDetailsLoading(true);
    try {
      const res = await api.get(`/clinic/patients/${id}/details`);
      if (res.data.success) {
        setDetailsModal({ open: true, data: res.data });
      }
    } catch (err) {
      showToast('Failed to load patient details', 'error');
      setDetailsModal({ open: false, data: null });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');

    if (!/^[6-9]\d{9}$/.test(form.phone)) {
      setErrorMsg('Please enter a valid 10-digit phone number starting with 6-9.');
      setSaving(false);
      return;
    }
    if (form.alternate_phone && !/^[6-9]\d{9}$/.test(form.alternate_phone)) {
      setErrorMsg('Please enter a valid 10-digit alternate phone number starting with 6-9.');
      setSaving(false);
      return;
    }

    try {
      if (editingPatient) {
        await api.put(`/clinic/patients/${editingPatient}`, form);
        showToast('Patient updated successfully');
      } else {
        await api.post('/clinic/patients', form);
        showToast('Patient added successfully');
      }
      setShowModal(false);
      fetchPatients();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to save patient');
    } finally {
      setSaving(false);
    }
  };

  const filteredPatients = patients.filter(p =>
    p.full_name.toLowerCase().includes(appliedSearch.toLowerCase()) ||
    p.phone.includes(appliedSearch)
  );
  const totalPatients = patients.length;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <span>Loading clinic patients...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 3000,
          background: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', padding: '0.85rem 1.25rem',
          borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.9rem', fontWeight: 600, maxWidth: '380px'
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.message}
        </div>
      )}

      <div className="page-header flex justify-between items-center" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Clinic Patients</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>All patients who visited or registered at your clinic</p>
          </div>
          {/* Proper stat badge for total patient count, separate from the
              search-filtered list below so it never changes while typing
              in the search box. Uses --text-primary (solid white) for the
              number instead of --primary-light-on-glow, which was too low
              contrast to read clearly. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderLeft: '3px solid var(--primary-light)',
            borderRadius: 10, padding: '0.4rem 0.9rem',
          }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {totalPatients}
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total<br />Patient{totalPatients === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleAdd}>
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Add Patient
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <input
          type="text"
          placeholder="Search by name or phone..."
          className="form-control"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') setAppliedSearch(search); }}
          style={{ maxWidth: '400px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
        />
        <button className="btn btn-primary" style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem' }} onClick={() => setAppliedSearch(search)}>Apply</button>
        {appliedSearch && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Showing {filteredPatients.length} of {totalPatients}
          </span>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper" style={{ borderRadius: 0, border: 'none', maxHeight: 'calc(100vh - 210px)', overflowY: 'auto', marginBottom: 0 }}>
          <table style={{ fontSize: '0.88rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-elevated)' }}>
              <tr>
                <th style={{ padding: '0.55rem 0.9rem' }}>ID</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Name</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Phone</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Age / Gender</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Place</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Appointments</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Last Visit</th>
                <th style={{ padding: '0.55rem 0.9rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                    {appliedSearch ? 'No patients match your search.' : 'No patients found. Patients who book tokens will appear here automatically.'}
                  </td>
                </tr>
              ) : (
                filteredPatients.map((p) => (
                  <tr key={p.patient_id} style={{ height: '2.9rem' }}>
                    <td style={{ padding: '0.4rem 0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>#{p.patient_id}</td>
                    <td style={{ padding: '0.4rem 0.9rem', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                          background: `linear-gradient(135deg, ${avatarColor(p.patient_id)}, #06b6d4)`, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '0.62rem',
                        }}>
                          {initials(p.full_name)}
                        </div>
                        <strong style={{ fontSize: '0.85rem' }}>{p.full_name}</strong>
                      </div>
                    </td>
                    {/* Alt phone shown inline (·-separated) instead of on its
                        own line, so this cell never grows taller than one
                        row — that variable 2-line height was the main thing
                        eating vertical space and cutting rows-per-screen. */}
                    <td style={{ padding: '0.4rem 0.9rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.98rem', fontWeight: 600 }}>{p.phone}</span>
                      {p.alternate_phone && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {p.alternate_phone}</span>}
                    </td>
                    <td style={{ padding: '0.4rem 0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {p.age ? `${p.age}y` : '—'}{p.gender && p.gender !== 'Other' && <span style={{ color: 'var(--text-muted)' }}> / {p.gender}</span>}
                    </td>
                    <td style={{ padding: '0.4rem 0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.place || p.address || '—'}</td>
                    <td style={{ padding: '0.4rem 0.9rem' }}>
                      <span style={{
                        background: 'var(--primary-glow)', color: 'var(--primary-light)',
                        borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.76rem', fontWeight: 700
                      }}>
                        {p.total_appointments || 0}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(p.last_visit)}</td>
                    <td style={{ padding: '0.4rem 0.9rem', whiteSpace: 'nowrap' }}>
                      <div className="action-buttons">
                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.76rem' }} onClick={() => handleViewDetails(p.patient_id)}>
                          👁 Details
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.76rem' }} onClick={() => handleEdit(p)}>
                          ✏️ Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Patient Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#101d2c', borderRadius: '16px', padding: '0',
            width: '100%', maxWidth: '550px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            maxHeight: '90vh', overflowY: 'auto', border: '1px solid #24384d'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid #24384d',
              position: 'sticky', top: 0, background: '#101d2c', zIndex: 10,
              borderTopLeftRadius: '16px', borderTopRightRadius: '16px'
            }}>
              <h3 style={{ color: '#f1f5f9', fontWeight: 800, margin: 0 }}>
                {editingPatient ? 'Edit Patient' : 'Add New Patient'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{
                background: 'transparent', border: 'none', color: '#94a3b8',
                fontSize: '1.5rem', cursor: 'pointer', padding: '0.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }} title="Close">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="inline-form" style={{ padding: '1.5rem' }}>
              {errorMsg && (
                <div style={{
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171',
                  padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem',
                  fontSize: '0.85rem', fontWeight: 500
                }}>⚠️ {errorMsg}</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="form-group">
                  <label className="form-label">Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="text" required className="form-control" placeholder="John Doe"
                      value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Phone <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="tel" required className="form-control" placeholder="10-digit number"
                      value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Phone 2</label>
                  <div>
                    <input type="tel" className="form-control" placeholder="Optional"
                      value={form.alternate_phone} onChange={e => setForm({ ...form, alternate_phone: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Age</label>
                  <div>
                    <input type="number" min="0" max="150" className="form-control" placeholder="e.g. 35"
                      value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <div>
                    <select className="form-control" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Place</label>
                  <div>
                    <input type="text" className="form-control" placeholder="City / Town"
                      value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Address <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <textarea required className="form-control" placeholder="Patient's address" rows="3"
                      value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
                marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #24384d'
              }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}
                  disabled={saving} style={{ borderRadius: '8px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ borderRadius: '8px' }}>
                  {saving ? 'Saving...' : (editingPatient ? 'Save Changes' : 'Add Patient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {detailsModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#101d2c', borderRadius: '16px', padding: '0',
            width: '100%', maxWidth: '760px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            maxHeight: '92vh', overflowY: 'auto', border: '1px solid #24384d'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid #24384d',
              position: 'sticky', top: 0, background: '#101d2c', zIndex: 10,
              borderTopLeftRadius: '16px', borderTopRightRadius: '16px'
            }}>
              <h3 style={{ color: '#f1f5f9', fontWeight: 800, margin: 0 }}>Patient Profile</h3>
              <button onClick={() => setDetailsModal({ open: false, data: null })} style={{
                background: 'transparent', border: 'none', color: '#94a3b8',
                fontSize: '1.5rem', cursor: 'pointer', padding: '0.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>&times;</button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {detailsLoading || !detailsModal.data ? (
                <div className="loading-screen" style={{ minHeight: '200px' }}>
                  <div className="spinner"></div><span>Loading details...</span>
                </div>
              ) : (
                <>
                  {/* Patient Info */}
                  <div style={{
                    background: '#182a3d', padding: '1.25rem', borderRadius: '12px',
                    border: '1px solid #24384d', marginBottom: '1.5rem'
                  }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '0.5rem', marginTop: 0 }}>
                      {detailsModal.data.patient.full_name}
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                      <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Phone:</span> <br/><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{detailsModal.data.patient.phone}</span></div>
                      <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Age / Gender:</span> <br/><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{detailsModal.data.patient.age || '—'} yrs / {detailsModal.data.patient.gender}</span></div>
                      <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Place:</span> <br/><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{detailsModal.data.patient.place || '—'}</span></div>
                      <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#94a3b8', fontWeight: 600 }}>Address:</span> <br/><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{detailsModal.data.patient.address || '—'}</span></div>
                    </div>
                  </div>

                  {/* Doctors Visited */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Doctors Visited
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {detailsModal.data.doctorsVisited.length === 0 && <span style={{ fontSize: '0.85rem', color: '#64748b' }}>None recorded.</span>}
                      {detailsModal.data.doctorsVisited.map((d, i) => (
                        <div key={i} style={{ background: 'rgba(45,212,191,0.14)', color: '#5eead4', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
                          Dr. {d.doctor_name} <span style={{ opacity: 0.75, fontWeight: 400 }}>({d.specialization})</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Appointment History — styled fully inline (not via the
                      global .table-wrapper/table CSS) so it always reads
                      correctly on this modal's dark navy background,
                      regardless of which theme (light/dark) the app is
                      currently on. */}
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Appointment History ({detailsModal.data.appointments.length})
                    </h4>
                    <div style={{ maxHeight: '380px', overflowY: 'auto', borderRadius: '10px', border: '1px solid #24384d' }}>
                      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', background: '#182a3d' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr>
                            <th style={{ background: '#1c2e42', color: '#5eead4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.65rem 1rem', textAlign: 'left', borderBottom: '1px solid #24384d' }}>Date</th>
                            <th style={{ background: '#1c2e42', color: '#5eead4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.65rem 1rem', textAlign: 'left', borderBottom: '1px solid #24384d' }}>Doctor</th>
                            <th style={{ background: '#1c2e42', color: '#5eead4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.65rem 1rem', textAlign: 'left', borderBottom: '1px solid #24384d' }}>Session</th>
                            <th style={{ background: '#1c2e42', color: '#5eead4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.65rem 1rem', textAlign: 'left', borderBottom: '1px solid #24384d' }}>Token</th>
                            <th style={{ background: '#1c2e42', color: '#5eead4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.65rem 1rem', textAlign: 'left', borderBottom: '1px solid #24384d' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailsModal.data.appointments.length === 0 && (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>No appointments found.</td>
                            </tr>
                          )}
                          {detailsModal.data.appointments.map((a, i) => (
                            <tr key={i} style={{ borderBottom: i === detailsModal.data.appointments.length - 1 ? 'none' : '1px solid #24384d' }}>
                              <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>{formatDate(a.appointment_date)}</td>
                              <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1', fontWeight: 500 }}>{a.doctor_name}</td>
                              <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>{a.session}</td>
                              <td style={{ padding: '0.65rem 1rem' }}><strong style={{ color: '#5eead4' }}>#{a.token_number}</strong></td>
                              <td style={{ padding: '0.65rem 1rem' }}>
                                <span style={{
                                  padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                                  background: a.status === 'Completed' ? 'rgba(34,197,94,0.16)' : a.status === 'Cancelled' ? 'rgba(239,68,68,0.16)' : 'rgba(148,163,184,0.16)',
                                  color: a.status === 'Completed' ? '#4ade80' : a.status === 'Cancelled' ? '#f87171' : '#cbd5e1'
                                }}>
                                  {a.status === 'Completed' ? 'Consulted' : a.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicPatients;