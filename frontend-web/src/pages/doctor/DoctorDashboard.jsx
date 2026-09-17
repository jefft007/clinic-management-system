import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/* ─── Colour maps ─────────────────────────────────────────────────── */
const STATUS_COLORS = {
  Booked:       { bg: '#dbeafe', color: '#1d4ed8' },
  Reserved:     { bg: '#fff1ec', color: '#c2410c' },
  Waiting:      { bg: '#e0e7ff', color: '#4338ca' },
  'In Progress':{ bg: '#fef3c7', color: '#b45309' },
  Completed:    { bg: '#d1fae5', color: '#065f46' },
  Cancelled:    { bg: '#fee2e2', color: '#b91c1c' },
  Absent:       { bg: '#fee2e2', color: '#991b1b' },
  Skipped:      { bg: '#f3f4f6', color: '#4b5563' },
};

const STATUS_LABELS = { Completed: 'Consulted', Reserved: 'Blocked' };
const displayStatus = (s) => STATUS_LABELS[s] || s;

/* ─── Helpers ─────────────────────────────────────────────────────── */
const fmtTime = (iso) => {
  if (!iso) return null;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null :
    dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const pad = (n) => String(n).padStart(2, '0');
const localISODate = (d = new Date()) => {
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};
const offsetDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localISODate(d); };
const offsetMonth = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return localISODate(d); };

/* ─── Sub-components ──────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: '20px', padding: '0.22rem 0.65rem',
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      letterSpacing: '0.02em',
    }}>
      {displayStatus(status)}
    </span>
  );
};

/* Animated count-up number */
const AnimatedCount = ({ value }) => {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    const start = 0;
    const end = value;
    const duration = 600;
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return <span>{display}</span>;
};

/* Stat widget */
const StatCard = ({ icon, label, value, gradient, active, onClick, pulse }) => (
  <button
    onClick={onClick}
    style={{
      position: 'relative',
      padding: '0.6rem 0.8rem',
      borderRadius: '12px',
      background: gradient,
      border: active ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent',
      cursor: 'pointer',
      textAlign: 'left',
      color: '#fff',
      overflow: 'hidden',
      transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s',
      boxShadow: active
        ? '0 8px 32px rgba(0,0,0,0.35), 0 0 0 3px rgba(255,255,255,0.15)'
        : '0 4px 16px rgba(0,0,0,0.25)',
      transform: active ? 'translateY(-2px) scale(1.02)' : 'translateY(0) scale(1)',
      width: '100%',
      flex: '1 1 160px',
      minWidth: '140px',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
  >
    {/* Glow blob */}
    <span style={{
      position: 'absolute', top: '-15px', right: '-15px',
      width: '60px', height: '60px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.12)',
      pointerEvents: 'none',
    }} />
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
      <span style={{
        fontSize: '1.2rem', lineHeight: 1, marginTop: '2px',
        ...(pulse ? { animation: 'pulseIcon 2s ease-in-out infinite' } : {}),
      }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.1rem' }}>{label}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>
          <AnimatedCount value={value} />
        </div>
      </div>
    </div>
    {active && (
      <span style={{
        position: 'absolute', bottom: '0.55rem', right: '0.7rem',
        fontSize: '0.65rem', fontWeight: 700, opacity: 0.9,
        background: 'rgba(255,255,255,0.2)', borderRadius: '20px',
        padding: '0.15rem 0.4rem',
      }}>
        Filtered ✓
      </span>
    )}
  </button>
);

/* ─── Main component ──────────────────────────────────────────────── */
const DoctorDashboard = () => {
  const { user } = useAuth();

  const [dateFilter, setDateFilter] = useState('today');
  const [customRange, setCustomRange] = useState({ from: localISODate(), to: localISODate() });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeWidget, setActiveWidget] = useState(null); // 'total' | 'waiting' | 'inProgress' | 'completed'

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  const getEffectiveRange = useCallback(() => {
    switch (dateFilter) {
      case 'today':    return { from: localISODate(), to: localISODate() };
      case 'tomorrow': return { from: offsetDate(1), to: offsetDate(1) };
      case 'week':     return { from: localISODate(), to: offsetDate(7) };
      case 'month':    return { from: localISODate(), to: offsetMonth(1) };
      case 'custom':   return customRange;
      default:         return { from: localISODate(), to: localISODate() };
    }
  }, [dateFilter, customRange]);

  const fetchDashboard = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    const range = getEffectiveRange();
    try {
      const res = await api.get(`/doctor/appointments?from_date=${range.from}&to_date=${range.to}`);
      if (res.data.success) setAppointments(res.data.appointments || []);
    } catch (err) {
      console.error(err);
      if (!isPolling) showToast('Failed to load dashboard data', 'error');
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [getEffectiveRange]);

  useEffect(() => { 
    fetchDashboard(); 
    const interval = setInterval(() => {
      fetchDashboard(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  /* Reset widget filter when date range changes */
  useEffect(() => { setActiveWidget(null); }, [dateFilter, customRange]);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/doctor/appointments/${id}/status`, { status });
      showToast(`Status updated to ${displayStatus(status)}`);
      fetchDashboard();
    } catch (err) {
      showToast(err.response?.data?.message || 'Update failed', 'error');
    }
  };

  /* ── Stats ── */
  const stats = {
    total:      appointments.length,
    waiting:    appointments.filter(a => a.status === 'Waiting').length,
    inProgress: appointments.filter(a => a.status === 'In Progress').length,
    completed:  appointments.filter(a => a.status === 'Completed').length,
  };

  /* ── Widget filter logic ── */
  const widgetFilter = {
    total:      null,                // show all
    waiting:    a => a.status === 'Waiting',
    inProgress: a => a.status === 'In Progress',
    completed:  a => a.status === 'Completed',
  };

  const visibleAppointments = activeWidget && widgetFilter[activeWidget]
    ? appointments.filter(widgetFilter[activeWidget])
    : appointments;

  const handleWidgetClick = (key) => {
    setActiveWidget(prev => (prev === key ? null : key));
  };

  /* ── Greeting ── */
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  /* ── Group by date ── */
  const grouped = visibleAppointments.reduce((acc, appt) => {
    const key = appt.appointment_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(appt);
    return acc;
  }, {});

  const FILTER_BTNS = [
    { key: 'today',    label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'week',     label: 'Next 7 Days' },
    { key: 'month',    label: 'Next 30 Days' },
    { key: 'custom',   label: 'Custom' },
  ];

  const WIDGET_DATA = [
    {
      key: 'total', icon: '📋', label: 'Total Appointments', value: stats.total,
      gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      pulse: false,
    },
    {
      key: 'waiting', icon: '⏳', label: 'Waiting', value: stats.waiting,
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
      pulse: stats.waiting > 0,
    },
    {
      key: 'inProgress', icon: '🩺', label: 'In Progress', value: stats.inProgress,
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      pulse: stats.inProgress > 0,
    },
    {
      key: 'completed', icon: '✅', label: 'Consulted', value: stats.completed,
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      pulse: false,
    },
  ];

  const activeWidgetLabel = activeWidget
    ? WIDGET_DATA.find(w => w.key === activeWidget)?.label
    : null;

  return (
    <div style={{ animation: 'fadeSlideIn 0.4s ease' }}>
      <style>{`
        .highlight-date-val::-webkit-datetime-edit-day-field {
          color: #ef4444 !important;
          background: rgba(239, 68, 68, 0.2);
          border-radius: 4px;
        }
        .highlight-date-val::-webkit-datetime-edit-month-field,
        .highlight-date-val::-webkit-datetime-edit-year-field,
        .highlight-date-val::-webkit-datetime-edit-text {
          color: #fff !important;
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseIcon {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.15); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .dash-row-anim { animation: rowIn 0.25s ease both; }
        .date-pill-btn {
          padding: 0.35rem 0.85rem;
          font-size: 0.8rem;
          border-radius: 20px;
          border: none;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.18s;
        }
        .date-pill-btn.active {
          background: var(--primary);
          color: #fff;
          box-shadow: 0 2px 8px rgba(37,99,235,0.4);
        }
        .date-pill-btn.inactive {
          background: rgba(255,255,255,0.06);
          color: var(--text-secondary);
        }
        .date-pill-btn.inactive:hover {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }
        .appt-row:hover td { background: rgba(255,255,255,0.04) !important; }
        .appt-row td { transition: background 0.15s; }
        .action-btn {
          padding: 0.28rem 0.65rem;
          font-size: 0.72rem;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.18s;
          white-space: nowrap;
        }
        .action-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .action-btn.start { background: var(--primary); color: #fff; }
        .action-btn.consulted { background: var(--success); color: #fff; }
        .filter-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(99,102,241,0.15);
          color: #a5b4fc;
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: 20px;
          padding: 0.3rem 0.8rem;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
        }
        .filter-pill:hover { background: rgba(99,102,241,0.25); }
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 3000,
          background: toast.type === 'error'
            ? 'linear-gradient(135deg,#ef4444,#dc2626)'
            : 'linear-gradient(135deg,#10b981,#059669)',
          color: '#fff', padding: '0.8rem 1.25rem', borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.88rem', fontWeight: 600,
          animation: 'toastIn 0.3s ease',
          backdropFilter: 'blur(8px)',
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.2rem', fontWeight: 800, background: 'linear-gradient(90deg,#fff,#94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {greeting()}, Dr. {user?.full_name?.split(' ')[0]} 👋
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Schedule &amp; patient flow overview
          </p>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: '10px', padding: '0.4rem 0.85rem', border: '1px solid var(--border)' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* ── Date Filters ── */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '0.65rem 1rem',
        marginBottom: '1.1rem',
        display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        {FILTER_BTNS.map(btn => (
          <button
            key={btn.key}
            className={`date-pill-btn ${dateFilter === btn.key ? 'active' : 'inactive'}`}
            onClick={() => setDateFilter(btn.key)}
          >
            {btn.label}
          </button>
        ))}

        <div style={{ width: '1px', height: '26px', background: 'var(--border)', margin: '0 0.3rem', flexShrink: 0 }} />

        {/* Date range display — always visible, highlights when any preset active */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          flexWrap: 'wrap',
          padding: '0.3rem 0.6rem',
          borderRadius: 10,
          border: dateFilter
            ? '1.5px solid rgba(37,99,235,0.55)'
            : '1.5px solid var(--border)',
          background: dateFilter
            ? 'rgba(37,99,235,0.08)'
            : 'transparent',
          boxShadow: dateFilter
            ? '0 0 0 3px rgba(37,99,235,0.12)'
            : 'none',
          transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {/* "From" label */}
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: dateFilter ? 'var(--primary-light)' : 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            whiteSpace: 'nowrap',
            transition: 'color 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}>
            <span style={{ fontSize: '1.35rem' }}>📅</span> From:
          </span>

          <input
            type="date"
            className={dateFilter ? 'highlight-date-val' : ''}
            value={customRange.from}
            onChange={e => { setCustomRange(p => ({ ...p, from: e.target.value })); setDateFilter('custom'); }}
            style={{
              padding: '0.26rem 0.42rem',
              fontSize: '0.76rem',
              width: 128,
              borderRadius: 7,
              border: dateFilter
                ? '1px solid rgba(37,99,235,0.45)'
                : '1px solid var(--border)',
              background: dateFilter
                ? 'rgba(37,99,235,0.1)'
                : 'var(--bg-elevated)',
              color: dateFilter ? '#fff' : 'var(--text-secondary)',
              fontWeight: dateFilter ? 600 : 400,
              transition: 'all 0.2s',
              outline: 'none',
            }}
          />

          <span style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: dateFilter ? 'var(--primary-light)' : 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            transition: 'color 0.2s',
          }}>TO:</span>

          <input
            type="date"
            className={dateFilter ? 'highlight-date-val' : ''}
            value={customRange.to}
            onChange={e => { setCustomRange(p => ({ ...p, to: e.target.value })); setDateFilter('custom'); }}
            style={{
              padding: '0.26rem 0.42rem',
              fontSize: '0.76rem',
              width: 128,
              borderRadius: 7,
              border: dateFilter
                ? '1px solid rgba(37,99,235,0.45)'
                : '1px solid var(--border)',
              background: dateFilter
                ? 'rgba(37,99,235,0.1)'
                : 'var(--bg-elevated)',
              color: dateFilter ? '#fff' : 'var(--text-secondary)',
              fontWeight: dateFilter ? 600 : 400,
              transition: 'all 0.2s',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ── Stat Widgets ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: '0.85rem',
        marginBottom: '1.1rem',
        paddingBottom: '0.25rem',
      }}>
        {WIDGET_DATA.map(w => (
          <StatCard
            key={w.key}
            icon={w.icon}
            label={w.label}
            value={w.value}
            gradient={w.gradient}
            active={activeWidget === w.key}
            onClick={() => handleWidgetClick(w.key)}
            pulse={w.pulse}
          />
        ))}
      </div>

      {/* ── Active filter banner ── */}
      {activeWidget && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '0.75rem',
          padding: '0.55rem 1rem',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '10px',
          animation: 'fadeSlideIn 0.25s ease',
        }}>
          <span style={{ fontSize: '0.82rem', color: '#a5b4fc', fontWeight: 600 }}>
            Showing: <strong>{activeWidgetLabel}</strong>
            &nbsp;·&nbsp;{visibleAppointments.length} appointment{visibleAppointments.length !== 1 ? 's' : ''}
          </span>
          <button
            className="filter-pill"
            onClick={() => setActiveWidget(null)}
            style={{ marginLeft: 'auto' }}
          >
            ✕ Clear filter
          </button>
        </div>
      )}

      {/* ── Appointment List ── */}
      {loading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '0.75rem', minHeight: '200px',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: '14px',
        }}>
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading appointments…</span>
        </div>
      ) : visibleAppointments.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem 2rem',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: '14px', color: 'var(--text-muted)',
          animation: 'fadeSlideIn 0.3s ease',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
            {activeWidget === 'waiting' ? '⏳' : activeWidget === 'inProgress' ? '🩺' : activeWidget === 'completed' ? '✅' : '📅'}
          </div>
          <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
            {activeWidget ? `No ${activeWidgetLabel?.toLowerCase()} appointments` : 'No appointments scheduled'}
          </p>
          <p style={{ fontSize: '0.82rem' }}>for this period.</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 340px)',
          overflowY: 'auto',
        }}>
          {Object.entries(grouped).map(([dateKey, appts], groupIdx) => (
            <div key={dateKey}>
              {/* Date section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 1rem',
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, zIndex: 2,
              }}>
                <span style={{
                  background: 'var(--primary)', color: '#fff',
                  borderRadius: '6px', padding: '0.18rem 0.65rem',
                  fontSize: '0.75rem', fontWeight: 700,
                }}>
                  {new Date(dateKey).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {appts.length} token{appts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Token', 'Patient', 'Session', 'Status', 'Quick Actions'].map((h, i) => (
                      <th key={h} style={{
                        padding: '0.5rem 0.85rem', textAlign: i === 4 ? 'right' : 'left',
                        fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appts.map((a, rowIdx) => (
                    <tr
                      key={a.appointment_id}
                      className="appt-row dash-row-anim"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        animationDelay: `${rowIdx * 0.04}s`,
                      }}
                    >
                      {/* Token */}
                      <td style={{ padding: '0.55rem 0.85rem' }}>
                        {(() => {
                          let bg = 'var(--primary-glow)';
                          let color = 'var(--primary)';
                          switch (a.status) {
                            case 'Completed':
                              bg = 'rgba(16, 185, 129, 0.15)'; color = '#10b981'; break;
                            case 'In Progress':
                              bg = 'rgba(245, 158, 11, 0.15)'; color = '#f59e0b'; break;
                            case 'Waiting':
                              bg = 'rgba(59, 130, 246, 0.15)'; color = '#3b82f6'; break;
                            case 'Booked':
                            case 'Reserved':
                              bg = 'rgba(148, 163, 184, 0.12)'; color = '#94a3b8'; break;
                          }
                          return (
                            <span style={{
                              background: bg, color: color,
                              borderRadius: '6px', padding: '0.2rem 0.5rem',
                              fontSize: '0.78rem', fontWeight: 800,
                            }}>
                              #{a.token_number}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Patient */}
                      <td style={{ padding: '0.55rem 0.85rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{a.patient_name || '—'}</div>
                        {a.patient_phone && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                            {a.patient_phone}
                          </div>
                        )}
                      </td>

                      {/* Session */}
                      <td style={{ padding: '0.55rem 0.85rem' }}>
                        <span style={{
                          fontSize: '0.78rem', fontWeight: 600,
                          color: a.session === 'Morning' ? '#fbbf24' : '#60a5fa',
                          background: a.session === 'Morning' ? 'rgba(251,191,36,0.1)' : 'rgba(96,165,250,0.1)',
                          borderRadius: '6px', padding: '0.15rem 0.45rem',
                        }}>
                          {a.session === 'Morning' ? '🌤 Morning' : '🌙 Evening'}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.55rem 0.85rem' }}>
                        <StatusBadge status={a.status} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {['Booked', 'Reserved', 'Waiting'].includes(a.status) && (
                            <button
                              className="action-btn start"
                              onClick={() => updateStatus(a.appointment_id, 'In Progress')}
                            >
                              ▶ Start
                            </button>
                          )}
                          {a.status === 'In Progress' && (
                            <button
                              className="action-btn consulted"
                              onClick={() => updateStatus(a.appointment_id, 'Completed')}
                            >
                              ✓ Mark Consulted
                            </button>
                          )}
                          {['Booked', 'Reserved', 'Waiting', 'In Progress', 'Completed', 'Absent', 'Cancelled', 'Skipped'].includes(a.status) && !['Booked','Reserved','Waiting','In Progress'].includes(a.status) && null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
