import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../services/api';

const ResetPassword = () => {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);
  const [showPass,  setShowPass]  = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');

  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setTokenValid(false);
      return;
    }
    api.get('/auth/reset-password/validate?token=' + encodeURIComponent(token))
      .then((res) => setTokenValid(res.data.valid === true))
      .catch(() => setTokenValid(false))
      .finally(() => setIsValidating(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !confirm) {
      setError('Please fill in both fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="auth-page">
        <div className="auth-brand-panel" />
        <div className="auth-form-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
          <div style={{ color: 'var(--text-muted)' }}>Validating secure link...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-brand-logo" style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>🏥</div>
          <h1 className="auth-brand-title">ClinicSystem</h1>
          <p className="auth-brand-desc" style={{ marginTop: '0.5rem', fontSize: '1.1rem' }}>Secure account recovery.</p>
        </div>
      </div>

      <div className="auth-form-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="auth-form-box" style={{ width: '100%', maxWidth: '440px', padding: '2rem' }}>
          {!tokenValid ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
              <h2 style={{ color: 'white', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Invalid or Expired Link</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>This password reset link is invalid or has expired.</p>
              <Link to="/forgot-password" style={{ display: 'block', width: '100%', padding: '0.9rem', background: 'var(--primary)', color: 'white', borderRadius: '10px', textDecoration: 'none', fontWeight: 600 }}>
                Request New Link
              </Link>
            </div>
          ) : success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h2 style={{ color: 'white', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Password Updated</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your password has been reset successfully. Redirecting to login...</p>
            </div>
          ) : (
            <>
              <div className="auth-form-header" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>Set New Password</h2>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>Please enter a strong password.</p>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', color: '#f87171', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      style={{
                        width: '100%', padding: '0.85rem 2.8rem 0.85rem 1rem',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px', color: 'white', fontSize: '0.95rem',
                        outline: 'none', transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Confirm Password</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    style={{
                      width: '100%', padding: '0.85rem 1rem',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px', color: 'white', fontSize: '0.95rem',
                      outline: 'none', transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: '100%', padding: '0.9rem',
                    background: isLoading ? 'rgba(37,99,235,0.5)' : 'var(--primary)',
                    color: 'white', border: 'none', borderRadius: '10px',
                    fontSize: '1rem', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s', boxShadow: '0 4px 14px rgba(37,99,235,0.3)'
                  }}
                >
                  {isLoading ? 'Resetting...' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;