// src/pages/admin/Reports.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

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
  const cards = [
    { label: 'Total Users',   value: summary.total_users,  icon: '👥', color: '#3b82f6' },
    { label: 'Clinic Staff',  value: summary.clinic_staff, icon: '🏥', color: '#10b981' },
    { label: 'Doctors',       value: summary.doctors,      icon: '👨‍⚕️', color: '#8b5cf6' },
    { label: 'Clinics',       value: summary.clinics,      icon: '🏢', color: '#f59e0b' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
      {cards.map(({ label, value, icon, color }) => (
        <div key={label} className="card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>{label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Status badge helper
// ─────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const isActive = status?.toLowerCase() === 'active';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 600, background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: isActive ? '#10b981' : '#f59e0b' }}>
      {status || 'Unknown'}
    </span>
  );
};

// ─────────────────────────────────────────────
// Report Tables
// ─────────────────────────────────────────────

const UsersTable = ({ data }) => {
  if (!data || data.length === 0) return <EmptyTable colSpan={8} />;
  return (
    <div className="table-wrapper" style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Phone 2</th>
            <th>Role</th><th>Clinic</th><th>Status</th><th>Created On</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td><strong>{d.full_name}</strong></td>
              <td style={{ fontSize: '0.82rem' }}>{d.email || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.phone || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.alternate_phone || '—'}</td>
              <td style={{ fontSize: '0.8rem' }}>{d.role_name || '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.clinic_name || '—'}</td>
              <td><StatusBadge status={d.status} /></td>
              <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StaffTable = ({ data }) => {
  if (!data || data.length === 0) return <EmptyTable colSpan={8} />;
  return (
    <div className="table-wrapper" style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table>
        <thead>
          <tr>
            <th>Staff Name</th><th>Email</th><th>Phone</th><th>Phone 2</th>
            <th>Role</th><th>Clinic</th><th>Status</th><th>Created On</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td><strong>{d.full_name}</strong></td>
              <td style={{ fontSize: '0.82rem' }}>{d.email || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.phone || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.alternate_phone || '—'}</td>
              <td style={{ fontSize: '0.8rem' }}>{d.role_name || 'Clinic Staff'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.clinic_name || '—'}</td>
              <td><StatusBadge status={d.status} /></td>
              <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DoctorsTable = ({ data }) => {
  if (!data || data.length === 0) return <EmptyTable colSpan={9} />;
  return (
    <div className="table-wrapper" style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table>
        <thead>
          <tr>
            <th>Doctor Name</th><th>Clinic</th><th>Clinic Type</th>
            <th>Phone</th><th>Phone 2</th><th>Email</th>
            <th>Specialization</th><th>Status</th><th>Created On</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td><strong>{d.full_name}</strong></td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.clinic_name || '—'}</td>
              <td style={{ fontSize: '0.75rem', color: '#a78bfa' }}>{d.clinic_type || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.phone || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.alternate_phone || '—'}</td>
              <td style={{ fontSize: '0.8rem' }}>{d.email || '—'}</td>
              <td style={{ fontSize: '0.8rem', color: '#34d399' }}>{d.specialization || '—'}</td>
              <td><StatusBadge status={d.status} /></td>
              <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ClinicsTable = ({ data }) => {
  if (!data || data.length === 0) return <EmptyTable colSpan={11} />;
  return (
    <div className="table-wrapper" style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table>
        <thead>
          <tr>
            <th>Clinic ID</th><th>Clinic Name</th><th>Type</th>
            <th>City</th><th>State</th><th>Pincode</th>
            <th>Contact Name</th><th>Phone</th><th>Phone 2</th>
            <th>Status</th><th>Created On</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.clinic_id_number || '—'}</td>
              <td><strong>{d.clinic_name}</strong></td>
              <td style={{ fontSize: '0.75rem', color: '#a78bfa' }}>{d.clinic_type || '—'}</td>
              <td>{d.city}</td>
              <td>{d.state}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.pincode || '—'}</td>
              <td>{d.contact_name || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.phone}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.alternate_phone || '—'}</td>
              <td><StatusBadge status={d.status} /></td>
              <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const EmptyTable = ({ colSpan }) => (
  <div className="card" style={{ textAlign: 'center', padding: '2rem', marginTop: '0.5rem' }}>
    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No records found for the selected filters.</p>
  </div>
);

// ─────────────────────────────────────────────
// Section header inside results
// ─────────────────────────────────────────────

const ReportSectionHeader = ({ title, count }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', marginTop: '1.5rem' }}>
    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{title}</h4>
    {count !== undefined && (
      <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
        {count} {count === 1 ? 'record' : 'records'}
      </span>
    )}
  </div>
);

// ─────────────────────────────────────────────
// PDF Generator
// ─────────────────────────────────────────────

const buildTableHtml = (headers, rows, emptyColSpan) => `
  <table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="${emptyColSpan}" style="text-align:center;padding:2rem;color:#64748b;">No records found for the selected filters.</td></tr>`
        : rows.map(row => `<tr>${row.map(cell => `<td>${cell ?? '—'}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
`;

const generatePDF = ({ reportType, fromDate, toDate, data, summary, generatedAt }) => {
  const typeLabels = {
    users:   'Users Report',
    staff:   'Clinic Staff Report',
    doctors: 'Doctors Report',
    clinics: 'Clinics Report',
    overall: 'Administrative Summary Report',
    summary: 'Summary Report',
  };
  const title = typeLabels[reportType] || 'Report';
  const dateRange = fromDate && toDate
    ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
    : fromDate ? `From ${formatDate(fromDate)}`
    : toDate ? `To ${formatDate(toDate)}`
    : 'All Time';

  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: white; padding: 24px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 14px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon { width: 40px; height: 40px; background: linear-gradient(135deg,#2563eb,#06b6d4); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .brand-name { font-size: 18px; font-weight: 800; color: #0f172a; }
    .brand-tagline { font-size: 10px; color: #64748b; }
    .report-meta { text-align: right; }
    .report-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 5px; }
    .meta-item { font-size: 10px; color: #64748b; margin-bottom: 3px; }
    .meta-item strong { color: #334155; }
    .summary-cards { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; min-width: 130px; }
    .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 2px; }
    .summary-value { font-size: 22px; font-weight: 800; color: #2563eb; }
    .section-title { font-size: 12px; font-weight: 700; color: #0f172a; margin: 18px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; margin-bottom: 12px; }
    thead th { background: #1e3a5f; color: white; padding: 7px 9px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    tbody tr { border-bottom: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 6px 9px; color: #334155; font-size: 10px; }
    .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    @media print { body { padding: 0; } @page { margin: 1.5cm; size: A4 landscape; } }
  `;

  let bodyContent = '';

  // Summary cards for overall / summary type
  if (summary) {
    bodyContent += `
      <div class="summary-cards">
        <div class="summary-card"><div class="summary-label">Total Users</div><div class="summary-value">${summary.total_users ?? 0}</div></div>
        <div class="summary-card"><div class="summary-label">Clinic Staff</div><div class="summary-value">${summary.clinic_staff ?? 0}</div></div>
        <div class="summary-card"><div class="summary-label">Doctors</div><div class="summary-value">${summary.doctors ?? 0}</div></div>
        <div class="summary-card"><div class="summary-label">Clinics</div><div class="summary-value">${summary.clinics ?? 0}</div></div>
      </div>`;
  }

  if (reportType === 'users' || (reportType === 'overall' && data.users)) {
    const rows = (reportType === 'overall' ? data.users : data).map(d => [
      d.full_name, d.email || '—', d.phone || '—', d.alternate_phone || '—',
      d.role_name || '—', d.clinic_name || '—', d.status, formatDate(d.created_at)
    ]);
    if (reportType === 'overall') bodyContent += `<div class="section-title">Users (${rows.length})</div>`;
    bodyContent += buildTableHtml(['Name','Email','Phone','Phone 2','Role','Clinic','Status','Created On'], rows, 8);
  }

  if (reportType === 'staff' || (reportType === 'overall' && data.staff)) {
    const rows = (reportType === 'overall' ? data.staff : data).map(d => [
      d.full_name, d.email || '—', d.phone || '—', d.alternate_phone || '—',
      d.role_name || 'Clinic Staff', d.clinic_name || '—', d.status, formatDate(d.created_at)
    ]);
    if (reportType === 'overall') bodyContent += `<div class="section-title">Clinic Staff (${rows.length})</div>`;
    bodyContent += buildTableHtml(['Staff Name','Email','Phone','Phone 2','Role','Clinic','Status','Created On'], rows, 8);
  }

  if (reportType === 'doctors' || (reportType === 'overall' && data.doctors)) {
    const rows = (reportType === 'overall' ? data.doctors : data).map(d => [
      d.full_name, d.clinic_name || '—', d.clinic_type || '—',
      d.phone || '—', d.alternate_phone || '—', d.email || '—',
      d.specialization || '—', d.status, formatDate(d.created_at)
    ]);
    if (reportType === 'overall') bodyContent += `<div class="section-title">Doctors (${rows.length})</div>`;
    bodyContent += buildTableHtml(['Doctor Name','Clinic','Clinic Type','Phone','Phone 2','Email','Specialization','Status','Created On'], rows, 9);
  }

  if (reportType === 'clinics' || (reportType === 'overall' && data.clinics)) {
    const rows = (reportType === 'overall' ? data.clinics : data).map(d => [
      d.clinic_id_number || '—', d.clinic_name, d.clinic_type || '—',
      d.address || '—', d.city, d.state, d.pincode || '—',
      d.contact_name || '—', d.phone, d.alternate_phone || '—',
      d.email || '—', d.status, formatDate(d.created_at)
    ]);
    if (reportType === 'overall') bodyContent += `<div class="section-title">Clinics (${rows.length})</div>`;
    bodyContent += buildTableHtml(['Clinic ID','Clinic Name','Type','Address','City','State','Pincode','Contact Name','Phone','Phone 2','Email','Status','Created On'], rows, 13);
  }

  const totalRecords = reportType === 'overall'
    ? (data.users?.length || 0) + (data.staff?.length || 0) + (data.doctors?.length || 0) + (data.clinics?.length || 0)
    : Array.isArray(data) ? data.length : 0;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} — ClinicSystem</title><style>${CSS}</style></head>
  <body>
    <div class="header">
      <div class="brand">
        <div class="brand-icon">🏥</div>
        <div><div class="brand-name">ClinicSystem</div><div class="brand-tagline">Management Platform</div></div>
      </div>
      <div class="report-meta">
        <div class="report-title">${title}</div>
        <div class="meta-item"><strong>Report Type:</strong> ${title}</div>
        <div class="meta-item"><strong>Date Range:</strong> ${dateRange}</div>
        <div class="meta-item"><strong>Total Records:</strong> ${totalRecords}</div>
        <div class="meta-item"><strong>Generated At:</strong> ${formatDateTime(generatedAt)}</div>
      </div>
    </div>
    ${bodyContent}
    <div class="footer">
      <span>ClinicSystem — Confidential Administrative Report</span>
      <span>Generated: ${formatDateTime(generatedAt)}</span>
    </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=1200,height=750');
  if (!win) { alert('Please allow pop-ups to generate PDF.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
};

// ─────────────────────────────────────────────
// Main Reports Component
// ─────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'overall', label: 'Overall Summary' },
  { value: 'users',   label: 'Users' },
  { value: 'staff',   label: 'Clinic Staff' },
  { value: 'doctors', label: 'Doctors' },
  { value: 'clinics', label: 'Clinics' },
];

const Reports = () => {
  const today    = new Date();
  const toISO    = (d) => d.toISOString().split('T')[0];

  const [reportType, setReportType] = useState('overall');
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [clinics,    setClinics]    = useState([]);
  const [errors,     setErrors]     = useState({});

  const [summaryData,  setSummaryData]  = useState(null);
  const [reportData,   setReportData]   = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [generated,    setGenerated]    = useState(false);
  const [generatedAt,  setGeneratedAt]  = useState(null);
  const [toast,        setToast]        = useState(null);

  const resultsRef = useRef(null);

  // Load summary on mount and on date change (debounced)
  const fetchSummary = useCallback(async (fd, td) => {
    try {
      const params = new URLSearchParams();
      if (fd) params.set('from_date', fd);
      if (td) params.set('to_date', td);
      const res = await api.get(`/admin/reports/summary${params.toString() ? '?' + params : ''}`);
      if (res.data.success) setSummaryData(res.data.summary);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchSummary(fromDate, toDate);
    api.get('/admin/clinics')
      .then(res => { if (res.data.success) setClinics(res.data.clinics); })
      .catch(() => {});
  }, []); // eslint-disable-line

  // Re-fetch summary when dates change
  useEffect(() => {
    if (fromDate || toDate) fetchSummary(fromDate, toDate);
    else fetchSummary('', '');
  }, [fromDate, toDate, fetchSummary]);

  const validate = () => {
    const errs = {};
    if (!reportType) errs.reportType = 'Please select a report type.';
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      errs.toDate = 'To Date must be on or after From Date.';
    }
    return errs;
  };

  const handleGenerate = async () => {
    setErrors({});
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setReportData(null);
    setGenerated(false);

    try {
      const params = new URLSearchParams({ type: reportType });
      if (fromDate) params.append('from_date', fromDate);
      if (toDate)   params.append('to_date',   toDate);

      const res = await api.get(`/admin/reports?${params.toString()}`);
      if (res.data.success) {
        setReportData(res.data);
        setGenerated(true);
        setGeneratedAt(new Date().toISOString());
        // Update summary from response if included
        if (res.data.summary) setSummaryData(res.data.summary);
        setTimeout(() => { resultsRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate report. Please try again.';
      setToast({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!reportData) {
      setToast({ type: 'error', message: 'Generate a report first before downloading PDF.' });
      return;
    }

    // Build the data payload for PDF generator
    let pdfData;
    if (reportType === 'overall') {
      pdfData = {
        users:   reportData.users   || [],
        staff:   reportData.staff   || [],
        doctors: reportData.doctors || [],
        clinics: reportData.clinics || [],
      };
    } else {
      pdfData = reportData.data || [];
    }

    generatePDF({
      reportType,
      fromDate,
      toDate,
      data: pdfData,
      summary: reportData.summary || summaryData,
      generatedAt,
    });
  };

  const reportTypeLabel = REPORT_TYPES.find(r => r.value === reportType)?.label || 'Report';
  const showClinicFilter = reportType === 'doctors' || reportType === 'staff';

  const dateRange = fromDate || toDate
    ? `${fromDate ? formatDate(fromDate) : 'All'} → ${toDate ? formatDate(toDate) : 'All'}`
    : 'All Time';

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div>
        {/* Page header */}
        <div className="page-header" style={{ marginBottom: '1.75rem' }}>
          <h2>Reports</h2>
          <p>Administrative reports with real-time database data.</p>
        </div>

        {/* ── Summary Cards ── */}
        {summaryData && (
          <div>
            <div style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              📊 Live Summary {(fromDate || toDate) ? `· ${dateRange}` : '· All Time'}
            </div>
            <SummaryCards summary={summaryData} />
          </div>
        )}

        {/* ── Filter Card ── */}
        <div className="card" style={{ marginBottom: '1.75rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ marginBottom: '0.25rem' }}>Generate Report</h3>
            <p style={{ fontSize: '0.82rem' }}>Select report type and optional date range. Leave dates empty to include all records.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1.25rem' }}>

            {/* Report Type */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">
                Report Type <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                className="form-control"
                style={{ maxWidth: 320 }}
                value={reportType}
                onChange={(e) => { setReportType(e.target.value); setGenerated(false); setReportData(null); }}
              >
                {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {errors.reportType && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.reportType}</span>}
            </div>

            {/* From Date */}
            <div className="form-group">
              <label className="form-label">
                From Date <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>(optional)</span>
              </label>
              <input
                type="date"
                className="form-control"
                value={fromDate}
                max={toDate || toISO(today)}
                onChange={(e) => { setFromDate(e.target.value); if (errors.fromDate) setErrors(p => ({ ...p, fromDate: '' })); }}
                style={errors.fromDate ? { borderColor: 'var(--danger)' } : {}}
              />
              {errors.fromDate && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.fromDate}</span>}
            </div>

            {/* To Date */}
            <div className="form-group">
              <label className="form-label">
                To Date <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>(optional)</span>
              </label>
              <input
                type="date"
                className="form-control"
                value={toDate}
                min={fromDate || undefined}
                max={toISO(today)}
                onChange={(e) => { setToDate(e.target.value); if (errors.toDate) setErrors(p => ({ ...p, toDate: '' })); }}
                style={errors.toDate ? { borderColor: 'var(--danger)' } : {}}
              />
              {errors.toDate && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{errors.toDate}</span>}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading}
              id="generate-report-btn"
              style={{ minWidth: 160 }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.4rem' }} />
                  Generating…
                </>
              ) : '📊 Generate Report'}
            </button>

            {generated && reportData && (
              <button
                className="btn btn-ghost"
                onClick={handleDownloadPDF}
                id="download-pdf-btn"
                style={{ borderColor: 'rgba(37,99,235,0.4)', color: 'var(--primary-light)' }}
              >
                📄 Generate PDF
              </button>
            )}
          </div>
        </div>

        {/* ── Report Results ── */}
        {generated && reportData && (
          <div ref={resultsRef}>
            {/* Result header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.95rem' }}>{reportTypeLabel}</strong>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Period: {dateRange}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generated at {formatDateTime(generatedAt)}</span>
              </div>
              <button className="btn btn-ghost" onClick={handleDownloadPDF} style={{ fontSize: '0.85rem', borderColor: 'rgba(37,99,235,0.4)', color: 'var(--primary-light)' }}>
                📄 Generate PDF
              </button>
            </div>

            {/* Overall Summary */}
            {reportType === 'overall' && reportData.summary && (
              <div style={{ marginBottom: '1.25rem' }}>
                <SummaryCards summary={reportData.summary} />
              </div>
            )}

            {/* Individual report table */}
            {reportType !== 'overall' && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{reportTypeLabel}</span>
                  <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{reportData.count} {reportData.count === 1 ? 'record' : 'records'}</span>
                </div>
                <div style={{ padding: '1rem', overflowX: 'auto' }}>
                  {reportType === 'users'   && <UsersTable   data={reportData.data} />}
                  {reportType === 'staff'   && <StaffTable   data={reportData.data} />}
                  {reportType === 'doctors' && <DoctorsTable data={reportData.data} />}
                  {reportType === 'clinics' && <ClinicsTable data={reportData.data} />}
                </div>
              </div>
            )}

            {/* Overall — detailed sections */}
            {reportType === 'overall' && (
              <div className="card" style={{ padding: '1.25rem 1.5rem', overflow: 'hidden' }}>
                <ReportSectionHeader title="Users" count={reportData.users?.length} />
                <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
                  <UsersTable data={reportData.users} />
                </div>

                <ReportSectionHeader title="Clinic Staff" count={reportData.staff?.length} />
                <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
                  <StaffTable data={reportData.staff} />
                </div>

                <ReportSectionHeader title="Doctors" count={reportData.doctors?.length} />
                <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
                  <DoctorsTable data={reportData.doctors} />
                </div>

                <ReportSectionHeader title="Clinics" count={reportData.clinics?.length} />
                <div style={{ overflowX: 'auto' }}>
                  <ClinicsTable data={reportData.clinics} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default Reports;