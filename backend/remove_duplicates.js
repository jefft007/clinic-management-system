const fs = require('fs');

const path = 'controllers/clinicController.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// We want to remove lines 1074 to 1234 (inclusive).
// In 0-indexed array, that's index 1073 to 1233.
const numLinesToRemove = 1234 - 1074 + 1;
lines.splice(1073, numLinesToRemove);

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Removed duplicated lines.');
