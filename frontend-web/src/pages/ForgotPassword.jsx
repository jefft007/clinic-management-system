import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const ForgotPassword = () => {
  const [email,     setEmail]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message,   setMessage]   = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [error,     setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setMessage('');
    setIsLoading(true);
    
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setIsSuccess(true);
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-brand-logo" style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            🏥
          </div>
          <h1 className="auth-brand-title">ClinicSystem</h1>
          <p className="auth-brand-desc" style={{ marginTop: '0.5rem', fontSize: '1.1rem', maxWidth: '400px' }}>
            Secure account recovery.
          </p>
        </div>
      </div>

      <div className="auth-form-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="auth-form-box" style={{ width: '100%', maxWidth: '440px', padding: '2rem' }}>
          <div className="auth-form-header" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>Reset Password</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Enter your email to request a reset link.</p>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', color: '#f87171', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          )}

          {isSuccess ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>Request Sent</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>{message}</p>
              <Link to="/login" style={{ display: 'block', width: '100%', padding: '0.9rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>
                Return to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
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
                  transition: 'background 0.2s', boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                  marginBottom: '1rem'
                }}
              >
                {isLoading ? 'Sending Request...' : 'Send Reset Link'}
              </button>

              <div style={{ textAlign: 'center' }}>
                <Link to="/login" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
                  ← Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;