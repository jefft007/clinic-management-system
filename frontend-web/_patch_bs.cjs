const fs = require('fs');
const p = 'src/pages/clinic/ClinicAvailability.jsx';
const s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('  return (\n    <div>\n      {/* Booking Horizon');
const end = s.indexOf('\nconst ClinicAvailability = () =>');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const neu = `  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - var(--topbar-h, 64px) - 6.1rem)',
      minHeight: 0, overflow: 'hidden', gap: '0.4rem',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem 0.7rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Horizon</span>
        <input
          type="date" className="form-control"
          value={endDate}
          min={formatToYYYYMMDD(today)}
          max={formatToYYYYMMDD(maxDate)}
          onChange={e => setEndDate(e.target.value)}
          title="Last date patients can book (blank = 2 months)"
          style={{ width: 148, padding: '0.22rem 0.4rem', fontSize: '0.78rem' }}
        />
        <button className="btn btn-ghost" onClick={handleSaveHorizon} disabled={horizonSaving} style={ghostBtn}>
          {horizonSaving ? 'Saving…' : 'Save'}
        </button>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
        <select
          id="bs-doctor"
          className="form-control"
          value={doctorId}
          onChange={e => setDoctorId(e.target.value)}
          style={{ width: 180, padding: '0.22rem 0.4rem', fontSize: '0.78rem' }}
        >
          <option value="">Doctor…</option>
          {doctors.map(d => (
            <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !doctorId}
          style={{ borderRadius: 6, padding: '0.28rem 0.85rem', fontSize: '0.75rem', marginLeft: 'auto' }}
        >
          {saving ? 'Saving…' : ('Save picks' + (selectedDoctor ? ' · ' + selectedDoctor.full_name.split(' ')[0] : ''))}
        </button>
      </div>
      {(horizonMsg || msg) && (
        <div style={{ flexShrink: 0 }}>
          <InlineMsg msg={horizonMsg || msg} />
        </div>
      )}

      {!doctorId ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem', fontSize: '0.8rem' }}>
          Select a doctor to set weekly On-Site / Online token numbers.
        </div>
      ) : tokenLoading ? (
        <div className="loading-screen" style={{ minHeight: 60 }}>
          <div className="spinner" /><span>Loading…</span>
        </div>
      ) : (
        <>
          {!hasDoctorSettings && (
            <div style={{
              padding: '0.28rem 0.55rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
              borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.7rem', flexShrink: 0,
            }}>
              No weekly split saved yet — showing defaults. Tap tokens, then Save.
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', flexShrink: 0 }}>
            {DAYS.map(({ value: dow, label }) => {
              const d = dayCounts(dow);
              const active = editDow === dow;
              return (
                <button key={dow} type="button" onClick={() => setEditDow(dow)} style={pillStyle(active)}>
                  <div>{label}</div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 600, color: active ? '#cbd5e1' : '#64748b' }}>
                    {d.total} · <span style={{ color: '#22d3ee' }}>{d.onsite}</span>/<span style={{ color: '#fbbf24' }}>{d.online}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', flexShrink: 0,
            padding: '0.28rem 0.5rem',
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.28)', borderRadius: 7,
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fcd34d', textTransform: 'uppercase' }}>Total</span>
            <button type="button" onClick={() => bumpDayTotal(editDow, -1)} className="btn btn-ghost" style={{ ...ghostBtn, fontWeight: 800 }}>-</button>
            <input
              type="number" min={0} max={400} className="form-control"
              value={dCount.total}
              onChange={e => setDayTotal(editDow, e.target.value)}
              style={{ width: 52, padding: '0.12rem 0.25rem', fontSize: '0.82rem', fontWeight: 800, textAlign: 'center' }}
            />
            <button type="button" onClick={() => bumpDayTotal(editDow, 1)} className="btn btn-ghost" style={{ ...ghostBtn, fontWeight: 800 }}>+</button>
            <button type="button" onClick={() => bumpDayTotal(editDow, 5)} className="btn btn-ghost" style={ghostBtn}>+5</button>
            <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>
              <span style={{ color: '#22d3ee' }}>{dCount.onsite} On-Site</span>
              {' · '}
              <span style={{ color: '#fbbf24' }}>{dCount.online} Online</span>
            </span>
            {dCount.total > 0 && (
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                {'AM 1–' + mCount.total + (eCount.total > 0 ? (' · PM ' + (mCount.total + 1) + '–' + dCount.total) : '')}
              </span>
            )}
            <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
            <button type="button" onClick={() => quickFillDay(editDow, 'half')} className="btn btn-ghost" style={ghostBtn}>Even</button>
            <button type="button" onClick={() => quickFillDay(editDow, 'alternate')} className="btn btn-ghost" style={ghostBtn}>Alt</button>
            <button type="button" onClick={() => quickFillDay(editDow, 'all-onsite')} className="btn btn-ghost" style={{ ...ghostBtn, color: '#22d3ee' }}>All On-Site</button>
            <button type="button" onClick={() => quickFillDay(editDow, 'all-online')} className="btn btn-ghost" style={{ ...ghostBtn, color: '#fbbf24' }}>All Online</button>
          </div>

          <div style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '0.4rem 0.5rem',
          }}>
            {dCount.total === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.75rem', padding: '0.4rem 0' }}>
                Set a total above to pick token numbers.
              </div>
            ) : (
              <div style={{
                flex: 1, minHeight: 0, overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
                gridAutoRows: 'minmax(28px, 1fr)',
                gap: '0.22rem',
                alignContent: 'start',
              }}>
                {combinedAssignments(editDow).map((pool, idx) => {
                  const isOnsite = pool === 'onsite';
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleCombined(editDow, idx)}
                      title={'Token #' + (idx + 1) + ' — ' + (isOnsite ? 'On-Site' : 'Online') + ' (click to switch)'}
                      style={{
                        minHeight: 0, height: '100%',
                        borderRadius: 5,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        background: isOnsite ? 'rgba(6,182,212,0.18)' : 'rgba(245,158,11,0.18)',
                        border: '1.5px solid ' + (isOnsite ? '#06b6d4' : '#f59e0b'),
                        color: isOnsite ? '#22d3ee' : '#fbbf24',
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
`;
fs.writeFileSync(p, s.slice(0, start) + neu + s.slice(end));
console.log('patched', start, end);
