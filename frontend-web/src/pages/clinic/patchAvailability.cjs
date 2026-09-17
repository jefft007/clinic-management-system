const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'ClinicAvailability.jsx');
let code = fs.readFileSync(target, 'utf8');

// 1. Remove UpcomingSlotsTab component entirely
code = code.replace(/\/\* ════════════════════════════════════════════════════════\n   TAB 3: UPCOMING SLOTS[\s\S]*?const ClinicAvailability = \(\) => \{/m, 'const ClinicAvailability = () => {');

// 2. Remove 'slots' tab from tabs array
code = code.replace(/\{ key: 'slots',\s+label: '📋 Upcoming Slots',\s+title: 'Upcoming Materialized Slots' \},/, '');

// 3. Update handleOverrideSaved to just stay on override (or switch to regular)
code = code.replace(/const handleOverrideSaved = \(\) => \{[\s\S]*?\};/, `const handleOverrideSaved = () => {\n    setActiveTab('regular');\n  };`);

// 4. Remove rendering of UpcomingSlotsTab
code = code.replace(/\{activeTab === 'slots'\s*&&\s*<UpcomingSlotsTab refreshKey=\{refreshKey\} \/>\}/, '');

fs.writeFileSync(target, code);
console.log('Availability patch successful');
