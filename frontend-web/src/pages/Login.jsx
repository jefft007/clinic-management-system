import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPass,  setShowPass]  = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter your email/username and password.');
      return;
    }

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      if      (result.role_id === 1) navigate('/admin/dashboard');
      else if (result.role_id === 2) navigate('/clinic/dashboard');
      else if (result.role_id === 3) navigate('/doctor/dashboard');
      else setError('Access denied: unrecognized role.');
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="auth-page">
      {/* LEFT SIDE: Brand Panel */}
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-brand-logo" style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            🏥
          </div>
          <h1 className="auth-brand-title">ClinicSystem</h1>
          <p className="auth-brand-desc" style={{ marginTop: '0.5rem', fontSize: '1.1rem', maxWidth: '400px' }}>
            The complete management platform for modern healthcare facilities.
          </p>

          <div className="auth-features" style={{ display: 'grid', gap: '1.5rem', marginTop: '3rem' }}>
            <div className="auth-feature" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="auth-feature-icon" style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>📅</div>
              <div>
                <h4 style={{ margin: 0, color: 'white', fontWeight: 600 }}>Smart Scheduling</h4>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Effortlessly manage appointments</p>
              </div>
            </div>
            <div className="auth-feature" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="auth-feature-icon" style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>📊</div>
              <div>
                <h4 style={{ margin: 0, color: 'white', fontWeight: 600 }}>Real-time Analytics</h4>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Track your clinic's performance</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Form Panel */}
      <div className="auth-form-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="auth-form-box" style={{ width: '100%', maxWidth: '440px', padding: '2rem' }}>
          
          <div className="auth-form-header" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>Welcome back</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Sign in to continue to your account.</p>
          </div>

          {error && (
            <div className="auth-error" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', color: '#f87171', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Email or Username
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email or username"
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

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Password</label>
                <Link to="/forgot-password" style={{ fontSize: '0.8rem', color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: '1.1rem'
                  }}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
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
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;