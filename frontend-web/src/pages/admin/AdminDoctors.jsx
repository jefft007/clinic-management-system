// src/pages/admin/AdminDoctors.jsx

import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const formatDateTime = (iso) => {
  if (!iso) return '—';

  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────

const Toast = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const styles = {
    success: {
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.3)',
      color: '#10b981',
      icon: '✅',
    },

    error: {
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.3)',
      color: '#ef4444',
      icon: '❌',
    },
  };

  const style = styles[toast.type] || styles.success;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.9rem 1.25rem',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius)',
        color: style.color,
        fontSize: '0.875rem',
        fontWeight: 500,
        maxWidth: 400,
        boxShadow: 'var(--shadow)',
      }}
    >
      <span>{style.icon}</span>

      <span style={{ flex: 1 }}>
        {toast.message}
      </span>

      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: style.color,
          cursor: 'pointer',
          fontSize: '1rem',
        }}
      >
        ✕
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const isActive = status?.toLowerCase() === 'active';

  return (
    <span
      className={`badge ${
        isActive ? 'badge-success' : 'badge-warning'
      }`}
    >
      <span
        className={`status-dot ${
          isActive ? 'green' : 'yellow'
        }`}
      />

      {status || 'Unknown'}
    </span>
  );
};

// ─────────────────────────────────────────────
// Clinic Type Badge
// ─────────────────────────────────────────────

const ClinicTypeBadge = ({ type }) => {
  if (!type) {
    return (
      <span style={{ color: 'var(--text-muted)' }}>
        —
      </span>
    );
  }

  const colorMap = {
    Hospital: {
      bg: 'rgba(239,68,68,0.1)',
      color: '#f87171',
    },

    'Multi-Specialty Clinic': {
      bg: 'rgba(139,92,246,0.1)',
      color: '#a78bfa',
    },

    'Dental Clinic': {
      bg: 'rgba(6,182,212,0.1)',
      color: '#22d3ee',
    },

    'Pediatric Clinic': {
      bg: 'rgba(16,185,129,0.1)',
      color: '#34d399',
    },

    'Diagnostic Clinic': {
      bg: 'rgba(245,158,11,0.1)',
      color: '#fbbf24',
    },

    'Specialty Clinic': {
      bg: 'rgba(99,102,241,0.1)',
      color: '#818cf8',
    },

    'General Clinic': {
      bg: 'rgba(37,99,235,0.1)',
      color: '#60a5fa',
    },
  };

  const style =
    colorMap[type] || {
      bg: 'rgba(100,116,139,0.1)',
      color: '#94a3b8',
    };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.2rem 0.6rem',
        borderRadius: '99px',
        fontSize: '0.72rem',
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </span>
  );
};

// ─────────────────────────────────────────────
// Skeleton Row
// ─────────────────────────────────────────────

const SkeletonRow = () => (
  <tr>
    {[140, 130, 120, 100, 100, 130, 120, 80, 110, 80].map(
      (width, index) => (
        <td
          key={index}
          style={{
            padding: '0.9rem 1.25rem',
          }}
        >
          <div
            className="skeleton"
            style={{
              height: 14,
              width,
              borderRadius: 4,
            }}
          />
        </td>
      )
    )}
  </tr>
);

// ─────────────────────────────────────────────
// Doctor Detail Modal
//
// IMPORTANT:
// Experience and License Number have been removed.
// Qualification remains.
// ─────────────────────────────────────────────

const DoctorDetailModal = ({ doctor, onClose }) => {
  if (!doctor) return null;

  const Row = ({ label, value }) => (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        padding: '0.65rem 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: '160px',
          flexShrink: 0,
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      <div
        style={{
          flex: 1,
          fontSize: '0.875rem',
          color: 'var(--text-primary)',
        }}
      >
        {value || '—'}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Modal Header */}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              Doctor Details
            </h3>

            <p
              style={{
                fontSize: '0.8rem',
                margin: '0.1rem 0 0',
              }}
            >
              {doctor.full_name}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}

        <div style={{ padding: '1.25rem 1.5rem' }}>
          <Row
            label="Doctor Name"
            value={doctor.full_name}
          />

          <Row
            label="Clinic"
            value={doctor.clinic_name}
          />

          <Row
            label="Clinic Type"
            value={
              <ClinicTypeBadge
                type={doctor.clinic_type}
              />
            }
          />

          <Row
            label="Specialization"
            value={doctor.specialization}
          />

          <Row
            label="Email"
            value={doctor.email}
          />

          <Row
            label="Phone"
            value={doctor.phone}
          />

          <Row
            label="Phone 2"
            value={doctor.alternate_phone}
          />

          {/* Qualification KEPT */}
          <Row
            label="Qualification"
            value={doctor.qualification}
          />

          {/* Experience REMOVED */}

          {/* License Number REMOVED */}

          <Row
            label="Status"
            value={
              <StatusBadge
                status={doctor.status}
              />
            }
          />

          <Row
            label="Created On"
            value={formatDateTime(doctor.created_at)}
          />
        </div>

        {/* Modal Footer */}

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            className="btn btn-ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Edit Doctor Modal
// ─────────────────────────────────────────────

const EditDoctorModal = ({ doctor, onSave, onClose, saving, errorMsg }) => {
  const [form, setForm] = useState({
    full_name: doctor.full_name || '',
    email: doctor.email || '',
    phone: doctor.phone || '',
    alternate_phone: doctor.alternate_phone || '',
    specialization: doctor.specialization || '',
    qualification: doctor.qualification || '',
  });

  const [touched, setTouched] = useState({});

  const validators = {
    full_name: (v) => (!v.trim() ? 'Full name is required.' : ''),
    email: (v) => {
      if (!v.trim()) return 'Email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
      return '';
    },
    phone: (v) => (v && !/^[6-9]\d{9}$/.test(v.trim()) ? 'Enter a valid 10-digit phone number.' : ''),
    alternate_phone: (v) => (v && !/^[6-9]\d{9}$/.test(v.trim()) ? 'Enter a valid 10-digit phone number.' : ''),
    specialization: (v) => (!v.trim() ? 'Specialization is required.' : ''),
  };

  const errors = Object.fromEntries(
    Object.entries(validators).map(([field, fn]) => [field, fn(form[field] || '')])
  );

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (!touched[field]) setTouched((t) => ({ ...t, [field]: true }));
  };

  const blur = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const fieldError = (field) => (touched[field] ? errors[field] : '');

  const inputStyle = (field) =>
    fieldError(field) ? { borderColor: 'var(--danger)' } : undefined;

  const isValid = Object.values(errors).every((e) => !e);

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({
      full_name: true, email: true, phone: true,
      alternate_phone: true, specialization: true,
    });
    if (!isValid) return;
    onSave(form);
  };

  const ErrorText = ({ field }) =>
    fieldError(field) ? (
      <div style={{ color: 'var(--danger)', fontSize: '0.72rem', marginTop: '0.3rem' }}>
        {fieldError(field)}
      </div>
    ) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Edit Doctor</h3>
            <p style={{ fontSize: '0.8rem', margin: '0.1rem 0 0' }}>
              {doctor.full_name}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="inline-form" style={{ padding: '1.25rem 1.5rem' }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1.1rem',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Full Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <input
                type="text"
                required
                className="form-control"
                style={inputStyle('full_name')}
                value={form.full_name}
                onChange={set('full_name')}
                onBlur={blur('full_name')}
              />
              <ErrorText field="full_name" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <input
                type="email"
                required
                className="form-control"
                style={inputStyle('email')}
                value={form.email}
                onChange={set('email')}
                onBlur={blur('email')}
              />
              <ErrorText field="email" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Phone</label>
            <div>
              <input
                type="tel"
                className="form-control"
                style={inputStyle('phone')}
                value={form.phone}
                onChange={set('phone')}
                onBlur={blur('phone')}
              />
              <ErrorText field="phone" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Phone 2</label>
            <div>
              <input
                type="tel"
                className="form-control"
                style={inputStyle('alternate_phone')}
                value={form.alternate_phone}
                onChange={set('alternate_phone')}
                onBlur={blur('alternate_phone')}
              />
              <ErrorText field="alternate_phone" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Specialization <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <input
                type="text"
                required
                className="form-control"
                style={inputStyle('specialization')}
                value={form.specialization}
                onChange={set('specialization')}
                onBlur={blur('specialization')}
              />
              <ErrorText field="specialization" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Qualification</label>
            <div>
              <input
                type="text"
                className="form-control"
                value={form.qualification}
                onChange={set('qualification')}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '1.25rem',
              paddingTop: '1.1rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !isValid}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Add Doctor Modal
// ─────────────────────────────────────────────

const AddDoctorModal = ({ clinics, onSave, onClose, saving, errorMsg }) => {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    clinic_id: '',
    specialization: '',
    qualification: '',
    password: '',
    confirm_password: '',
  });

  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validators = {
    full_name: (v) => (!v.trim() ? 'Full name is required.' : ''),
    email: (v) => {
      if (!v.trim()) return 'Email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
      return '';
    },
    phone: (v) => (v && !/^[6-9]\d{9}$/.test(v.trim()) ? 'Enter a valid 10-digit phone number.' : ''),
    alternate_phone: (v) => (v && !/^[6-9]\d{9}$/.test(v.trim()) ? 'Enter a valid 10-digit phone number.' : ''),
    clinic_id: (v) => (!v ? 'Select a clinic.' : ''),
    specialization: (v) => (!v.trim() ? 'Specialization is required.' : ''),
    password: (v) => {
      if (!v) return 'Password is required.';
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v)) {
        return 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special (e.g. Clinic@123).';
      }
      return '';
    },
    confirm_password: (v, snapshot) => {
      const pwd = snapshot ? snapshot.password : form.password;
      return pwd && v !== pwd ? 'Passwords do not match.' : '';
    },
  };

  const errors = Object.fromEntries(
    Object.entries(validators).map(([field, fn]) => [field, fn(form[field] || '', form)])
  );

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (!touched[field]) setTouched((t) => ({ ...t, [field]: true }));
  };

  const blur = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const fieldError = (field) => (touched[field] ? errors[field] : '');

  const inputStyle = (field) =>
    fieldError(field) ? { borderColor: 'var(--danger)' } : undefined;

  const isValid = Object.values(errors).every((e) => !e);

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({
      full_name: true, email: true, phone: true, alternate_phone: true,
      clinic_id: true, specialization: true, password: true, confirm_password: true,
    });
    if (!isValid) return;
    onSave(form);
  };

  const ErrorText = ({ field }) =>
    fieldError(field) ? (
      <div className="field-error" style={{ color: 'var(--danger)', fontSize: '0.72rem', marginTop: '0.3rem' }}>
        {fieldError(field)}
      </div>
    ) : null;

  const activeClinics = clinics.filter((c) => c.status?.toLowerCase() === 'active');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Add Doctor</h3>
            <p style={{ fontSize: '0.8rem', margin: '0.1rem 0 0' }}>
              Create a new doctor account and assign a clinic.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="inline-form" style={{ padding: '1.25rem 1.5rem' }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1.1rem',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Full Name <span style={{ color: '#ef4444' }}>*</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}> (login username)</span>
            </label>
            <div>
              <input
                type="text"
                required
                className="form-control"
                style={inputStyle('full_name')}
                value={form.full_name}
                onChange={set('full_name')}
                onBlur={blur('full_name')}
                placeholder="e.g. Dr. Steve Anderson"
              />
              <ErrorText field="full_name" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <input
                type="email"
                required
                className="form-control"
                style={inputStyle('email')}
                value={form.email}
                onChange={set('email')}
                onBlur={blur('email')}
                placeholder="doctor@example.com"
              />
              <ErrorText field="email" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Phone</label>
            <div>
              <input
                type="tel"
                className="form-control"
                style={inputStyle('phone')}
                value={form.phone}
                onChange={set('phone')}
                onBlur={blur('phone')}
                placeholder="10-digit mobile"
              />
              <ErrorText field="phone" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Phone 2</label>
            <div>
              <input
                type="tel"
                className="form-control"
                style={inputStyle('alternate_phone')}
                value={form.alternate_phone}
                onChange={set('alternate_phone')}
                onBlur={blur('alternate_phone')}
                placeholder="Optional"
              />
              <ErrorText field="alternate_phone" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Clinic <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <select
                className="form-control"
                style={inputStyle('clinic_id')}
                value={form.clinic_id}
                onChange={set('clinic_id')}
                onBlur={blur('clinic_id')}
              >
                <option value="">Select clinic</option>
                {activeClinics.map((c) => (
                  <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>
                ))}
              </select>
              <ErrorText field="clinic_id" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Specialization <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <input
                type="text"
                required
                className="form-control"
                style={inputStyle('specialization')}
                value={form.specialization}
                onChange={set('specialization')}
                onBlur={blur('specialization')}
                placeholder="e.g. General Physician, Cardiologist"
              />
              <ErrorText field="specialization" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Qualification</label>
            <div>
              <input
                type="text"
                className="form-control"
                value={form.qualification}
                onChange={set('qualification')}
                placeholder="e.g. MBBS, MD"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Password <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="form-control"
                  style={{ ...inputStyle('password'), paddingRight: '2.5rem' }}
                  value={form.password}
                  onChange={set('password')}
                  onBlur={blur('password')}
                  placeholder="e.g. Clinic@123"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.95rem',
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              <ErrorText field="password" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Confirm Password <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  className="form-control"
                  style={{ ...inputStyle('confirm_password'), paddingRight: '2.5rem' }}
                  value={form.confirm_password}
                  onChange={set('confirm_password')}
                  onBlur={blur('confirm_password')}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.95rem',
                  }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? '🙈' : '👁'}
                </button>
              </div>
              <ErrorText field="confirm_password" />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '1.25rem',
              paddingTop: '1.1rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !isValid}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main AdminDoctors Component
// ─────────────────────────────────────────────

const AdminDoctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [clinics, setClinics] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [clinicFilter, setClinicFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [toast, setToast] = useState(null);
  const [viewDoctor, setViewDoctor] = useState(null);
  const [editDoctor, setEditDoctor] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [addError, setAddError] = useState('');

  const [deactivatingId, setDeactivatingId] =
    useState(null);

  // Pagination

  const PAGE_SIZE = 10;

  const [page, setPage] = useState(1);

  // ─────────────────────────────────────────────
  // Fetch doctors + clinics
  // ─────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError('');

    try {
      const [doctorsRes, clinicsRes] =
        await Promise.all([
          api.get('/admin/doctors'),
          api.get('/admin/clinics'),
        ]);

      if (doctorsRes.data.success) {
        setDoctors(
          doctorsRes.data.doctors || []
        );
      }

      if (clinicsRes.data.success) {
        setClinics(
          clinicsRes.data.clinics || []
        );
      }
    } catch (err) {
      const status = err.response?.status;

      if (status === 403) {
        setFetchError(
          'You do not have permission to view doctors.'
        );
      } else {
        setFetchError(
          'Unable to load doctors. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────
  // Initial load
  // ─────────────────────────────────────────────

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─────────────────────────────────────────────
  // Deactivate doctor
  // ─────────────────────────────────────────────

  const handleDeactivate = async (doctor) => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate Dr. ${doctor.full_name}?`
    );

    if (!confirmed) return;

    setDeactivatingId(doctor.doctor_id);

    try {
      const res = await api.patch(
        `/admin/users/${doctor.user_id}/status`,
        {
          status: 'Inactive',
        }
      );

      if (res.data.success) {
        setDoctors((previousDoctors) =>
          previousDoctors.map((doctorItem) =>
            doctorItem.doctor_id === doctor.doctor_id
              ? {
                  ...doctorItem,
                  status: 'Inactive',
                }
              : doctorItem
          )
        );

        setToast({
          type: 'success',
          message: `Dr. ${doctor.full_name} has been deactivated.`,
        });
      }
    } catch (error) {
      console.error(
        'Deactivate doctor error:',
        error
      );

      setToast({
        type: 'error',
        message:
          'Failed to deactivate doctor.',
      });
    } finally {
      setDeactivatingId(null);
    }
  };

  // ─────────────────────────────────────────────
  // Edit doctor
  // ─────────────────────────────────────────────

  const handleEditSave = async (form) => {
    setSavingEdit(true);
    setEditError('');

    try {
      const res = await api.put(
        `/admin/doctors/${editDoctor.doctor_id}`,
        form
      );

      if (res.data.success) {
        setDoctors((previousDoctors) =>
          previousDoctors.map((doctorItem) =>
            doctorItem.doctor_id === editDoctor.doctor_id
              ? { ...doctorItem, ...form }
              : doctorItem
          )
        );

        setToast({
          type: 'success',
          message: `Dr. ${form.full_name}'s details were updated.`,
        });

        setEditDoctor(null);
      }
    } catch (error) {
      console.error('Update doctor error:', error);
      setEditError(
        error.response?.data?.message ||
          'Failed to update doctor.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // ─────────────────────────────────────────────
  // Add doctor
  // ─────────────────────────────────────────────

  const handleAddSave = async (form) => {
    setSavingAdd(true);
    setAddError('');

    try {
      const res = await api.post('/admin/users', {
        role_id: 3,
        clinic_id: form.clinic_id,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        alternate_phone: form.alternate_phone.trim() || undefined,
        specialization: form.specialization.trim(),
        password: form.password,
        status: 'Active',
      });

      if (res.data.success) {
        setToast({
          type: 'success',
          message: `${form.full_name} was added successfully.`,
        });
        setShowAddModal(false);
        fetchData(); // pull the fresh row (with doctor_id, clinic_name, etc.) from the server
      }
    } catch (error) {
      console.error('Add doctor error:', error);
      setAddError(
        error.response?.data?.message || 'Failed to create doctor.'
      );
    } finally {
      setSavingAdd(false);
    }
  };

  // ─────────────────────────────────────────────
  // Search + filters
  // ─────────────────────────────────────────────

  const q = appliedSearch.trim().toLowerCase();

  const filtered = doctors.filter((doctor) => {
    const matchSearch =
      !q ||
      doctor.full_name
        ?.toLowerCase()
        .includes(q) ||
      doctor.specialization
        ?.toLowerCase()
        .includes(q) ||
      doctor.clinic_name
        ?.toLowerCase()
        .includes(q) ||
      doctor.email
        ?.toLowerCase()
        .includes(q) ||
      doctor.phone?.includes(q);

    const matchClinic =
      clinicFilter === 'all' ||
      String(doctor.clinic_id) ===
        String(clinicFilter);

    const matchStatus =
      statusFilter === 'all' ||
      doctor.status?.toLowerCase() ===
        statusFilter.toLowerCase();

    return (
      matchSearch &&
      matchClinic &&
      matchStatus
    );
  });

  // ─────────────────────────────────────────────
  // Pagination
  // ─────────────────────────────────────────────

  const totalPages = Math.ceil(
    filtered.length / PAGE_SIZE
  );

  const paginated = filtered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Reset page when filters change

  useEffect(() => {
    setPage(1);
  }, [
    appliedSearch,
    clinicFilter,
    statusFilter,
  ]);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <>
      {/* Toast */}

      <Toast
        toast={toast}
        onDismiss={() => setToast(null)}
      />

      {/* Doctor Details */}

      {viewDoctor && (
        <DoctorDetailModal
          doctor={viewDoctor}
          onClose={() => setViewDoctor(null)}
        />
      )}

      {/* Edit Doctor */}

      {editDoctor && (
        <EditDoctorModal
          doctor={editDoctor}
          saving={savingEdit}
          errorMsg={editError}
          onSave={handleEditSave}
          onClose={() => {
            setEditDoctor(null);
            setEditError('');
          }}
        />
      )}

      {/* Add Doctor */}

      {showAddModal && (
        <AddDoctorModal
          clinics={clinics}
          saving={savingAdd}
          errorMsg={addError}
          onSave={handleAddSave}
          onClose={() => {
            setShowAddModal(false);
            setAddError('');
          }}
        />
      )}

      <div>

        {/* Page Header */}

        <div
          className="page-header"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h2>Doctors</h2>

            <p>
              View and manage all doctors in the
              system.
            </p>
          </div>

          <button
            id="open-add-doctor-btn"
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            + Add Doctor
          </button>
        </div>

        {/* Fetch Error */}

        {fetchError && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border:
                '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius)',
              padding: '0.9rem 1.25rem',
              marginBottom: '1.5rem',
              color: 'var(--danger)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span>⚠️</span>

            <span style={{ flex: 1 }}>
              {fetchError}
            </span>

            <button
              className="btn btn-ghost"
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
              }}
              onClick={fetchData}
            >
              Retry
            </button>
          </div>
        )}

        {/* Toolbar */}

        {!fetchError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
            }}
          >
            {/* Search */}

            <div
              style={{
                position: 'relative',
                flex: 1,
                minWidth: 220,
                maxWidth: 360,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform:
                    'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              >
                🔍
              </span>

              <input
                type="text"
                className="form-control"
                placeholder="Search by name, email, specialization…"
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setAppliedSearch(search);
                }}
                style={{
                  paddingLeft: '2.5rem',
                }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setAppliedSearch(search)}
            >
              Apply
            </button>

            {/* Clinic Filter */}

            <select
              className="form-control"
              style={{
                width: 'auto',
                minWidth: 160,
              }}
              value={clinicFilter}
              onChange={(e) =>
                setClinicFilter(e.target.value)
              }
            >
              <option value="all">
                All Clinics
              </option>

              {clinics.map((clinic) => (
                <option
                  key={clinic.clinic_id}
                  value={clinic.clinic_id}
                >
                  {clinic.clinic_name}
                </option>
              ))}
            </select>

            {/* Status Filter */}

            <select
              className="form-control"
              style={{
                width: 'auto',
                minWidth: 130,
              }}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
            >
              <option value="all">
                All Status
              </option>

              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>

            {/* Count */}

            {!loading && (
              <span className="badge badge-primary">
                {filtered.length}{' '}
                {filtered.length === 1
                  ? 'doctor'
                  : 'doctors'}
              </span>
            )}

            {/* Refresh */}

            <button
              className="btn btn-ghost"
              onClick={fetchData}
              disabled={loading}
              title="Refresh"
            >
              {loading ? '…' : '↻'} Refresh
            </button>
          </div>
        )}

        {/* Doctors Table */}

        {!fetchError && (
          <div
            className="card"
            style={{
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              className="table-wrapper"
              style={{
                borderRadius: 0,
                border: 'none',
              }}
            >
              <table>

                <thead>
                  <tr>
                    <th>Doctor Name</th>
                    <th>Clinic</th>
                    <th>Phone</th>
                    <th>
                      Specialization
                    </th>
                    <th>Status</th>
                    <th
                      style={{
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>

                  {/* Loading */}

                  {loading ? (
                    [1, 2, 3, 4, 5].map(
                      (item) => (
                        <SkeletonRow
                          key={item}
                        />
                      )
                    )
                  ) : paginated.length === 0 ? (

                    /* Empty */

                    <tr>
                      <td
                        colSpan="6"
                        style={{
                          textAlign: 'center',
                          padding: '3rem',
                          color:
                            'var(--text-muted)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '2rem',
                            marginBottom:
                              '0.75rem',
                          }}
                        >
                          👨‍⚕️
                        </div>

                        {filtered.length === 0 &&
                        doctors.length === 0
                          ? 'No doctors found in the system.'
                          : 'No doctors match the current filters.'}
                      </td>
                    </tr>

                  ) : (

                    /* Doctor Rows */

                    paginated.map((doctor) => (
                      <tr
                        key={doctor.doctor_id}
                        id={`doctor-row-${doctor.doctor_id}`}
                      >

                        {/* Doctor Name */}

                        <td
                          style={{
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems:
                                'center',
                              gap: '0.5rem',
                            }}
                          >
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius:
                                  '50%',
                                background:
                                  'linear-gradient(135deg, #2563eb, #06b6d4)',
                                display: 'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                fontSize:
                                  '0.7rem',
                                fontWeight: 700,
                                color: 'white',
                                flexShrink: 0,
                              }}
                            >
                              {doctor.full_name
                                ?.split(' ')
                                .map(
                                  (word) =>
                                    word[0]
                                )
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>

                            <strong
                              style={{
                                fontSize:
                                  '0.875rem',
                              }}
                            >
                              {doctor.full_name?.startsWith(
                                'Dr.'
                              )
                                ? doctor.full_name
                                : `Dr. ${doctor.full_name}`}
                            </strong>
                          </div>
                        </td>

                        {/* Clinic */}

                        <td
                          style={{
                            whiteSpace:
                              'nowrap',
                            maxWidth: 160,
                          }}
                        >
                          <span
                            title={
                              doctor.clinic_name
                            }
                          >
                            {doctor.clinic_name ||
                              '—'}
                          </span>
                        </td>

                        {/* Phone */}

                        <td
                          style={{
                            fontFamily:
                              'monospace',
                            fontSize:
                              '0.83rem',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {doctor.phone || '—'}
                        </td>

                        {/* Specialization */}

                        <td>
                          {doctor.specialization ? (
                            <span
                              className="badge"
                              style={{
                                background:
                                  'rgba(16,185,129,0.1)',
                                color:
                                  '#34d399',
                                fontSize:
                                  '0.72rem',
                              }}
                            >
                              {
                                doctor.specialization
                              }
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Status */}

                        <td>
                          <StatusBadge
                            status={
                              doctor.status
                            }
                          />
                        </td>

                        {/* Actions */}

                        <td
                          style={{
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <button
                            className="btn btn-ghost"
                            style={{
                              padding:
                                '0.3rem 0.5rem',
                              fontSize:
                                '0.8rem',
                              marginRight:
                                '0.35rem',
                            }}
                            onClick={() =>
                              setViewDoctor(
                                doctor
                              )
                            }
                            title="View details"
                          >
                            👁 View
                          </button>

                          <button
                            className="btn btn-ghost"
                            style={{
                              padding: '0.3rem 0.5rem',
                              fontSize: '0.8rem',
                              marginRight: '0.35rem',
                            }}
                            onClick={() => {
                              setEditError('');
                              setEditDoctor(doctor);
                            }}
                            title="Edit doctor details"
                          >
                            ✏️ Edit
                          </button>

                          {/* Deactivate */}

                          {doctor.status ===
                            'Active' && (
                            <button
                              className="btn btn-ghost"
                              style={{
                                padding:
                                  '0.3rem 0.5rem',
                                fontSize:
                                  '0.8rem',
                                color:
                                  'var(--warning)',
                                opacity:
                                  deactivatingId ===
                                  doctor.doctor_id
                                    ? 0.5
                                    : 1,
                              }}
                              disabled={
                                deactivatingId ===
                                doctor.doctor_id
                              }
                              onClick={() =>
                                handleDeactivate(
                                  doctor
                                )
                              }
                              title="Deactivate doctor"
                            >
                              {deactivatingId ===
                              doctor.doctor_id
                                ? '⏳'
                                : '⛔'}{' '}
                              Deactivate
                            </button>
                          )}

                          {/* Already inactive */}

                          {doctor.status !==
                            'Active' && (
                            <span
                              style={{
                                fontSize:
                                  '0.75rem',
                                color:
                                  'var(--text-muted)',
                              }}
                            >
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}

            {!loading &&
              totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'space-between',
                    padding:
                      '0.9rem 1.25rem',
                    borderTop:
                      '1px solid var(--border)',
                    fontSize:
                      '0.85rem',
                    color:
                      'var(--text-muted)',
                  }}
                >
                  <span>
                    Showing{' '}
                    {((page - 1) *
                      PAGE_SIZE) +
                      1}
                    –
                    {Math.min(
                      page * PAGE_SIZE,
                      filtered.length
                    )}{' '}
                    of{' '}
                    {filtered.length}{' '}
                    doctors
                  </span>

                  <div
                    style={{
                      display: 'flex',
                      gap: '0.4rem',
                    }}
                  >
                    {/* Previous */}

                    <button
                      className="btn btn-ghost"
                      style={{
                        padding:
                          '0.3rem 0.75rem',
                        fontSize:
                          '0.8rem',
                      }}
                      disabled={
                        page === 1
                      }
                      onClick={() =>
                        setPage((p) =>
                          Math.max(
                            1,
                            p - 1
                          )
                        )
                      }
                    >
                      ← Prev
                    </button>

                    {/* Page Numbers */}

                    {Array.from(
                      {
                        length:
                          totalPages,
                      },
                      (_, i) => i + 1
                    )
                      .filter(
                        (pageNumber) =>
                          pageNumber ===
                            1 ||
                          pageNumber ===
                            totalPages ||
                          Math.abs(
                            pageNumber -
                              page
                          ) <= 1
                      )
                      .map(
                        (
                          pageNumber,
                          index,
                          pages
                        ) => (
                          <React.Fragment
                            key={
                              pageNumber
                            }
                          >
                            {index > 0 &&
                              pages[
                                index -
                                  1
                              ] !==
                                pageNumber -
                                  1 && (
                                <span
                                  style={{
                                    padding:
                                      '0.3rem 0.25rem',
                                    color:
                                      'var(--text-muted)',
                                  }}
                                >
                                  …
                                </span>
                              )}

                            <button
                              className={`btn ${
                                pageNumber ===
                                page
                                  ? 'btn-primary'
                                  : 'btn-ghost'
                              }`}
                              style={{
                                padding:
                                  '0.3rem 0.6rem',
                                fontSize:
                                  '0.8rem',
                                minWidth: 32,
                              }}
                              onClick={() =>
                                setPage(
                                  pageNumber
                                )
                              }
                            >
                              {pageNumber}
                            </button>
                          </React.Fragment>
                        )
                      )}

                    {/* Next */}

                    <button
                      className="btn btn-ghost"
                      style={{
                        padding:
                          '0.3rem 0.75rem',
                        fontSize:
                          '0.8rem',
                      }}
                      disabled={
                        page === totalPages
                      }
                      onClick={() =>
                        setPage((p) =>
                          Math.min(
                            totalPages,
                            p + 1
                          )
                        )
                      }
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminDoctors;