const fs = require('fs');
let c = fs.readFileSync('src/pages/clinic/ClinicAvailability.jsx', 'utf8');
let idx = c.indexOf('On-Site / Online Token Split');
console.log(c.substring(idx - 100, idx + 2000));
