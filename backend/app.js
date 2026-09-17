require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pool = require("./config/database");

const authRoutes = require("./routes/authRoutes");
const testRoutes = require("./routes/testRoutes");
const adminRoutes = require("./routes/adminRoutes");
const clinicRoutes = require("./routes/clinicRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const patientRoutes = require("./routes/patientRoutes");

const app = express();

// ===============================
// Middleware
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ===============================
// Routes
// ===============================

app.use("/api/auth", authRoutes);

app.use("/api/test", testRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/clinic", clinicRoutes);

app.use("/api/doctor", doctorRoutes);

app.use("/api/patient", patientRoutes);


// ===============================
// Health Check
// ===============================

app.get("/api/health", async (req, res) => {
    try {
        const [result] = await pool.execute(
            "SELECT 1 AS database_test"
        );

        res.json({
            success: true,
            message: "Backend and MySQL are connected",
            database: result[0]
        });

    } catch (error) {

        console.error("Database health check error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});


// ===============================
// 404 Handler
// ===============================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found"
    });
});


// ===============================
// Export App
// ===============================

module.exports = app;