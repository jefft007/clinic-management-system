const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'ClinicDashboard.jsx');
let code = fs.readFileSync(target, 'utf8');

// 1. Update FORM_DEFAULT
code = code.replace(/patient_address: '',\s*};/, `patient_address: '',\n  patient_age: '',\n  patient_gender: 'Other',\n};`);

// 2. Add Age and Gender fields to the booking form
const addFields = `
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="book-patient-address">Address</label>
                      <input id="book-patient-address" type="text" className="form-control"
                        placeholder="Optional" value={form.patient_address}
                        onChange={e => setForm(f => ({ ...f, patient_address: e.target.value }))} />
                    </div>
                  </div>
                </div>
`;
const newFields = `
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="book-patient-address">Address</label>
                      <input id="book-patient-address" type="text" className="form-control"
                        placeholder="Optional" value={form.patient_address}
                        onChange={e => setForm(f => ({ ...f, patient_address: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Age</label>
                      <input type="number" className="form-control" min="0" max="150"
                        value={form.patient_age}
                        onChange={e => setForm(f => ({ ...f, patient_age: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Gender</label>
                      <select className="form-control" value={form.patient_gender} onChange={e => setForm(f => ({ ...f, patient_gender: e.target.value }))}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
`;
code = code.replace(addFields, newFields);

// 3. Replace CurrentTokenCard component with LiveTokenQueue component
const liveTokenQueue = `
const LiveTokenQueue = ({ selectedDoc, triggerRefresh }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  const fetchTokens = useCallback(async () => {
    if (!selectedDoc) return;
    try {
      setLoading(true);
      const res = await api.get('/clinic/appointments', {
        params: { doctor_id: selectedDoc.doctor_id, from_date: todayStr, to_date: todayStr }
      });
      if (res.data.success) setAppointments(res.data.appointments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedDoc, todayStr]);

  useEffect(() => { fetchTokens(); }, [fetchTokens, triggerRefresh]);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(\`/clinic/appointments/\${id}/status\`, { status });
      fetchTokens();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  if (!selectedDoc) return null;

  return (
    <div className="current-token-card" style={{ padding: '1rem', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: '#0f172a', fontWeight: 800 }}>Today's Live Queue</h4>
        <div className="live-badge"><span className="live-dot"></span> Live</div>
      </div>
      
      {loading ? <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Loading queue...</div> : (
        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {appointments.length === 0 && <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No tokens for today.</div>}
          {appointments.map(a => (
            <div key={a.appointment_id} style={{ 
              background: a.status === 'In Progress' ? '#f0fdf4' : '#f8fafc',
              border: \`1px solid \${a.status === 'In Progress' ? '#bbf7d0' : '#e2e8f0'}\`,
              padding: '0.85rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Token #{a.token_number} - {a.session}</div>
                <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{a.patient_name}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.status}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '120px' }}>
                {['Booked', 'Reserved'].includes(a.status) && (
                  <>
                    <button className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => updateStatus(a.appointment_id, 'In Progress')}>Start</button>
                    <button className="btn btn-danger-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => updateStatus(a.appointment_id, 'Cancelled')}>Skip</button>
                  </>
                )}
                {a.status === 'In Progress' && (
                  <button className="btn btn-success" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => updateStatus(a.appointment_id, 'Completed')}>Finish</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
`;

code = code.replace(/const CurrentTokenCard = \(\{ tokenOverview, selectedDoc \}\) => \{[\s\S]*?export default ClinicDashboard;/m, liveTokenQueue + '\n\nexport default ClinicDashboard;');

// 4. Update the render usage of CurrentTokenCard
code = code.replace(/<CurrentTokenCard[\s\S]*?\/>/, '<LiveTokenQueue selectedDoc={selectedDoc} triggerRefresh={data} />');

fs.writeFileSync(target, code);
console.log('Dashboard patch successful');
