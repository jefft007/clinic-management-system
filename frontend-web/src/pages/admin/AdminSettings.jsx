import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const fmt = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const StatusBadge = ({ status }) => {
  const cfg = {
    pending:  { bg:'rgba(234,179,8,0.15)',  border:'rgba(234,179,8,0.3)',  color:'#fde047', label:'Pending'  },
    approved: { bg:'rgba(34,197,94,0.15)',  border:'rgba(34,197,94,0.3)',  color:'#86efac', label:'Approved' },
    rejected: { bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.25)', color:'#f87171', label:'Rejected' },
  };
  const s = cfg[status] || cfg.pending;
  return (
    <span style={{
      display:'inline-block', padding:'0.25rem 0.65rem',
      background:s.bg, border:'1px solid ' + s.border,
      borderRadius:'20px', fontSize:'0.72rem', fontWeight:700,
      color:s.color, letterSpacing:'0.04em', textTransform:'uppercase',
    }}>
      {s.label}
    </span>
  );
};

const AdminSettings = () => {
  const [requests,  setRequests]  = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId,  setActionId]  = useState(null);
  const [toast,     setToast]     = useState(null);
  const [activeTab, setActiveTab] = useState('password-requests');

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/password-reset-requests');
      setRequests(res.data.requests || []);
    } catch {
      showToast('error', 'Failed to load reset requests.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleApprove = async (id, email) => {
    if (!window.confirm('Send a password reset link to ' + email + '?')) return;
    setActionId(id);
    try {
      const res = await api.post('/admin/password-reset-requests/' + id + '/approve');
      showToast('success', res.data.message || 'Reset link sent!');
      loadRequests();
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to send reset link.');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('Reject this reset request?')) return;
    setActionId(id);
    try {
      await api.post('/admin/password-reset-requests/' + id + '/reject');
      showToast('success', 'Request rejected.');
      loadRequests();
    } catch {
      showToast('error', 'Failed to reject request.');
    } finally {
      setActionId(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const tabStyle = (active) => ({
    padding:'0.55rem 1.1rem',
    background: active ? 'rgba(37,99,235,0.2)' : 'transparent',
    border: active ? '1px solid rgba(37,99,235,0.4)' : '1px solid rgba(255,255,255,0.07)',
    borderRadius:'8px',
    color: active ? '#93c5fd' : 'rgba(148,163,184,0.7)',
    fontWeight: active ? 700 : 500,
    fontSize:'0.85rem',
    cursor:'pointer',
    transition:'all 0.2s',
    display:'flex', alignItems:'center', gap:'0.4rem',
  });

  return (
    <div style={{ maxWidth:'1100px', margin:'0 auto' }}>
      {toast && (
        <div style={{
          position:'fixed', top:'1.5rem', right:'1.5rem', zIndex:9999,
          background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: '1px solid ' + (toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'),
          borderRadius:'12px',
          padding:'0.85rem 1.25rem',
          color: toast.type === 'success' ? '#86efac' : '#f87171',
          fontSize:'0.875rem', fontWeight:600,
          boxShadow:'0 8px 30px rgba(0,0,0,0.4)',
          maxWidth:'360px', lineHeight:1.5,
          display:'flex', alignItems:'center', gap:'0.5rem',
        }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.text}
        </div>
      )}

      <div className="page-header" style={{ marginBottom:'1.5rem' }}>
        <h2 style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          ⚙️ Settings
        </h2>
        <p style={{ color:'var(--text-muted)', margin:0 }}>System configuration and administration tools.</p>
      </div>

      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        <button style={tabStyle(activeTab === 'password-requests')} onClick={() => setActiveTab('password-requests')}>
          🔑 Password Reset Requests
          {pendingCount > 0 && (
            <span style={{
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              background:'#ef4444', color:'white',
              borderRadius:'50%', width:18, height:18,
              fontSize:'0.65rem', fontWeight:800, lineHeight:1,
            }}>{pendingCount}</span>
          )}
        </button>
      </div>

      {activeTab === 'password-requests' && (
        <div className="card" style={{ padding:'1.5rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
            <div>
              <h3 style={{ margin:0, fontSize:'1rem', fontWeight:700, color:'var(--text-primary)' }}>
                Password Reset Requests
              </h3>
              <p style={{ margin:'0.2rem 0 0', fontSize:'0.8rem', color:'var(--text-muted)' }}>
                Clinic and doctor accounts who have requested a password reset.
              </p>
            </div>
            <button
              onClick={loadRequests}
              style={{
                padding:'0.5rem 1rem',
                background:'rgba(37,99,235,0.1)', border:'1px solid rgba(37,99,235,0.25)',
                borderRadius:'8px', color:'#93c5fd',
                fontSize:'0.82rem', fontWeight:600, cursor:'pointer',
                display:'flex', alignItems:'center', gap:'0.4rem',
              }}
            >
              🔄 Refresh
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-muted)' }}>
              <p style={{ margin:0, fontSize:'0.875rem' }}>Loading requests…</p>
            </div>
          ) : requests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem 1rem', color:'var(--text-muted)' }}>
              <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>✅</div>
              <p style={{ margin:0, fontWeight:600, fontSize:'0.95rem', marginBottom:'0.25rem' }}>No reset requests</p>
              <p style={{ margin:0, fontSize:'0.82rem' }}>No password reset requests have been submitted yet.</p>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                    {['Name', 'Email', 'Role', 'Clinic', 'Requested At', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding:'0.6rem 0.75rem', textAlign:'left', fontWeight:600, fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding:'0.75rem', color:'var(--text-primary)', fontWeight:500, whiteSpace:'nowrap' }}>{req.full_name}</td>
                      <td style={{ padding:'0.75rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{req.email}</td>
                      <td style={{ padding:'0.75rem', whiteSpace:'nowrap' }}>
                        <span style={{
                          background: req.role_name === 'clinic' ? 'rgba(6,182,212,0.12)' : 'rgba(139,92,246,0.12)',
                          border: '1px solid ' + (req.role_name === 'clinic' ? 'rgba(6,182,212,0.25)' : 'rgba(139,92,246,0.25)'),
                          color: req.role_name === 'clinic' ? '#67e8f9' : '#c4b5fd',
                          borderRadius:'20px', padding:'0.2rem 0.6rem',
                          fontSize:'0.72rem', fontWeight:600, textTransform:'capitalize',
                        }}>
                          {req.role_name}
                        </span>
                      </td>
                      <td style={{ padding:'0.75rem', color:'var(--text-muted)', fontSize:'0.82rem' }}>{req.clinic_name || '—'}</td>
                      <td style={{ padding:'0.75rem', color:'var(--text-muted)', fontSize:'0.8rem', whiteSpace:'nowrap' }}>{fmt(req.requested_at)}</td>
                      <td style={{ padding:'0.75rem' }}><StatusBadge status={req.status} /></td>
                      <td style={{ padding:'0.75rem' }}>
                        {req.status === 'pending' ? (
                          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                            <button
                              onClick={() => handleApprove(req.id, req.email)}
                              disabled={actionId === req.id}
                              style={{
                                padding:'0.35rem 0.8rem',
                                background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)',
                                borderRadius:'7px', color:'#86efac',
                                fontSize:'0.78rem', fontWeight:700, cursor:'pointer',
                                display:'flex', alignItems:'center', gap:'0.3rem',
                                opacity: actionId === req.id ? 0.6 : 1,
                              }}
                            >
                              {actionId === req.id ? '⏳' : '✅'} Approve & Send
                            </button>
                            <button
                              onClick={() => handleReject(req.id)}
                              disabled={actionId === req.id}
                              style={{
                                padding:'0.35rem 0.8rem',
                                background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)',
                                borderRadius:'7px', color:'#f87171',
                                fontSize:'0.78rem', fontWeight:700, cursor:'pointer',
                                opacity: actionId === req.id ? 0.6 : 1,
                              }}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
                            {req.status === 'approved' ? 'Sent ' + fmt(req.reviewed_at) : 'Rejected ' + fmt(req.reviewed_at)}
                          </span>
                        )}
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
  );
};

export default AdminSettings;