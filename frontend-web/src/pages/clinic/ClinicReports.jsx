// src/pages/clinic/ClinicReports.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

// Date-range presets — computed client-side, sent to the backend
// as plain from_date/to_date so the API stays simple.
const buildPresetRange = (preset) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') {
    return { from: toISO(today), to: toISO(today) };
  }
  if (preset === 'week') {
    const day = today.getDay(); // 0=Sun..6=Sat
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    return { from: toISO(monday), to: toISO(today) };
  }
  if (preset === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toISO(first), to: toISO(today) };
  }
  if (preset === 'year') {
    const first = new Date(today.getFullYear(), 0, 1);
    return { from: toISO(first), to: toISO(today) };
  }
  return { from: toISO(today), to: toISO(today) };
};

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year',  label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────

const Toast = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const styles = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#10b981', icon: '✅' },
    error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: '#ef4444', icon: '❌' },
  };
  const s = styles[toast.type] || styles.success;

  return (
    <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 'var(--radius)', color: s.color, fontSize: '0.875rem', fontWeight: 500, maxWidth: 400, boxShadow: 'var(--shadow)' }}>
      <span>{s.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: s.color, cursor: 'pointer', fontSize: '1rem' }}>✕</button>
    </div>
  );
};

// ─────────────────────────────────────────────
// Summary Cards
// ─────────────────────────────────────────────

const SummaryCards = ({ summary }) => {
  if (!summary) return null;
  const cards = [
    { label: 'Total Tokens', value: summary.total_tokens,  icon: '🎟️', color: '#3b82f6' },
    { label: 'Consulted',    value: summary.completed,     icon: '✅', color: '#10b981' },
    { label: 'Not Reported', value: summary.not_reported,  icon: '📭', color: '#f97316' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
      {cards.map(({ label, value, icon, color }) => (
        <div key={label} className="card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>{label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1 }}>{value ?? 0}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Simple Bar Chart (dependency-free — plain divs)
// ─────────────────────────────────────────────

const SimpleBarChart = ({ summary }) => {
  if (!summary) return null;

  const bars = [
    { label: 'Total',        value: summary.total_tokens,  color: '#3b82f6' },
    { label: 'Consulted',    value: summary.completed,     color: '#10b981' },
    { label: 'Not Reported', value: summary.not_reported,  color: '#f97316' },
  ];
  const max = Math.max(1, ...bars.map(b => b.value || 0));
  const CHART_HEIGHT = 160;

  return (
    <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <h4 style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Visual Summary
      </h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2.5rem', height: CHART_HEIGHT, padding: '0 0.25rem' }}>
        {bars.map(({ label, value, color }) => {
          const v = value ?? 0;
          const barHeight = Math.max((v / max) * CHART_HEIGHT, v > 0 ? 6 : 2);
          return (
            <div key={label} style={{ width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color, marginBottom: '0.4rem' }}>{v}</div>
              <div
                title={`${label}: ${v}`}
                style={{
                  width: '100%',
                  maxWidth: 60,
                  height: barHeight,
                  background: `linear-gradient(180deg, ${color}, ${color}aa)`,
                  borderRadius: '6px 6px 2px 2px',
                  transition: 'height 0.4s ease',
                }}
              />
              <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// PDF Generator (print-to-PDF via a new window — no external lib)
// ─────────────────────────────────────────────

const generatePDF = ({ clinicName, fromDate, toDate, summary, generatedAt }) => {
  const dateRange = fromDate === toDate ? formatDate(fromDate) : `${formatDate(fromDate)} – ${formatDate(toDate)}`;

  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: white; padding: 28px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; border-bottom: 2px solid #2563eb; padding-bottom: 16px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon { width: 42px; height: 42px; background: linear-gradient(135deg,#2563eb,#06b6d4); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .brand-name { font-size: 18px; font-weight: 800; color: #0f172a; }
    .brand-tagline { font-size: 10px; color: #64748b; }
    .report-meta { text-align: right; }
    .report-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 5px; }
    .meta-item { font-size: 10px; color: #64748b; margin-bottom: 3px; }
    .meta-item strong { color: #334155; }
    .summary-cards { display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 22px; min-width: 150px; }
    .summary-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px; }
    .summary-value { font-size: 26px; font-weight: 800; color: #2563eb; }
    .footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    @media print { body { padding: 0; } @page { margin: 1.5cm; size: A4 portrait; } }
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Clinic Report — ${clinicName || 'ClinicSystem'}</title><style>${CSS}</style></head>
  <body>
    <div class="header">
      <div class="brand">
        <div class="brand-icon">🏥</div>
        <div><div class="brand-name">${clinicName || 'ClinicSystem'}</div><div class="brand-tagline">Clinic Activity Report</div></div>
      </div>
      <div class="report-meta">
        <div class="report-title">Clinic Report</div>
        <div class="meta-item"><strong>Date Range:</strong> ${dateRange}</div>
        <div class="meta-item"><strong>Generated At:</strong> ${formatDateTime(generatedAt)}</div>
      </div>
    </div>
    <div class="summary-cards">
      <div class="summary-card"><div class="summary-label">Total Tokens</div><div class="summary-value">${summary.total_tokens ?? 0}</div></div>
      <div class="summary-card"><div class="summary-label">Consulted</div><div class="summary-value">${summary.completed ?? 0}</div></div>
      <div class="summary-card"><div class="summary-label">Not Reported</div><div class="summary-value">${summary.not_reported ?? 0}</div></div>
    </div>
    <div class="footer">
      <span>${clinicName || 'ClinicSystem'} — Confidential Report</span>
      <span>Generated: ${formatDateTime(generatedAt)}</span>
    </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=650');
  if (!win) { alert('Please allow pop-ups to generate PDF.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
};

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

const ClinicReports = () => {
  const todayISO = toISO(new Date());

  const [preset, setPreset]     = useState('today');
  const [fromDate, setFromDate] = useState(todayISO);
  const [toDate, setToDate]     = useState(todayISO);
  const [doctorId, setDoctorId] = useState('');
  const [session, setSession]   = useState('');
  const [status, setStatus]     = useState('');
  const [doctors, setDoctors]   = useState([]);

  const [reportData, setReportData] = useState(null);
  // Start "loading" so today's logs appear immediately on first paint
  // instead of showing the empty "select a range" placeholder first.
  const [loading, setLoading]       = useState(true);
  const [generated, setGenerated]   = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [toast, setToast]           = useState(null);

  const clinicName = (() => {
    try { return JSON.parse(localStorage.getItem('user'))?.clinic_name; } catch { return ''; }
  })();

  useEffect(() => {
    api.get('/clinic/doctors')
      .then(res => { if (res.data.success) setDoctors(res.data.doctors); })
      .catch(() => {});
  }, []);

  // Preset buttons just set the from/to dates — fetching only
  // happens when the user clicks Apply.
  const handlePreset = (value) => {
    setPreset(value);
    if (value !== 'custom') {
      const { from, to } = buildPresetRange(value);
      setFromDate(from);
      setToDate(to);
    }
  };

  // Shared fetch logic so both the initial "today" load and the
  // Apply button use the exact same request/response handling.
  const fetchReport = async (from, to, docId, sess, stat) => {
    if (!from || !to) {
      setToast({ type: 'error', message: 'Please select a valid date range.' });
      return;
    }
    if (new Date(from) > new Date(to)) {
      setToast({ type: 'error', message: 'From date cannot be after To date.' });
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ from_date: from, to_date: to });
      if (docId) params.append('doctor_id', docId);
      if (sess)  params.append('session', sess);
      if (stat)  params.append('status', stat);

      const res = await api.get(`/clinic/reports?${params.toString()}`);
      if (res.data.success) {
        setReportData(res.data);
        setGenerated(true);
        setGeneratedAt(new Date().toISOString());
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate report. Please try again.';
      setToast({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  // Auto-load today's logs as soon as the page opens, using the
  // default date range already set in state ('today' preset).
  useEffect(() => {
    fetchReport(fromDate, toDate, doctorId, session, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = () => fetchReport(fromDate, toDate, doctorId, session, status);

  const handleDownloadPDF = () => {
    if (!reportData) {
      setToast({ type: 'error', message: 'Click Apply to generate a report first.' });
      return;
    }
    generatePDF({
      clinicName,
      fromDate,
      toDate,
      summary: reportData.summary,
      generatedAt,
    });
  };

  const dateRangeLabel = fromDate === toDate ? formatDate(fromDate) : `${formatDate(fromDate)} → ${formatDate(toDate)}`;

  return (
    <div style={{ padding: '0 0 2rem' }}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Filters */}
      <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              className={preset === p.value ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem' }}>From Date</label>
            <input
              type="date"
              value={fromDate}
              max={todayISO}
              onChange={(e) => { setPreset('custom'); setFromDate(e.target.value); }}
              className="form-control"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem' }}>To Date</label>
            <input
              type="date"
              value={toDate}
              max={todayISO}
              onChange={(e) => { setPreset('custom'); setToDate(e.target.value); }}
              className="form-control"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem' }}>Doctor</label>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="form-control">
              <option value="">All Doctors</option>
              {doctors.map(d => (
                <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem' }}>Session</label>
            <select value={session} onChange={(e) => setSession(e.target.value)} className="form-control">
              <option value="">All Sessions</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem' }}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-control">
              <option value="">All Statuses</option>
              <option value="Booked">Booked</option>
              <option value="Reserved">Blocked</option>
              <option value="Waiting">Waiting</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Consulted</option>
              <option value="Not Reported">Not Reported</option>
              <option value="Absent">Absent</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem' }}>
            <button onClick={handleApply} disabled={loading} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              {loading ? 'Applying…' : 'Apply'}
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={!generated}
              className="btn btn-ghost"
              style={{ fontSize: '0.85rem', borderColor: 'rgba(37,99,235,0.4)', color: 'var(--primary-light)' }}
            >
              📄 Download PDF
            </button>
          </div>
        </div>
      </div>

      {loading && !reportData && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading report…</p>
        </div>
      )}

      {!loading && !reportData && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Select a date range and click Apply to generate the report.</p>
        </div>
      )}

      {reportData && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Report for {dateRangeLabel}</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Generated {formatDateTime(generatedAt)}</span>
          </div>

          <SummaryCards summary={reportData.summary} />
          <SimpleBarChart summary={reportData.summary} />
        </div>
      )}
    </div>
  );
};

export default ClinicReports;