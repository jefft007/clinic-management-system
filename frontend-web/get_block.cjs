const fs = require('fs');
let c = fs.readFileSync('src/pages/clinic/ClinicAvailability.jsx', 'utf8');
const startIdx = c.indexOf('<h4 style={{ fontSize: \\'0.92rem\\'');
console.log(c.substring(startIdx - 50, startIdx + 2500));
