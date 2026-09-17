// src/pages/admin/RoleManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

// ─────────────────────────────────────────────
// Helpers & Validators
// ─────────────────────────────────────────────

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const getRoleName = (roleId) => {
  switch (Number(roleId)) {
    case 1: return 'Admin';
    case 2: return 'Clinic Staff';
    case 3: return 'Doctor';
    default: return 'Unknown';
  }
};

const isValidPhone = (v) => /^[6-9]\d{9}$/.test(String(v).replace(/\s/g, ''));
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isValidPassword = (v) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v);

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────

const Toast = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const styles = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#10b981', icon: '✅' },
    error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: '#ef4444', icon: '❌' },
  };
  const s = styles[toast.type] || styles.success;

  return (
    <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 'var(--radius)', color: s.color, fontSize: '0.875rem', fontWeight: 500, maxWidth: 400, boxShadow: 'var(--shadow)', animation: 'fadeSlideIn 0.2s ease' }}>
      <span>{s.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: s.color, cursor: 'pointer', fontSize: '1rem' }}>✕</button>
    </div>
  );
};

// ─────────────────────────────────────────────
// Password Field (defined OUTSIDE modal to prevent remounting on every render)
// ROOT CAUSE FIX: When PasswordField is defined inside the UserModal render
// function, React treats it as a NEW component type on every render and
// unmounts/remounts the <input>, clearing it and losing focus after each
// keystroke. Moving it here as a stable top-level component fixes typing.
// ─────────────────────────────────────────────

const PasswordField = ({ id, name, label, value, show, onToggle, onChange, onBlur, error, placeholder, isEdit }) => (
  <div className="form-group">
    <label className="form-label">
      {label}
      {!isEdit && <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>}
      {isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>(leave empty to keep current)</span>}
    </label>
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        className="form-control"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder || (isEdit ? '••••••••' : '')}
        style={{ ...(error ? { borderColor: 'var(--danger)' } : {}), paddingRight: '2.8rem' }}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={onToggle}
        style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: 0 }}
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
    {error && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)', display: 'block' }}>{error}</span>}
  </div>
);

// ─────────────────────────────────────────────
// User Modal (Add + Edit)
// ─────────────────────────────────────────────

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', alternate_phone: '',
  password: '', confirm_password: '',
  role_id: 2, clinic_id: '', specialization: '', status: 'Active',
};

const UserModal = ({ onClose, onSuccess, initialData, clinics }) => {
  const isEdit = !!initialData;

  const [form, setForm] = useState(() => isEdit
    ? {
        full_name:       initialData.full_name       || '',
        email:           initialData.email           || '',
        phone:           initialData.phone           || '',
        alternate_phone: initialData.alternate_phone || '',
        password:        '',
        confirm_password:'',
        role_id:         initialData.role_id         || 2,
        clinic_id:       initialData.clinic_id       || '',
        specialization:  initialData.specialization  || '',
        status:          initialData.status          || 'Active',
      }
    : EMPTY_FORM
  );

  const [errors,     setErrors]     = useState({});
  const [apiError,   setApiError]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [showConfirm,setShowConfirm]= useState(false);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validateField = (name, snapshot = form) => {
    switch (name) {
      case 'full_name':
        return !snapshot.full_name.trim() ? 'Full name is required.' : '';

      case 'email':
        if (!snapshot.email.trim()) return 'Email is required.';
        if (!isValidEmail(snapshot.email)) return 'Invalid email address.';
        return '';

      case 'phone':
        if (!snapshot.phone.trim()) return 'Phone number is required.';
        if (!isValidPhone(snapshot.phone)) return 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
        return '';

      case 'alternate_phone':
        if (snapshot.alternate_phone.trim()) {
          if (!isValidPhone(snapshot.alternate_phone)) return 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
          if (snapshot.phone.trim() && snapshot.phone.trim() === snapshot.alternate_phone.trim()) return 'Phone 2 must be different from the primary phone.';
        }
        return '';

      case 'password':
        if (!isEdit && !snapshot.password) return 'Password is required for new users.';
        if (snapshot.password && !isValidPassword(snapshot.password)) return 'Min 8 characters with uppercase, lowercase, number & special character (e.g. Clinic@123).';
        return '';

      case 'confirm_password':
        return snapshot.password && snapshot.password !== snapshot.confirm_password ? 'Passwords do not match.' : '';

      case 'clinic_id':
        return Number(snapshot.role_id) !== 1 && !snapshot.clinic_id ? 'Clinic is required for Staff and Doctors.' : '';

      case 'specialization':
        return Number(snapshot.role_id) === 3 && !snapshot.specialization.trim() ? 'Specialization is required for Doctors.' : '';

      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'role_id' && Number(value) === 1) next.clinic_id = '';
      if (errors[name] !== undefined) {
        setErrors(prevErrs => ({ ...prevErrs, [name]: validateField(name, next) }));
      }
      return next;
    });
    if (apiError) setApiError('');
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setErrors(prev => ({ ...prev, [name]: validateField(name, form) }));
  };

  const validate = () => {
    const fields = [
      'full_name', 'email', 'phone', 'alternate_phone',
      'password', 'confirm_password', 'clinic_id', 'specialization',
    ];
    const errs = {};
    fields.forEach(name => {
      const err = validateField(name);
      if (err) errs[name] = err;
    });
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        full_name:       form.full_name.trim(),
        email:           form.email.trim(),
        phone:           form.phone.trim() || null,
        alternate_phone: form.alternate_phone.trim() || null,
        role_id:         Number(form.role_id),
        clinic_id:       form.clinic_id ? Number(form.clinic_id) : null,
        status:          form.status,
      };

      if (form.password)          payload.password        = form.password;
      if (Number(form.role_id) === 3 && form.specialization)
        payload.specialization = form.specialization.trim();

      let res;
      if (isEdit) {
        res = await api.put(`/admin/users/${initialData.user_id}`, payload);
      } else {
        res = await api.post('/admin/users', payload);
      }

      if (res.data.success) {
        onSuccess(res.data.message || (isEdit ? 'User updated successfully' : 'User created successfully'));
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save user. Please try again.';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const roleNum = Number(form.role_id);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 720, maxHeight: '94vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '0.1rem' }}>{isEdit ? 'Edit User' : 'Add User'}</h3>
            <p style={{ fontSize: '0.8rem', margin: 0 }}>Create or update user details.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="inline-form">
          <div style={{ padding: '1.5rem' }}>
            {apiError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span>⚠️</span><span>{apiError}</span>
              </div>
            )}

            {/* We no longer need the responsive-grid-2 if we use inline-form, because inline-form spans the full width of the modal row by row */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>

              {/* Full Name */}
              <div className="form-group">
                <label className="form-label">
                  Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>(login username)</div>
                </label>
                <div>
                  <input name="full_name" className="form-control" value={form.full_name} onChange={handleChange} onBlur={handleBlur} placeholder="Enter full name" style={errors.full_name ? { borderColor: 'var(--danger)' } : {}} />
                  {errors.full_name && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.full_name}</span>}
                </div>
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="form-label">Email <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div>
                  <input name="email" type="email" className="form-control" value={form.email} onChange={handleChange} onBlur={handleBlur} placeholder="Enter email address" style={errors.email ? { borderColor: 'var(--danger)' } : {}} />
                  {errors.email && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.email}</span>}
                </div>
              </div>

              {/* Phone */}
              <div className="form-group">
                <label className="form-label">Phone Number <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div>
                  <input name="phone" type="tel" className="form-control" value={form.phone || ''} onChange={handleChange} onBlur={handleBlur} placeholder="10-digit mobile number" style={errors.phone ? { borderColor: 'var(--danger)' } : {}} />
                  {errors.phone && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.phone}</span>}
                </div>
              </div>

              {/* Alternate Phone — optional */}
              <div className="form-group">
                <label className="form-label">Phone 2 <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>(optional)</span></label>
                <div>
                  <input name="alternate_phone" type="tel" className="form-control" value={form.alternate_phone || ''} onChange={handleChange} onBlur={handleBlur} placeholder="10-digit Phone 2 (optional)" style={errors.alternate_phone ? { borderColor: 'var(--danger)' } : {}} />
                  {errors.alternate_phone && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.alternate_phone}</span>}
                </div>
              </div>

              {/* Role */}
              <div className="form-group">
                <label className="form-label">Role <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div>
                  <select name="role_id" className="form-control" value={form.role_id} onChange={handleChange}>
                    <option value={1}>Admin</option>
                    <option value={2}>Clinic Staff</option>
                    <option value={3}>Doctor</option>
                  </select>
                </div>
              </div>

              {/* Clinic */}
              <div className="form-group">
                <label className="form-label">
                  Clinic {roleNum !== 1 && <span style={{ color: 'var(--danger)' }}>*</span>}
                </label>
                <div>
                  <select
                    name="clinic_id"
                    className="form-control"
                    value={form.clinic_id || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={roleNum === 1}
                    style={errors.clinic_id ? { borderColor: 'var(--danger)' } : {}}
                  >
                    <option value="">{roleNum === 1 ? 'N/A for Admin' : 'Select a Clinic'}</option>
                    {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
                  </select>
                  {errors.clinic_id && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.clinic_id}</span>}
                </div>
              </div>

              {/* Specialization (Doctors only) */}
              {roleNum === 3 && (
                <div className="form-group">
                  <label className="form-label">Specialization <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div>
                    <input name="specialization" className="form-control" value={form.specialization || ''} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. General Physician, Cardiologist" style={errors.specialization ? { borderColor: 'var(--danger)' } : {}} />
                    {errors.specialization && <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.specialization}</span>}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="form-group">
                <label className="form-label">Status <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div>
                  <select name="status" className="form-control" value={form.status} onChange={handleChange}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Password — using stable top-level PasswordField component */}
              <PasswordField
                id="field-password"
                name="password"
                label="Password"
                value={form.password}
                show={showPass}
                onToggle={() => setShowPass(v => !v)}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.password}
                placeholder="Enter password (e.g. Clinic@123)"
                isEdit={isEdit}
              />

              {/* Confirm Password */}
              <PasswordField
                id="field-confirm_password"
                name="confirm_password"
                label="Confirm Password"
                value={form.confirm_password}
                show={showConfirm}
                onToggle={() => setShowConfirm(v => !v)}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.confirm_password}
                placeholder="Re-enter password"
                isEdit={isEdit}
              />

            </div>

            {/* Password hint */}
            {!isEdit && (
              <div style={{ marginTop: '0.25rem', padding: '0.65rem 0.9rem', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)', borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Password requirements:</strong> Min 8 characters with at least one uppercase letter, one lowercase letter, one number and one special character (e.g. <span style={{ color: 'var(--primary-light)' }}>Clinic@123</span>)
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--bg-surface)' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.4rem' }} />
                  Saving…
                </>
              ) : 'Save User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────

const DetailRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{label}</span>
    <span style={{ fontSize: '0.85rem', fontWeight: 500, textAlign: 'right' }}>{value || '—'}</span>
  </div>
);

const UserDetailsModal = ({ user, onClose }) => {
  useEffect(() => {
    if (!user) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [user, onClose]);

  if (!user) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 420, maxHeight: '94vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <h3 style={{ margin: 0 }}>User Details</h3>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <DetailRow label="Name" value={user.full_name} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Phone" value={user.phone} />
          <DetailRow label="Phone 2" value={user.alternate_phone} />
          <DetailRow label="Role" value={getRoleName(user.role_id)} />
          <DetailRow label="Clinic" value={user.clinic_name} />
          <DetailRow label="Status" value={user.status} />
          <DetailRow label="Created On" value={formatDateTime(user.created_at)} />
        </div>
      </div>
    </div>
  );
};

const SkeletonRow = () => (
  <tr>{[1,2,3,4,5,6,7,8].map(i => <td key={i}><div className="skeleton" style={{ height: 14, width: '80%', borderRadius: 4 }} /></td>)}</tr>
);

// ─────────────────────────────────────────────
// RoleManagement main
// ─────────────────────────────────────────────

const RoleManagement = () => {
  const [users,     setUsers]     = useState([]);
  const [clinics,   setClinics]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser,  setEditUser]  = useState(null);
  const [viewUser,  setViewUser]  = useState(null);
  const [toast,     setToast]     = useState(null);
  const [search,       setSearch]       = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, clinicsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/clinics'),
      ]);
      if (usersRes.data.success)   setUsers(usersRes.data.users);
      if (clinicsRes.data.success) setClinics(clinicsRes.data.clinics);
    } catch {
      setToast({ type: 'error', message: 'Failed to load data.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    if (!window.confirm(`Are you sure you want to ${newStatus === 'Inactive' ? 'deactivate' : 'activate'} this user?`)) return;
    try {
      const res = await api.patch(`/admin/users/${user.user_id}/status`, { status: newStatus });
      if (res.data.success) {
        setToast({ type: 'success', message: `User ${newStatus === 'Inactive' ? 'deactivated' : 'activated'}.` });
        fetchAll();
      }
    } catch {
      setToast({ type: 'error', message: 'Failed to update user status.' });
    }
  };

  const handleSuccess = (msg) => {
    setToast({ type: 'success', message: msg });
    setShowModal(false);
    setEditUser(null);
    fetchAll();
  };

  const q = appliedSearch.trim().toLowerCase();
  const filtered = q
    ? users.filter(u =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        u.clinic_name?.toLowerCase().includes(q)
      )
    : users;

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {showModal && (
        <UserModal
          onClose={() => { setShowModal(false); setEditUser(null); }}
          onSuccess={handleSuccess}
          initialData={editUser}
          clinics={clinics}
        />
      )}
      <UserDetailsModal user={viewUser} onClose={() => setViewUser(null)} />

      <div>
        {/* Page header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2>Users &amp; Roles</h2>
            <p>Manage administrators, clinic staff and doctors.</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditUser(null); setShowModal(true); }}>+ Add User</button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              className="form-control"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setAppliedSearch(search); }}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setAppliedSearch(search)}>Apply</button>
          {!loading && <span className="badge badge-primary">{filtered.length} {filtered.length === 1 ? 'user' : 'users'}</span>}
          <button className="btn btn-ghost" onClick={fetchAll} disabled={loading}>↻ Refresh</button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Clinic</th>
                  <th>Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Created On</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? [1,2,3,4].map(i => <SkeletonRow key={i} />) :
                  filtered.length === 0 ? (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No users found.</td></tr>
                  ) : filtered.map(u => (
                    <tr key={u.user_id}>
                      <td style={{ whiteSpace: 'nowrap' }}><strong>{u.full_name}</strong></td>
                      <td style={{ fontSize: '0.83rem' }}>{u.email}</td>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.83rem' }}>{u.phone || '—'}</td>
                      <td>
                        <span className={`role-badge ${getRoleName(u.role_id).toLowerCase().replace(' ', '-')}`}>
                          {getRoleName(u.role_id)}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{u.clinic_name || '—'}</td>
                      <td>
                        <span className={`badge ${u.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                          <span className={`status-dot ${u.status === 'Active' ? 'green' : 'yellow'}`} />
                          {u.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {formatDateTime(u.created_at)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.5rem', marginRight: '0.4rem', fontSize: '0.8rem' }} onClick={() => setViewUser(u)}>👁 View</button>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.5rem', marginRight: '0.4rem', fontSize: '0.8rem' }} onClick={() => { setEditUser(u); setShowModal(true); }}>✏️ Edit</button>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: u.status === 'Active' ? 'var(--warning)' : 'var(--success)' }} onClick={() => handleToggleStatus(u)}>
                          {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default RoleManagement;