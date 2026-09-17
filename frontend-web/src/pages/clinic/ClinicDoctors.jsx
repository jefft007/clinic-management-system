import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const initials = (name) =>
  (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const AVATAR_COLORS = ['#2563eb', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'];
const avatarColor = (id) => AVATAR_COLORS[Number(id) % AVATAR_COLORS.length];

// ── Reusable confirmation modal ──────────────────────
const ConfirmDialog = ({ isOpen, title, message, subMessage, onConfirm, onCancel, confirmLabel = 'Confirm', confirmClass = 'btn-danger' }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, backdropFilter: 'blur(4px)', padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '16px', padding: '2rem',
        width: '100%', maxWidth: '440px', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem', textAlign: 'center' }}>⚠️</div>
        <h3 style={{ textAlign: 'center', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: subMessage ? '0.5rem' : '1.5rem', fontSize: '0.9rem' }}>{message}</p>
        {subMessage && (
          <p style={{
            textAlign: 'center', color: 'var(--warning)', fontSize: '0.8rem',
            background: 'var(--warning-bg)', padding: '0.6rem 1rem',
            borderRadius: '8px', marginBottom: '1.5rem'
          }}>{subMessage}</p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ minWidth: '100px' }}>Cancel</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm} style={{ minWidth: '100px' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

// ── Toast notification ────────────────────────────────
const Toast = ({ toast }) => {
  if (!toast) return null;
  const colors = {
    success: { bg: '#10b981', icon: '✓' },
    error: { bg: '#ef4444', icon: '✗' },
    warning: { bg: '#f59e0b', icon: '⚠' }
  };
  const c = colors[toast.type] || colors.success;
  return (
    <div style={{
      position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 3000,
      background: c.bg, color: '#fff', padding: '0.85rem 1.25rem',
      borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      fontSize: '0.9rem', fontWeight: 600, maxWidth: '380px',
      animation: 'slideInUp 0.3s ease'
    }}>
      <span style={{ fontSize: '1.1rem' }}>{c.icon}</span>
      {toast.message}
    </div>
  );
};

// ── Details modal — everything about the doctor in one view,
// nothing tucked behind tabs or "show more" ──────────────
const DetailRow = ({ label, value }) => (
  <div style={{ padding: '0.6rem 0', borderBottom: '1px solid #24384d' }}>
    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>
      {label}
    </div>
    <div style={{ fontSize: '0.9rem', color: '#f1f5f9', fontWeight: 600 }}>
      {value || <span style={{ color: '#64748b', fontWeight: 400 }}>Not provided</span>}
    </div>
  </div>
);

const DoctorDetailsModal = ({ doctor, onClose, onEdit }) => {
  if (!doctor) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)', padding: '1rem'
    }}>
      <div style={{
        background: '#101d2c', borderRadius: '16px', padding: '0',
        width: '100%', maxWidth: '600px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        maxHeight: '90vh', overflowY: 'auto', border: '1px solid #24384d'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem 1.5rem', borderBottom: '1px solid #24384d',
          position: 'sticky', top: 0, background: '#101d2c', zIndex: 10,
          borderTopLeftRadius: '16px', borderTopRightRadius: '16px'
        }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontWeight: 800, margin: 0 }}>{doctor.full_name}</h3>
            <div style={{ marginTop: '0.3rem' }}>
              {doctor.status === 'Active'
                ? <span className="badge badge-success">Active</span>
                : <span className="badge badge-danger">Inactive</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#94a3b8',
            fontSize: '1.5rem', cursor: 'pointer', padding: '0.2rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }} title="Close">&times;</button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
            <DetailRow label="Specialization" value={doctor.specialization} />
            <DetailRow label="Qualification" value={doctor.qualification} />
            <DetailRow label="Designation" value={doctor.designation} />
            <DetailRow label="Phone" value={doctor.phone} />
            <DetailRow label="Phone 2" value={doctor.alternate_phone} />
            <DetailRow label="Email" value={doctor.email} />
            <DetailRow label="Consultation Fee" value={doctor.consultation_fee != null ? `₹${doctor.consultation_fee}` : ''} />
          </div>

          <div style={{
            display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
            marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #24384d'
          }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '8px' }}>Close</button>
            <button className="btn btn-primary" onClick={() => onEdit(doctor)} style={{ borderRadius: '8px' }}>Edit</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClinicDoctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [toast, setToast] = useState(null);
  const [detailsDoc, setDetailsDoc] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', alternate_phone: '',
    password: '', confirm_password: '', designation: '',
    specialization: '', qualification: '', status: 'Active'
  });
  const [touched, setTouched] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    doctorId: null,
    doctorName: '',
    subMessage: ''
  });

  const validators = {
    full_name: (v) => (!v.trim() ? 'Name is required.' : ''),
    email: (v) => {
      if (!v.trim()) return 'Email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
      return '';
    },
    phone: (v) => (!/^[6-9]\d{9}$/.test(v.trim()) ? 'Enter a valid 10-digit phone number starting with 6-9.' : ''),
    alternate_phone: (v) => (v && !/^[6-9]\d{9}$/.test(v.trim()) ? 'Enter a valid 10-digit phone number starting with 6-9.' : ''),
    specialization: (v) => (!v.trim() ? 'Specialization is required.' : ''),
    qualification: (v) => (!v.trim() ? 'Qualification is required.' : ''),
    password: (v) => (!editingDoc && !v.trim() ? 'Password is required.' : ''),
  };

  const errors = Object.fromEntries(
    Object.entries(validators).map(([field, fn]) => [field, fn(form[field] || '')])
  );

  const setField = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (!touched[field]) setTouched((t) => ({ ...t, [field]: true }));
  };

  const blurField = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const fieldError = (field) => (touched[field] ? errors[field] : '');

  const inputStyle = (field) =>
    fieldError(field) ? { borderColor: '#ef4444' } : undefined;

  const isFormValid = Object.values(errors).every((e) => !e);

  const FieldError = ({ field }) =>
    fieldError(field) ? (
      <div style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '0.3rem' }}>
        {fieldError(field)}
      </div>
    ) : null;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      // This is the doctor *management* page — unlike booking/availability/
      // dashboard screens (which only ever want doctors staff can currently
      // act on), this one needs to show inactive doctors too, or there'd be
      // nothing to click "Activate" on.
      const res = await api.get('/clinic/doctors?include_inactive=true');
      if (res.data.success) setDoctors(res.data.doctors);
    } catch (err) {
      console.error('Failed to fetch doctors:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDoctors(); }, []);

  const handleEdit = (doc) => {
    setEditingDoc(doc.doctor_id);
    setForm({
      full_name: doc.full_name || '',
      email: doc.email || '',
      phone: doc.phone || '',
      alternate_phone: doc.alternate_phone || '',
      password: '',
      designation: doc.designation || '',
      specialization: doc.specialization || '',
      qualification: doc.qualification || '',
      status: doc.status || 'Active'
    });
    setErrorMsg('');
    setTouched({});
    setShowPassword(false);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingDoc(null);
    setForm({
      full_name: '', email: '', phone: '', alternate_phone: '',
      password: '', designation: '', specialization: '',
      qualification: '', status: 'Active'
    });
    setErrorMsg('');
    setTouched({});
    setShowPassword(false);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({
      full_name: true, email: true, phone: true, alternate_phone: true,
      specialization: true, qualification: true, password: true,
    });

    if (!isFormValid) return;

    setSaving(true);
    setErrorMsg('');

    try {
      if (editingDoc) {
        await api.put(`/clinic/doctor/${editingDoc}`, form);
        showToast('Doctor updated successfully');
      } else {
        await api.post('/clinic/doctor', form);
        showToast('Doctor added successfully');
      }
      setShowModal(false);
      fetchDoctors();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to save doctor');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      await api.patch(`/clinic/doctor/${id}/status`, {
        status: currentStatus === 'Active' ? 'Inactive' : 'Active'
      });
      fetchDoctors();
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  // Open delete confirmation — first fetch appointment count info from API
  const handleDeleteClick = (doc) => {
    setDeleteConfirm({
      open: true,
      doctorId: doc.doctor_id,
      doctorName: doc.full_name,
      subMessage: doc.status === 'Active' ? '(Note: To preserve past patient records and appointments, their profile will be securely archived rather than permanently erased.)' : ''
    });
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      const res = await api.delete(`/clinic/doctor/${deleteConfirm.doctorId}`);
      setDeleteConfirm({ open: false, doctorId: null, doctorName: '', subMessage: '' });
      showToast('Doctor deleted and archived successfully');
      fetchDoctors();
    } catch (err) {
      setDeleteConfirm({ open: false, doctorId: null, doctorName: '', subMessage: '' });
      const errMsg = err.response?.data?.message || 'Failed to delete doctor';
      if (err.response?.status === 403) {
        showToast('Permission denied: ' + errMsg, 'error');
      } else {
        showToast(errMsg, 'error');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <span>Loading clinic doctors...</span>
      </div>
    );
  }

  return (
    <div>
      <Toast toast={toast} />

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title={`Delete ${deleteConfirm.doctorName}?`}
        message={`Are you sure you want to permanently delete Dr. ${deleteConfirm.doctorName}? This action cannot be undone.`}
        subMessage={deleteConfirm.subMessage}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, doctorId: null, doctorName: '', subMessage: '' })}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        confirmClass="btn-danger"
      />

      <DoctorDetailsModal
        doctor={detailsDoc}
        onClose={() => setDetailsDoc(null)}
        onEdit={(d) => { setDetailsDoc(null); handleEdit(d); }}
      />

      {/* PAGE HEADER */}
      <div className="page-header flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2>Doctors</h2>
          <p>Manage doctors practicing in your clinic</p>
        </div>
        <button className="btn btn-primary" onClick={handleAdd}>
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span>{' '}Add Doctor
        </button>
      </div>

      {/* DOCTORS TABLE */}
      <div className="table-wrapper card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <th>Doctor</th>
              <th>Specialization</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {doctors.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No doctors found.
                </td>
              </tr>
            ) : (
              doctors.map((d, i) => (
                <tr key={d.doctor_id} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        background: avatarColor(d.doctor_id), color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.02em',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      }}>
                        {initials(d.full_name)}
                      </div>
                      <strong style={{ color: 'var(--text-primary)' }}>{d.full_name}</strong>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      background: 'var(--primary-glow)', color: 'var(--primary-light)',
                      padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                    }}>
                      {d.specialization}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{d.phone}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{d.email}</td>
                  <td>
                    {d.status === 'Active' ? (
                      <span className="badge badge-success">● Active</span>
                    ) : (
                      <span className="badge badge-danger">● Inactive</span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        style={{
                          padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontWeight: 600,
                          background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                        onClick={() => setDetailsDoc(d)}
                      >
                        Details
                      </button>
                      <button
                        style={{
                          padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontWeight: 700,
                          background: 'var(--primary-glow)', color: 'var(--primary-light)', border: '1px solid rgba(37,99,235,0.35)', cursor: 'pointer',
                        }}
                        onClick={() => handleEdit(d)}
                      >
                        Edit
                      </button>
                      <button
                        style={{
                          padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontWeight: 700,
                          background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                        }}
                        onClick={() => handleDeleteClick(d)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ADD / EDIT DOCTOR MODAL */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)', padding: '1rem'
        }}>
          <div style={{
            background: '#101d2c', borderRadius: '16px', padding: '0',
            width: '100%', maxWidth: '900px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            maxHeight: '90vh', overflowY: 'auto', border: '1px solid #24384d'
          }}>
            {/* MODAL HEADER */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid #24384d',
              position: 'sticky', top: 0, background: '#101d2c', zIndex: 10,
              borderTopLeftRadius: '16px', borderTopRightRadius: '16px'
            }}>
              <h3 style={{ color: '#f1f5f9', fontWeight: 800, margin: 0 }}>
                {editingDoc ? 'Edit Doctor' : 'Add New Doctor'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{
                background: 'transparent', border: 'none', color: '#94a3b8',
                fontSize: '1.5rem', cursor: 'pointer', padding: '0.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }} title="Close">&times;</button>
            </div>

            {/* FORM */}
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
                  <label className="form-label">
                    Full Name <span style={{ color: '#ef4444' }}>*</span>
                    <div style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 400, fontSize: '0.78rem' }}>(login username)</div>
                  </label>
                  <div>
                    <input type="text" required className="form-control" placeholder="Dr. John Doe"
                      style={inputStyle('full_name')}
                      value={form.full_name} onChange={setField('full_name')} onBlur={blurField('full_name')} />
                    <FieldError field="full_name" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="email" required className="form-control" placeholder="doctor@clinic.com"
                      style={inputStyle('email')}
                      value={form.email} onChange={setField('email')} onBlur={blurField('email')} />
                    <FieldError field="email" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Phone <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="tel" required className="form-control" placeholder="10-digit number"
                      style={inputStyle('phone')}
                      value={form.phone} onChange={setField('phone')} onBlur={blurField('phone')} />
                    <FieldError field="phone" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Phone 2</label>
                  <div>
                    <input type="tel" className="form-control" placeholder="Optional"
                      style={inputStyle('alternate_phone')}
                      value={form.alternate_phone} onChange={setField('alternate_phone')} onBlur={blurField('alternate_phone')} />
                    <FieldError field="alternate_phone" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Specialization <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="text" required className="form-control" placeholder="e.g. Cardiologist"
                      style={inputStyle('specialization')}
                      value={form.specialization} onChange={setField('specialization')} onBlur={blurField('specialization')} />
                    <FieldError field="specialization" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Designation</label>
                  <div>
                    <input type="text" className="form-control" placeholder="e.g. Senior Consultant"
                      value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Qualification <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="text" required className="form-control" placeholder="e.g. MBBS, MD"
                      style={inputStyle('qualification')}
                      value={form.qualification} onChange={setField('qualification')} onBlur={blurField('qualification')} />
                    <FieldError field="qualification" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Password{' '}
                    {editingDoc && <span style={{ color: '#64748b', fontWeight: 'normal', fontSize: '0.78rem', display: 'block' }}>(Leave blank to keep current)</span>}
                    {!editingDoc && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={!editingDoc}
                        className="form-control"
                        style={inputStyle('password')}
                        placeholder={editingDoc ? '••••••••' : 'Create password'}
                        value={form.password}
                        onChange={setField('password')}
                        onBlur={blurField('password')}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                        position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 600, padding: '0.2rem'
                      }}>
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                    <FieldError field="password" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password {!editingDoc ? <span style={{ color: '#ef4444' }}>*</span> : ''}</label>
                  <div>
                    <input type={showPassword ? 'text' : 'password'} required={!editingDoc} className="form-control" placeholder="Confirm password"
                      style={inputStyle('confirm_password')}
                      value={form.confirm_password || ''} onChange={setField('confirm_password')} onBlur={blurField('confirm_password')} />
                    <FieldError field="confirm_password" />
                  </div>
                </div>
              </div>

              {/* BUTTONS */}
              <div style={{
                display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
                marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #24384d'
              }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}
                  disabled={saving} style={{ borderRadius: '8px' }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || !isFormValid} style={{ borderRadius: '8px' }}>
                  {saving ? 'Saving...' : editingDoc ? 'Save Changes' : 'Save Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicDoctors;