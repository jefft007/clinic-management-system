const fs = require('fs');

const path = 'src/pages/clinic/ClinicAvailability.jsx';
let content = fs.readFileSync(path, 'utf8');

// The original UI has an On-Site limit input and a static Online box.
// We'll replace it with a 3-input synchronized component.

// 1. Add states for base total and online limit
content = content.replace(
  "const [onsiteLimit, setOnsiteLimit] = useState('');",
  "const [onsiteLimit, setOnsiteLimit] = useState('');\n  const [baseTotal, setBaseTotal] = useState(30);\n  const [onlineLimit, setOnlineLimit] = useState('');\n\n  // Sync limits when onsiteLimit is fetched\n  useEffect(() => {\n    if (onsiteLimit !== '') {\n      setOnlineLimit(Math.max(0, baseTotal - onsiteLimit));\n    }\n  }, [onsiteLimit, baseTotal]);"
);

// 2. We'll replace the entire section below "On-Site / Online Token Split"
const searchStart = '<div className="form-group">';
const searchEnd = '<!-- END OF TOKEN SPLIT UI -->'; // We don't have this, we need to match to the end of the split UI.

// Let's replace by reading the file and slicing
