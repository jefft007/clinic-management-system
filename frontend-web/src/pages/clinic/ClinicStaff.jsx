import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

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
  const colors = { success: { bg: '#10b981', icon: '✓' }, error: { bg: '#ef4444', icon: '✗' } };
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
      <span>{c.icon}</span>{toast.message}
    </div>
  );
};

// ── Details modal — everything about the staff member in one
// view, nothing tucked behind tabs or "show more" ───────────
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

const StaffDetailsModal = ({ member, onClose, onEdit }) => {
  if (!member) return null;
  const joined = member.created_at
    ? new Date(member.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)', padding: '1rem'
    }}>
      <div style={{
        background: '#101d2c', borderRadius: '16px', padding: '0',
        width: '100%', maxWidth: '550px',
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
            <h3 style={{ color: '#f1f5f9', fontWeight: 800, margin: 0 }}>{member.full_name}</h3>
            <div style={{ marginTop: '0.3rem' }}>
              {member.status === 'Active'
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
            <DetailRow label="Designation" value={member.designation} />
            <DetailRow label="Joined" value={joined} />
            <DetailRow label="Phone" value={member.phone} />
            <DetailRow label="Phone 2" value={member.alternate_phone} />
            <DetailRow label="Email" value={member.email} />
          </div>

          <div style={{
            display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
            marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #24384d'
          }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '8px' }}>Close</button>
            <button className="btn btn-primary" onClick={() => onEdit(member)} style={{ borderRadius: '8px' }}>Edit</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClinicStaff = () => {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [detailsStaff, setDetailsStaff] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', alternate_phone: '',
    password: '', designation: '', status: 'Active'
  });

  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false, staffId: null, staffName: ''
  });
  const [deleting, setDeleting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await api.get('/clinic/staff');
      if (res.data.success) setStaff(res.data.staff);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleEdit = (member) => {
    setEditingStaff(member.user_id);
    setForm({
      full_name: member.full_name || '',
      email: member.email || '',
      phone: member.phone || '',
      alternate_phone: member.alternate_phone || '',
      password: '',
      designation: member.designation || '',
      status: member.status || 'Active'
    });
    setErrorMsg('');
    setShowPassword(false);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingStaff(null);
    setForm({
      full_name: '', email: '', phone: '', alternate_phone: '',
      password: '', designation: '', status: 'Active'
    });
    setErrorMsg('');
    setShowPassword(false);
    setShowModal(true);
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
      if (editingStaff) {
        await api.put(`/clinic/staff/${editingStaff}`, form);
        showToast('Staff member updated successfully');
      } else {
        await api.post('/clinic/staff', form);
        showToast('Staff member added successfully');
      }
      setShowModal(false);
      fetchStaff();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to save staff');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      await api.patch(`/clinic/staff/${id}/status`, {
        status: currentStatus === 'Active' ? 'Inactive' : 'Active'
      });
      fetchStaff();
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const handleDeleteClick = (member) => {
    // Prevent self-deletion UI hint
    if (user && String(user.user_id) === String(member.user_id)) {
      showToast('You cannot delete your own account.', 'error');
      return;
    }
    setDeleteConfirm({ open: true, staffId: member.user_id, staffName: member.full_name });
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      const res = await api.delete(`/clinic/staff/${deleteConfirm.staffId}`);
      setDeleteConfirm({ open: false, staffId: null, staffName: '' });
      showToast(res.data.message || 'Staff member deactivated successfully');
      fetchStaff();
    } catch (err) {
      setDeleteConfirm({ open: false, staffId: null, staffName: '' });
      const errMsg = err.response?.data?.message || 'Failed to delete staff member';
      showToast(errMsg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <span>Loading clinic staff...</span>
      </div>
    );
  }

  return (
    <div>
      <Toast toast={toast} />

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title={`Delete ${deleteConfirm.staffName}?`}
        message={`Are you sure you want to permanently delete ${deleteConfirm.staffName}? This action cannot be undone.`}
        subMessage=""
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, staffId: null, staffName: '' })}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        confirmClass="btn-danger"
      />

      <StaffDetailsModal
        member={detailsStaff}
        onClose={() => setDetailsStaff(null)}
        onEdit={(m) => { setDetailsStaff(null); handleEdit(m); }}
      />

      <div className="page-header flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2>Clinic Staff</h2>
          <p>Manage staff members in your clinic</p>
        </div>
        <button className="btn btn-primary" onClick={handleAdd}>
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Add Staff
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No staff members found.
                  </td>
                </tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.user_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          background: `linear-gradient(135deg, ${avatarColor(s.user_id)}, #06b6d4)`,
                          color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '0.7rem',
                        }}>
                          {initials(s.full_name)}
                        </div>
                        <strong style={{ fontSize: '0.875rem' }}>{s.full_name}</strong>
                      </div>
                    </td>
                    <td>{s.designation}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.98rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.phone}</td>
                    <td>{s.email}</td>
                    <td>
                      {s.status === 'Active'
                        ? <span className="badge badge-success"><span className="status-dot green" />Active</span>
                        : <span className="badge badge-warning"><span className="status-dot yellow" />Inactive</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div className="action-buttons">
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                          onClick={() => setDetailsStaff(s)}
                        >
                          👁 Details
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                          onClick={() => handleEdit(s)}
                        >
                          ✏️ Edit
                        </button>
                        {s.status === 'Active' && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--warning)' }}
                            onClick={() => toggleStatus(s.user_id, s.status)}
                          >
                            ⛔ Deactivate
                          </button>
                        )}
                        {s.status !== 'Active' && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: '#10b981' }}
                            onClick={() => toggleStatus(s.user_id, s.status)}
                          >
                            ✅ Activate
                          </button>
                        )}
                        {(!user || String(user.user_id) !== String(s.user_id)) && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }}
                            onClick={() => handleDeleteClick(s)}
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                {editingStaff ? 'Edit Staff Member' : 'Add New Staff'}
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
                  <label className="form-label">
                    Full Name <span style={{ color: '#ef4444' }}>*</span>
                    <div style={{ color: 'var(--text-muted, #94a3b8)', fontWeight: 400, fontSize: '0.78rem' }}>(login username)</div>
                  </label>
                  <div>
                    <input type="text" required className="form-control" placeholder="John Doe"
                      value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Designation <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="text" required className="form-control" placeholder="e.g. Receptionist"
                      value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
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
                  <label className="form-label">Email <span style={{ color: '#ef4444' }}>*</span></label>
                  <div>
                    <input type="email" required className="form-control" placeholder="staff@clinic.com"
                      value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Password {editingStaff && <span style={{ color: '#64748b', fontWeight: 'normal', fontSize: '0.78rem', display: 'block' }}>(Leave blank to keep current)</span>}
                    {!editingStaff && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={!editingStaff}
                        className="form-control"
                        placeholder={editingStaff ? '••••••••' : 'Create password'}
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                        position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 600, padding: '0.2rem'
                      }}>
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password {!editingStaff ? <span style={{ color: '#ef4444' }}>*</span> : ''}</label>
                  <div>
                    <input type={showPassword ? 'text' : 'password'} required={!editingStaff} className="form-control" placeholder="Confirm password"
                      value={form.confirm_password || ''} onChange={e => setForm({ ...form, confirm_password: e.target.value })} />
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
                  {saving ? 'Saving...' : (editingStaff ? 'Save Changes' : 'Save Staff')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicStaff;