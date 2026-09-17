import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const STATUS_COLORS = {
  Booked:      { bg: '#dbeafe', color: '#1d4ed8' },
  Reserved:    { bg: '#fff1ec', color: '#c2410c' },
  Waiting:     { bg: '#e0e7ff', color: '#4338ca' },
  'In Progress': { bg: '#fef3c7', color: '#b45309' },
  Completed:   { bg: '#d1fae5', color: '#065f46' },
  Cancelled:   { bg: '#fee2e2', color: '#b91c1c' },
  Absent:      { bg: '#fee2e2', color: '#991b1b' },
  Skipped:     { bg: '#f3f4f6', color: '#4b5563' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: '20px', padding: '0.15rem 0.5rem',
      fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap'
    }}>{status === 'Completed' ? 'Consulted' : status}</span>
  );
};

const DoctorPatients = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        setLoading(true);
        // Fetch all appointments for this doctor to derive patient list
        const res = await api.get('/doctor/appointments');
        if (res.data.success) {
          const appts = res.data.appointments || [];
          
          // Group by patient_id
          const pMap = {};
          appts.forEach(a => {
            if (!pMap[a.patient_id]) {
              pMap[a.patient_id] = {
                patient_id: a.patient_id,
                name: a.patient_name || 'Unknown Patient',
                phone: a.patient_phone || '—',
                appointments: []
              };
            }
            pMap[a.patient_id].appointments.push(a);
          });

          // Sort appointments by date desc, and format last visit
          const pList = Object.values(pMap).map(p => {
            p.appointments.sort((x, y) => new Date(y.appointment_date) - new Date(x.appointment_date));
            p.total_visits = p.appointments.filter(a => a.status === 'Completed').length;
            p.last_visit = p.appointments[0].appointment_date;
            return p;
          });

          // Sort patients by last visit date
          pList.sort((a, b) => new Date(b.last_visit) - new Date(a.last_visit));
          
          setPatients(pList);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  const filtered = patients.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.phone.includes(search)
  );

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>My Patients</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {patients.length} total patient{patients.length !== 1 ? 's' : ''} seen
        </p>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <input 
          type="text" 
          className="form-control" 
          placeholder="Search patients by name or phone..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '400px', fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
        />
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /><span>Loading patients...</span></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No patients found.
        </div>
      ) : (
        <div className="table-wrapper">
          <table style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Phone</th>
                <th>Total Consultations</th>
                <th>Last Visit</th>
                <th style={{ textAlign: 'right' }}>History</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <React.Fragment key={p.patient_id}>
                  <tr style={{ background: expandedId === p.patient_id ? 'var(--bg-elevated)' : 'transparent' }}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.phone}</td>
                    <td><span className="badge badge-success">{p.total_visits}</span></td>
                    <td>{new Date(p.last_visit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-ghost" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setExpandedId(expandedId === p.patient_id ? null : p.patient_id)}
                      >
                        {expandedId === p.patient_id ? 'Hide History' : 'View History'}
                      </button>
                    </td>
                  </tr>
                  
                  {expandedId === p.patient_id && (
                    <tr>
                      <td colSpan="5" style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ padding: '1rem', background: 'var(--bg-elevated)' }}>
                          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Appointment History</h4>
                          <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {p.appointments.map(a => (
                              <div key={a.appointment_id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ width: '100px', fontWeight: 600 }}>{new Date(a.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                <div style={{ width: '80px', color: 'var(--text-muted)' }}>{a.session}</div>
                                <div style={{ width: '60px' }}><span style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>#{a.token_number}</span></div>
                                <div style={{ width: '100px' }}><StatusBadge status={a.status} /></div>
                                {a.remark && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>"{a.remark}"</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DoctorPatients;
