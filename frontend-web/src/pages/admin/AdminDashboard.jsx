// src/pages/admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

/* ── Relative time, e.g. "2 hours ago", "Yesterday" ── */
const timeAgo = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AdminDashboard = () => {
  const navigate = useNavigate();

  const [clinicCount, setClinicCount] = useState(null);
  const [doctorCount, setDoctorCount] = useState(null);
  const [staffCount,  setStaffCount]  = useState(null);
  const [loading,     setLoading]     = useState(true);

  const [activity,        setActivity]        = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // ── Fetch real counts: clinics, doctors, clinic staff ──
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clinicsRes, summaryRes] = await Promise.all([
          api.get('/admin/clinics'),
          api.get('/admin/reports/summary'),
        ]);

        if (clinicsRes.data.success) {
          setClinicCount(clinicsRes.data.count ?? clinicsRes.data.clinics?.length ?? 0);
        } else {
          setClinicCount(0);
        }

        if (summaryRes.data.success) {
          setDoctorCount(summaryRes.data.summary?.doctors ?? 0);
          setStaffCount(summaryRes.data.summary?.clinic_staff ?? 0);
        } else {
          setDoctorCount(0);
          setStaffCount(0);
        }
      } catch {
        // If unavailable fall back gracefully
        setClinicCount(null);
        setDoctorCount(null);
        setStaffCount(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ── Fetch real recent activity (no more demo/placeholder rows) ──
  useEffect(() => {
    const fetchActivity = async () => {
      setActivityLoading(true);
      try {
        const res = await api.get('/admin/recent-activity', { params: { limit: 8 } });
        if (res.data.success) setActivity(res.data.activity || []);
      } catch {
        setActivity([]);
      } finally {
        setActivityLoading(false);
      }
    };
    fetchActivity();
  }, []);

  const STATS = [
    {
      key:   'clinics',
      label: 'Total Clinics',
      icon:  '🏥',
      color: 'blue',
      value: clinicCount,
      link:  '/admin/clinics',
      linkLabel: 'Manage Clinics',
    },
    {
      key:   'doctors',
      label: 'Total Doctors',
      icon:  '👨‍⚕️',
      color: 'green',
      value: doctorCount,
      link:  '/admin/doctors',
      linkLabel: 'Manage Doctors',
    },
    {
      key:   'staff',
      label: 'Clinic Staff',
      icon:  '👥',
      color: 'purple',
      value: staffCount,
      link:  '/admin/roles',
      linkLabel: 'Roles & Users',
    },
  ];

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <p>System-wide overview — clinics, doctors &amp; staff.</p>
      </div>

      {/* ── Stat Cards ── */}
      <div className="dashboard-grid">
        {STATS.map(({ key, label, icon, color, value, link, linkLabel }) => (
          <div className={`stat-card ${color}`} key={key}>
            <div className={`stat-icon ${color}`}>{icon}</div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">
              {value !== null && value !== undefined
                ? value.toLocaleString()
                : <span className="skeleton" style={{ display: 'inline-block', width: 40, height: 32, verticalAlign: 'middle', borderRadius: 6 }} />
              }
            </div>
            {link ? (
              <button
                className="btn btn-ghost"
                style={{
                  marginTop:   '0.75rem',
                  padding:     '0.3rem 0.75rem',
                  fontSize:    '0.78rem',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color:       'var(--primary-light)',
                }}
                onClick={() => navigate(link)}
                id={`dash-link-${key}`}
              >
                {linkLabel} →
              </button>
            ) : (
              <div className="stat-meta" style={{ marginTop: '0.5rem' }}>
                More features coming soon
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Lower section: Recent Activity + Quick Actions side by side ── */}
      <div className="dashboard-lower-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start', marginTop: '1.5rem' }}>

        {/* Recent Activity */}
        <div className="card">
          <div className="section-title">Recent Activity</div>
          {activityLoading ? (
            <div className="activity-list">
              {[1, 2, 3].map(i => (
                <div className="activity-item" key={i}>
                  <div className="activity-dot" />
                  <div className="activity-body">
                    <div className="skeleton" style={{ height: 13, width: '70%', borderRadius: 4, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: '35%', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>
              No activity yet — new clinics, doctors, and staff will show up here as they're added.
            </div>
          ) : (
            <div className="activity-list">
              {activity.map((item, i) => (
                <div className="activity-item" key={i}>
                  <div className="activity-dot" />
                  <div className="activity-body">
                    <div className="activity-text">{item.icon} {item.text}</div>
                    <div className="activity-time">{timeAgo(item.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions — sits alongside Recent Activity */}
        <div className="card">
          <div className="section-title">Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button id="quick-add-clinic" className="btn btn-ghost btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => navigate('/admin/clinics')}>
              ➕ Add Clinic
            </button>
            <button id="quick-add-doctor" className="btn btn-ghost btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => navigate('/admin/doctors')}>
              👨‍⚕️ Add Doctor
            </button>
            <button id="quick-add-user" className="btn btn-ghost btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => navigate('/admin/roles')}>
              ➕ Add User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;