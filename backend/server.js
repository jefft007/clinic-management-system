const app = require("./app");
const { startSessionAutomation } = require("./utils/sessionScheduler");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Auto-starts sessions when their scheduled time arrives, and
    // auto-completes sessions once every booked appointment is finished.
    // Checks every 30 seconds. Staff can still manually start/end a
    // session at any time via the existing endpoints.
    startSessionAutomation();
});