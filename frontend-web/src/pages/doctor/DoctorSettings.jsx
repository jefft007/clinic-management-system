import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const DoctorSettings = () => {
  const { user } = useAuth();

  // ── Change Password state ──────────────────────────────────────────────────
  const [cpForm,      setCpForm]      = useState({ current: '', newPass: '', confirm: '' });
  const [cpLoading,   setCpLoading]   = useState(false);
  const [cpError,     setCpError]     = useState('');
  const [cpSuccess,   setCpSuccess]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCpChange = (e) => {
    setCpForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setCpError('');
    setCpSuccess('');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setCpError('');
    setCpSuccess('');

    if (!cpForm.current || !cpForm.newPass || !cpForm.confirm) {
      setCpError('All fields are required.');
      return;
    }
    if (cpForm.newPass.length < 6) {
      setCpError('New password must be at least 6 characters.');
      return;
    }
    if (cpForm.newPass !== cpForm.confirm) {
      setCpError('New passwords do not match.');
      return;
    }

    setCpLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: cpForm.current,
        newPassword:     cpForm.newPass,
      });
      setCpSuccess('Password changed successfully!');
      setCpForm({ current: '', newPass: '', confirm: '' });
    } catch (err) {
      setCpError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setCpLoading(false);
    }
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputWrap = { position: 'relative', width: '100%' };

  const inputStyle = {
    width: '100%', padding: '0.75rem 2.8rem 0.75rem 0.9rem',
    background: 'rgba(30,41,59,0.7)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#f1f5f9', fontSize: '0.875rem',
    fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  const eyeBtn = {
    position: 'absolute', right: '0.75rem', top: '50%',
    transform: 'translateY(-50%)',
    background: 'none', border: 'none',
    cursor: 'pointer', color: 'rgba(100,116,139,0.8)',
    fontSize: '1rem', padding: 0, lineHeight: 1,
  };

  const labelStyle = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600,
    color: 'rgba(148,163,184,0.9)', marginBottom: '0.4rem',
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '1.5rem',
    marginBottom: '1.25rem',
  };

  const sectionTitle = {
    fontSize: '1rem', fontWeight: 700,
    color: '#f1f5f9', marginBottom: '0.25rem',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  };

  const sectionSub = {
    fontSize: '0.8rem', color: 'rgba(148,163,184,0.7)',
    marginBottom: '1.25rem', marginTop: '0.1rem',
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚙️ Settings
        </h2>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Account security and password management.
        </p>
      </div>

      {/* ── Change Password ─────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>🔒 Change Password</div>
        <div style={sectionSub}>Update your current password. You will stay logged in after changing it.</div>

        {cpError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '0.65rem 0.9rem', marginBottom: '1rem', fontSize: '0.825rem', color: '#f87171', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            ⚠️ {cpError}
          </div>
        )}
        {cpSuccess && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', padding: '0.65rem 0.9rem', marginBottom: '1rem', fontSize: '0.825rem', color: '#86efac', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            ✅ {cpSuccess}
          </div>
        )}

        <form onSubmit={handleChangePassword} noValidate>
          {/* Current password */}
          <div style={{ marginBottom: '0.9rem' }}>
            <label style={labelStyle}>Current Password</label>
            <div style={inputWrap}>
              <input
                name="current" type={showCurrent ? 'text' : 'password'}
                value={cpForm.current} onChange={handleCpChange}
                placeholder="Enter current password"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(37,99,235,0.6)'}
                onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button type="button" style={eyeBtn} onClick={() => setShowCurrent(v => !v)}>
                {showCurrent ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* New password */}
          <div style={{ marginBottom: '0.9rem' }}>
            <label style={labelStyle}>New Password</label>
            <div style={inputWrap}>
              <input
                name="newPass" type={showNew ? 'text' : 'password'}
                value={cpForm.newPass} onChange={handleCpChange}
                placeholder="Enter new password (min 6 chars)"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(37,99,235,0.6)'}
                onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button type="button" style={eyeBtn} onClick={() => setShowNew(v => !v)}>
                {showNew ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm new password */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Confirm New Password</label>
            <div style={inputWrap}>
              <input
                name="confirm" type={showConfirm ? 'text' : 'password'}
                value={cpForm.confirm} onChange={handleCpChange}
                placeholder="Re-enter new password"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(37,99,235,0.6)'}
                onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button type="button" style={eyeBtn} onClick={() => setShowConfirm(v => !v)}>
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit" disabled={cpLoading}
            style={{
              padding: '0.75rem 1.5rem',
              background: cpLoading ? 'rgba(37,99,235,0.4)' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
              color: 'white', border: 'none', borderRadius: '9px',
              fontSize: '0.875rem', fontWeight: 700,
              cursor: cpLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: cpLoading ? 'none' : '0 6px 20px rgba(37,99,235,0.3)',
            }}
          >
            {cpLoading ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* ── Forgot / Reset Password ─────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>🔑 Forgot Your Password?</div>
        <div style={sectionSub}>
          If you have forgotten your current password, you can submit a reset request.
          The administrator will review it and send a reset link to your registered email address.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '0.8rem', color: 'rgba(148,163,184,0.7)', lineHeight: 1.6 }}>
              Your registered email: <strong style={{ color: '#f1f5f9' }}>{user?.email}</strong>
            </div>
          </div>
          <Link
            to="/forgot-password"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.7rem 1.2rem',
              background: 'rgba(37,99,235,0.12)',
              border: '1px solid rgba(37,99,235,0.3)',
              borderRadius: '9px',
              color: '#93c5fd', textDecoration: 'none',
              fontSize: '0.86rem', fontWeight: 700,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            📧 Request Reset Link
          </Link>
        </div>
      </div>

      {/* ── Account Info ────────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>👤 Account Information</div>
        <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.5rem' }}>
          {[
            { label: 'Full Name',  value: user?.full_name },
            { label: 'Email',      value: user?.email },
            { label: 'Role',       value: user?.role_name },
            { label: 'Clinic',     value: user?.clinic_name },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.7)', minWidth: 100 }}>{row.label}</span>
              <span style={{ fontSize: '0.875rem', color: '#f1f5f9', fontWeight: 500 }}>{row.value || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DoctorSettings;