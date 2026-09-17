require('dotenv').config();
const pool = require('./config/database');

async function migrate() {
    try {
        console.log('Running migrations...');
        await pool.execute("ALTER TABLE appointments MODIFY COLUMN status ENUM('Booked', 'Reserved', 'Waiting', 'In Progress', 'Completed', 'Cancelled', 'Absent') DEFAULT 'Booked'");
        console.log('Altered appointments');
        
        await pool.execute("ALTER TABLE doctor_availability ADD COLUMN session_state ENUM('Scheduled', 'Live', 'Completed') DEFAULT 'Scheduled'");
        console.log('Altered doctor_availability');
        
        process.exit();
    } catch(e) {
        if(e.code === 'ER_DUP_FIELDNAME') {
           console.log('Column already exists');
           process.exit();
        }
        console.error(e.message);
        process.exit(1);
    }
}
migrate();
