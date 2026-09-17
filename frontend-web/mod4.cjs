const fs = require('fs');
let c = fs.readFileSync('src/pages/clinic/ClinicAvailability.jsx', 'utf8');

c = c.replace(
  "const [onsiteLimit, setOnsiteLimit] = useState('');",
  "const [onsiteLimit, setOnsiteLimit] = useState('');\n  const [baseSessionTotal, setBaseSessionTotal] = useState(30);"
);

c = c.replace(
  "const exampleTotal = 30;\n  const exampleOnsite = Math.min(Math.max(onsiteLimit || 0, 0), exampleTotal);\n  const exampleOnline = exampleTotal - exampleOnsite;",
  "const exampleTotal = baseSessionTotal || 0;\n  const exampleOnsite = Math.min(Math.max(onsiteLimit || 0, 0), exampleTotal);\n  const exampleOnline = Math.max(0, exampleTotal - exampleOnsite);"
);

const startBlock = '<div style={{ borderTop: \\'1px solid #e2e8f0\\', margin: \\'1.5rem 0 1.25rem\\', paddingTop: \\'1.25rem\\' }}>';
const endBlockStr = 'strand any tokens already booked outside the new split.';

const startIndex = c.indexOf(startBlock);
const endIndex = c.indexOf(endBlockStr, startIndex) + endBlockStr.length + 10;

const replacement = \<div style={{ borderTop: '1px solid #e2e8f0', margin: '1.5rem 0 1.25rem', paddingTop: '1.25rem' }}>
        <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem' }}>
          On-Site / Online Token Split Calculator
        </h4>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem' }}>
          Use the calculator below to set your token split based on a reference session total.
        </p>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '120px' }}>
             <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Test Session Total</label>
             <input type="number" className="form-control" value={baseSessionTotal} onChange={e => setBaseSessionTotal(Number(e.target.value) || 0)} min={1} />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
             <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#06b6d4' }}>On-Site Limit</label>
             <input type="number" className="form-control" style={{ border: '1px solid #06b6d4' }} value={onsiteLimit} onChange={e => {
                let val = e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value)));
                if (val !== '' && val > baseSessionTotal) val = baseSessionTotal;
                setOnsiteLimit(val);
             }} />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
             <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#f59e0b' }}>Online Limit</label>
             <input type="number" className="form-control" style={{ border: '1px solid #f59e0b' }} value={onsiteLimit === '' ? '' : Math.max(0, baseSessionTotal - onsiteLimit)} onChange={e => {
                let val = e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value)));
                if (val !== '' && val > baseSessionTotal) val = baseSessionTotal;
                if (val !== '') setOnsiteLimit(baseSessionTotal - val);
                else setOnsiteLimit('');
             }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <div style={{ flex: 1, background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 8, padding: '0.65rem 0.85rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#06b6d4' }}>1 - {exampleOnsite || 0}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0e7490', textTransform: 'uppercase' }}>On-Site (Walk-in)</div>
          </div>
          <div style={{ flex: 1, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.65rem 0.85rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>1 - {exampleOnline || 0}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Online</div>
          </div>
        </div>
        
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem' }}>
          Because your actual sessions might have different total tokens, the system saves the <strong>On-Site Limit ({onsiteLimit || 0})</strong> and scales the Online tokens automatically.
        </p></div>\;

if (startIndex !== -1 && endIndex > startIndex) {
  c = c.substring(0, startIndex) + replacement + c.substring(endIndex);
  fs.writeFileSync('src/pages/clinic/ClinicAvailability.jsx', c);
  console.log('Modified successfully');
} else {
  console.log('Could not find block', startIndex, endIndex);
}
