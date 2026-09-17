require('dotenv').config();
const pool = require('./config/database');

async function main() {
    try {
        const [result] = await pool.execute(
            `UPDATE users
             SET password = '$2b$10$Pu2fGvbQmEZgA6CioFEbWeYz4O5k3GqmetrUQHm8GocsCQ.bjT1yu',
                 status = 'Active'
             WHERE user_id = 3`
        );
        console.log('Update successful:', result);
    } catch (error) {
        console.error('Update failed:', error);
    } finally {
        process.exit();
    }
}
main();
