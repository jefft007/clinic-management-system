// src/pages/admin/ClinicManagement.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

// Validations
const isValidPhone        = (val) => /^[6-9]\d{9}$/.test(String(val).replace(/\s/g, ''));
const isValidPincode      = (val) => /^\d{6}$/.test(String(val).replace(/\s/g, ''));
const isValidContactName  = (val) => /^[a-zA-Z\s]{2,}$/.test(val.trim());
const isValidEmail        = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const CLINIC_TYPES = [
  'General Clinic',
  'Multi-Specialty Clinic',
  'Dental Clinic',
  'Pediatric Clinic',
  'Diagnostic Clinic',
  'Specialty Clinic',
  'Hospital',
  'Other',
];

const INITIAL_FORM = {
  clinic_name:         '',
  registration_number: '',
  clinic_type:         '',
  address:             '',
  city:                '',
  state:               '',
  pincode:             '',
  contact_name:        '',
  phone:               '',
  alternate_phone:     '',
  email:               '',
  status:              'Active',
};

// ─────────────────────────────────────────────
// Toast notification
// ─────────────────────────────────────────────

const Toast = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const styles = {
    success: { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  color: '#10b981', icon: '✅' },
    error:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   color: '#ef4444', icon: '❌' },
  };
  const s = styles[toast.type] || styles.success;

  return (
    <div style={{
      position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.9rem 1.25rem',
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 'var(--radius)', color: s.color,
      fontSize: '0.875rem', fontWeight: 500, maxWidth: 400,
      boxShadow: 'var(--shadow)', animation: 'fadeSlideIn 0.2s ease',
    }}>
      <span>{s.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: s.color, cursor: 'pointer', fontSize: '1rem', padding: 0, opacity: 0.7 }}>✕</button>
    </div>
  );
};

// ─────────────────────────────────────────────
// Field component
// ─────────────────────────────────────────────

const Field = ({ label, name, type = 'text', required = false, placeholder = '', value, onChange, onBlur, error, disabled = false, hint = '' }) => (
  <div className="form-group">
    <label htmlFor={`field-${name}`} className="form-label">
      {label}
      {required && <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>}
    </label>
    <div>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        className="form-control"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={error ? { borderColor: 'var(--danger)' } : disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
        autoComplete="off"
      />
      {error ? (
        <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '2px', display: 'block' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} /> {hint}
        </span>
      ) : null}
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Section label
// ─────────────────────────────────────────────

const SectionLabel = ({ children, marginTop = false }) => (
  <div style={{
    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--text-muted)',
    marginBottom: '1rem', marginTop: marginTop ? '1.25rem' : 0,
    borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem',
  }}>
    {children}
  </div>
);

// ─────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const isActive = status?.toLowerCase() === 'active';
  return (
    <span className={`badge ${isActive ? 'badge-success' : 'badge-warning'}`}>
      <span className={`status-dot ${isActive ? 'green' : 'yellow'}`} />
      {status || 'Unknown'}
    </span>
  );
};

// ─────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────

const EmptyState = ({ onAdd }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
    <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: '1.25rem' }}>🏥</div>
    <h3 style={{ marginBottom: '0.5rem' }}>No clinics found</h3>
    <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: 320 }}>
      No clinics have been registered yet. Add the first clinic to get started.
    </p>
    <button id="empty-add-clinic-btn" className="btn btn-primary" onClick={onAdd}>+ Add Clinic</button>
  </div>
);

// ─────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────

const SkeletonRow = () => (
  <tr>
    {[100, 160, 130, 90, 120, 100, 80, 100, 80].map((w, i) => (
      <td key={i} style={{ padding: '0.9rem 1.25rem' }}>
        <div className="skeleton" style={{ height: 14, width: w, borderRadius: 4 }} />
      </td>
    ))}
  </tr>
);

// ─────────────────────────────────────────────
// Clinic Modal (Add + Edit)
// ─────────────────────────────────────────────

const ClinicModal = ({ onClose, onSuccess, editClinic }) => {
  const isEditing = Boolean(editClinic);

  const [form, setForm] = useState(() =>
    isEditing
      ? {
          clinic_name:         editClinic.clinic_name         ?? '',
          registration_number: editClinic.registration_number ?? '',
          clinic_type:         editClinic.clinic_type         ?? '',
          address:             editClinic.address             ?? '',
          city:                editClinic.city                ?? '',
          state:               editClinic.state               ?? '',
          pincode:             editClinic.pincode             ?? '',
          contact_name:        editClinic.contact_name        ?? '',
          phone:               editClinic.phone               ?? '',
          alternate_phone:     editClinic.alternate_phone     ?? '',
          email:               editClinic.email               ?? '',
          status:              editClinic.status              ?? 'Active',
        }
      : INITIAL_FORM
  );

  const [errors,     setErrors]     = useState({});
  const [apiError,   setApiError]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingId, setCheckingId] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validateField = (name, snapshot = form) => {
    switch (name) {
      case 'registration_number':
        return !snapshot.registration_number.trim() ? 'Clinic ID is required.' : '';

      case 'clinic_name':
        return !snapshot.clinic_name.trim() ? 'Clinic Name is required.' : '';

      case 'clinic_type':
        return !snapshot.clinic_type ? 'Clinic Type is required.' : '';

      case 'address':
        return !snapshot.address.trim() ? 'Address is required.' : '';

      case 'city':
        return !snapshot.city.trim() ? 'City is required.' : '';

      case 'state':
        return !snapshot.state.trim() ? 'State is required.' : '';

      case 'pincode':
        if (!snapshot.pincode.trim()) return 'Pincode is required.';
        if (!isValidPincode(snapshot.pincode.trim())) return 'Pincode must be exactly 6 digits.';
        return '';

      case 'contact_name':
        if (!snapshot.contact_name.trim()) return 'Contact person name is required.';
        if (!isValidContactName(snapshot.contact_name)) return 'Must contain only alphabetic characters (min 2).';
        return '';

      case 'phone':
        if (!snapshot.phone.trim()) return 'Phone number is required.';
        if (!isValidPhone(snapshot.phone.trim())) return 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
        return '';

      case 'alternate_phone':
        if (snapshot.alternate_phone.trim()) {
          if (!isValidPhone(snapshot.alternate_phone.trim())) return 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
          if (snapshot.phone.trim() && snapshot.phone.trim() === snapshot.alternate_phone.trim()) return 'Phone 2 must be different from the primary phone.';
        }
        return '';

      case 'email':
        return snapshot.email.trim() && !isValidEmail(snapshot.email) ? 'Invalid email address format.' : '';

      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      // Re-validate live as the person types, once the field has
      // already been touched (so we don't flash errors before
      // they've had a chance to type anything).
      if (errors[name] !== undefined) {
        setErrors(prevErrs => ({ ...prevErrs, [name]: validateField(name, next) }));
      }
      return next;
    });
    if (apiError) setApiError('');
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    const err = validateField(name, form);
    setErrors(prev => ({ ...prev, [name]: err }));

    // Clinic ID must be unique — check it against the server the
    // moment the person leaves the field, instead of waiting for
    // them to hit Save.
    if (name === 'registration_number' && !err) {
      checkClinicIdUnique(form.registration_number);
    }
  };

  const idCheckToken = useRef(0);

  const checkClinicIdUnique = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const myToken = ++idCheckToken.current;
    setCheckingId(true);
    try {
      const params = { registration_number: trimmed };
      if (isEditing) params.exclude_id = editClinic.clinic_id;
      const res = await api.get('/admin/clinics/check-id', { params });
      if (myToken !== idCheckToken.current) return; // a newer check already superseded this one
      if (res.data.success && !res.data.available) {
        setErrors(prev => ({ ...prev, registration_number: 'This Clinic ID is already in use.' }));
      }
    } catch {
      // Silent — the create/update call still enforces uniqueness
      // server-side as a backstop if this check couldn't run.
    } finally {
      if (myToken === idCheckToken.current) setCheckingId(false);
    }
  };

  const validate = () => {
    const fields = [
      'registration_number', 'clinic_name', 'clinic_type', 'address', 'city',
      'state', 'pincode', 'contact_name', 'phone', 'alternate_phone', 'email',
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

    // Final live uniqueness check right before persisting — covers
    // the case where the person submitted via Enter without ever
    // blurring the field, or another admin took the ID in the
    // meantime.
    setCheckingId(true);
    try {
      const params = { registration_number: form.registration_number.trim() };
      if (isEditing) params.exclude_id = editClinic.clinic_id;
      const checkRes = await api.get('/admin/clinics/check-id', { params });
      if (checkRes.data.success && !checkRes.data.available) {
        setErrors(prev => ({ ...prev, registration_number: 'This Clinic ID is already in use.' }));
        setCheckingId(false);
        return;
      }
    } catch {
      // If the check itself fails, fall through — create/update
      // below still enforces uniqueness server-side as a backstop.
    }
    setCheckingId(false);

    const payload = {
      clinic_name:         form.clinic_name.trim(),
      registration_number: form.registration_number.trim(),
      clinic_type:         form.clinic_type.trim(),
      address:             form.address.trim(),
      city:                form.city.trim(),
      state:               form.state.trim(),
      pincode:             form.pincode.trim(),
      contact_name:        form.contact_name.trim(),
      phone:               form.phone.trim(),
      alternate_phone:     form.alternate_phone.trim(),
    };

    if (form.email.trim())    payload.email  = form.email.trim();
    if (isEditing)            payload.status = form.status;

    setSubmitting(true);
    try {
      let res;
      if (isEditing) {
        res = await api.put(`/admin/clinics/${editClinic.clinic_id}`, payload);
        if (res.data.success) onSuccess(res.data.clinic, 'Clinic updated successfully!');
      } else {
        res = await api.post('/admin/clinics', payload);
        if (res.data.success) onSuccess(res.data.clinic, 'Clinic created successfully!');
      }
    } catch (err) {
      const status  = err.response?.status;
      const message = err.response?.data?.message || '';
      if      (status === 403) setApiError('You do not have permission to manage clinics.');
      else if (status === 409) setApiError(message || 'Clinic ID already exists.');
      else if (status === 400) setApiError(message || 'Please check the form fields and try again.');
      else if (status === 404) setApiError('Clinic not found. It may have been removed.');
      else setApiError(isEditing ? 'Unable to update clinic. Please try again.' : 'Unable to create clinic. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="modal-title"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <div>
            <h3 id="modal-title" style={{ marginBottom: '0.1rem' }}>
              {isEditing ? 'Edit Clinic' : 'Add New Clinic'}
            </h3>
            <p style={{ fontSize: '0.8rem', margin: 0 }}>
              Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are required.
            </p>
          </div>
          <button onClick={onClose} id="modal-close-btn" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>✕</button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} noValidate className="inline-form">
          <div style={{ padding: '1.5rem' }}>

            {/* API error */}
            {apiError && (
              <div id="modal-api-error" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚠️</span> {apiError}
              </div>
            )}

            {/* ── Clinic Information ── */}
            <SectionLabel>Clinic Information</SectionLabel>
            <div className="compact-form" style={{ display: 'flex', flexDirection: 'column' }}>
              <Field
                label="Clinic ID"
                name="registration_number"
                required
                placeholder="e.g. CLINIC-001"
                value={form.registration_number}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.registration_number}
                hint={checkingId ? 'Checking availability…' : ''}
              />
              <Field
                label="Clinic Name"
                name="clinic_name"
                required
                placeholder="e.g. KJ Health Clinic"
                value={form.clinic_name}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.clinic_name}
              />

              {/* Clinic Type dropdown */}
              <div className="form-group">
                <label htmlFor="field-clinic_type" className="form-label">
                  Clinic Type <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>
                </label>
                <div>
                  <select
                    id="field-clinic_type"
                    name="clinic_type"
                    className="form-control"
                    value={form.clinic_type}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    style={errors.clinic_type ? { borderColor: 'var(--danger)' } : {}}
                  >
                    <option value="">Select Clinic Type</option>
                    {CLINIC_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {errors.clinic_type && (
                    <span className="field-error" style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '2px', display: 'block' }}>
                      {errors.clinic_type}
                    </span>
                  )}
                </div>
              </div>

              <Field
                label="Pincode"
                name="pincode"
                required
                placeholder="e.g. 560001"
                value={form.pincode}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.pincode}
              />

              <Field
                label="Address"
                name="address"
                required
                placeholder="Street / locality / area"
                value={form.address}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.address}
              />

              <Field
                label="City"
                name="city"
                required
                placeholder="e.g. Bengaluru"
                value={form.city}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.city}
              />
              <Field
                label="State"
                name="state"
                required
                placeholder="e.g. Karnataka"
                value={form.state}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.state}
              />
            </div>

            {/* ── Contact Details ── */}
            <SectionLabel marginTop>Contact Details</SectionLabel>
            <div className="compact-form" style={{ display: 'flex', flexDirection: 'column' }}>
              <Field
                label="Contact Person Full Name"
                name="contact_name"
                required
                placeholder="e.g. Rahul Sharma"
                value={form.contact_name}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.contact_name}
              />
              <Field
                label="Phone Number"
                name="phone"
                type="tel"
                required
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.phone}
              />
              <Field
                label="Phone 2"
                name="alternate_phone"
                type="tel"
                placeholder="e.g. 8765432109 (optional)"
                value={form.alternate_phone}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.alternate_phone}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                placeholder="clinic@example.com (optional)"
                value={form.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.email}
              />
            </div>

            {/* ── Status (edit mode only) ── */}
            {isEditing && (
              <>
                <SectionLabel marginTop>Status</SectionLabel>
                <div className="form-group" style={{ maxWidth: '280px' }}>
                  <label htmlFor="field-status" className="form-label">Clinic Status</label>
                  <select id="field-status" name="status" className="form-control" value={form.status} onChange={handleChange}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </>
            )}

            {/* ── Created On (read-only, edit mode only) ── */}
            {isEditing && editClinic?.created_at && (
              <div style={{ marginTop: '0.5rem', padding: '0.65rem 1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📅</span>
                Created On: <strong style={{ color: 'var(--text-secondary)' }}>{formatDateTime(editClinic.created_at)}</strong>
                <span style={{ marginLeft: '0.25rem', fontSize: '0.72rem', opacity: 0.7 }}>(auto-generated, cannot be changed)</span>
              </div>
            )}
          </div>

          {/* Modal footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--bg-surface)' }}>
            <button type="button" id="modal-cancel-btn" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" id="modal-submit-btn" className="btn btn-primary" disabled={submitting || checkingId}>
              {submitting ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.4rem' }} />
                  {isEditing ? 'Updating…' : 'Creating…'}
                </>
              ) : checkingId ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.4rem' }} />
                  Checking…
                </>
              ) : (
                isEditing ? 'Update Clinic' : 'Save Clinic'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main ClinicManagement component
// ─────────────────────────────────────────────

const ClinicManagement = () => {
  const [clinics,       setClinics]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState('');
  const [showModal,     setShowModal]     = useState(false);
  const [editingClinic, setEditingClinic] = useState(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [toast,         setToast]         = useState(null);
  const [deletingId,    setDeletingId]    = useState(null);

  // Fetch clinics
  const fetchClinics = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await api.get('/admin/clinics');
      if (res.data.success) setClinics(res.data.clinics);
      else setFetchError('Failed to load clinic list.');
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) setFetchError('You do not have permission to view clinics.');
      else setFetchError('Unable to load clinics. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClinics(); }, [fetchClinics]);

  const handleOpenAdd   = ()  => { setEditingClinic(null); setShowModal(true); };
  const handleOpenEdit  = (c) => { setEditingClinic(c);   setShowModal(true); };
  const handleCloseModal= ()  => { setShowModal(false);   setEditingClinic(null); };

  const handleSuccess = (clinic, message) => {
    if (editingClinic) {
      setClinics(prev => prev.map(c => c.clinic_id === clinic.clinic_id ? clinic : c));
    } else {
      setClinics(prev => [clinic, ...prev]);
    }
    handleCloseModal();
    setToast({ type: 'success', message });
  };

  const handleDelete = async (clinic) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete/deactivate "${clinic.clinic_name}"?\n\nThis will set the clinic status to Inactive.`
    );
    if (!confirmed) return;

    setDeletingId(clinic.clinic_id);
    try {
      const res = await api.delete(`/admin/clinics/${clinic.clinic_id}`);
      if (res.data.success) {
        setClinics(prev => prev.map(c => c.clinic_id === clinic.clinic_id ? { ...c, status: 'Inactive' } : c));
        setToast({ type: 'success', message: `"${clinic.clinic_name}" has been deactivated.` });
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete clinic.';
      setToast({ type: 'error', message });
    } finally {
      setDeletingId(null);
    }
  };

  // Client-side search
  const q = appliedSearchQuery.trim().toLowerCase();
  const filtered = q
    ? clinics.filter(c =>
        c.clinic_name?.toLowerCase().includes(q) ||
        c.registration_number?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.state?.toLowerCase().includes(q) ||
        c.clinic_type?.toLowerCase().includes(q) ||
        c.contact_name?.toLowerCase().includes(q)
      )
    : clinics;

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {showModal && (
        <ClinicModal
          onClose={handleCloseModal}
          onSuccess={handleSuccess}
          editClinic={editingClinic}
        />
      )}

      <div>
        {/* Page header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2>Clinics</h2>
            <p>Manage all clinics registered in the system.</p>
          </div>
          <button id="open-add-clinic-btn" className="btn btn-primary" onClick={handleOpenAdd}>
            + Add Clinic
          </button>
        </div>

        {/* Fetch error */}
        {fetchError && (
          <div id="fetch-error-banner" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', padding: '0.9rem 1.25rem', marginBottom: '1.5rem', color: 'var(--danger)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{fetchError}</span>
            <button className="btn btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={fetchClinics}>Retry</button>
          </div>
        )}

        {/* Toolbar */}
        {!fetchError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 400 }}>
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
              <input
                id="clinic-search"
                type="text"
                className="form-control"
                placeholder="Search by name, ID, city, state, type…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setAppliedSearchQuery(searchQuery); }}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
            <button className="btn btn-primary" onClick={() => setAppliedSearchQuery(searchQuery)}>Apply</button>
            {!loading && (
              <span className="badge badge-primary">
                {filtered.length} {filtered.length === 1 ? 'clinic' : 'clinics'}
              </span>
            )}
            <button id="refresh-clinics-btn" className="btn btn-ghost" onClick={fetchClinics} disabled={loading} title="Refresh list">
              {loading ? '…' : '↻'} Refresh
            </button>
          </div>
        )}

        {/* Table */}
        {!fetchError && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      {['Clinic ID','Clinic Name','Clinic Type','City','Contact Name','Phone','Status','Created On','Actions'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} />)}</tbody>
                </table>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState onAdd={handleOpenAdd} />
            ) : (
              <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }} id="clinics-table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Clinic ID</th>
                      <th>Clinic Name</th>
                      <th>Clinic Type</th>
                      <th>City</th>
                      <th>Contact Name</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Created On</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((clinic) => (
                      <tr key={clinic.clinic_id} id={`clinic-row-${clinic.clinic_id}`}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {clinic.registration_number ? (
                            <span className="badge badge-info" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                              {clinic.registration_number}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <strong>{clinic.clinic_name}</strong>
                        </td>
                        <td>
                          <span className="badge badge-secondary" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', whiteSpace: 'nowrap' }}>
                            {clinic.clinic_type || '—'}
                          </span>
                        </td>
                        <td>{clinic.city}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{clinic.contact_name || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.83rem', whiteSpace: 'nowrap' }}>{clinic.phone}</td>
                        <td><StatusBadge status={clinic.status} /></td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {formatDate(clinic.created_at)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            id={`edit-clinic-${clinic.clinic_id}`}
                            className="btn btn-ghost"
                            title="Edit clinic"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', marginRight: '0.4rem' }}
                            onClick={() => handleOpenEdit(clinic)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            id={`delete-clinic-${clinic.clinic_id}`}
                            className="btn btn-ghost"
                            title="Deactivate clinic"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--danger)', opacity: deletingId === clinic.clinic_id ? 0.5 : 1 }}
                            disabled={deletingId === clinic.clinic_id}
                            onClick={() => handleDelete(clinic)}
                          >
                            {deletingId === clinic.clinic_id ? '⏳' : '🗑️'} Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default ClinicManagement;