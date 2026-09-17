const express = require("express");

const {
    getClinics,
    getNearbyClinics,
    getClinicDoctors,
    getDoctorAvailability,
    getAvailabilityTokens,
    bookAppointment,
    getMyAppointments
} = require("../controllers/patientController");

const {
    requestOtp,
    verifyOtp
} = require("../controllers/patientAuthController");

const { authenticatePatient } = require("../middleware/patientAuthMiddleware");

const router = express.Router();


// =====================================================
// PATIENT AUTH (phone OTP)
// No authentication required to call these.
// =====================================================

// POST /api/patient/auth/request-otp
router.post(
    "/auth/request-otp",
    requestOtp
);

// POST /api/patient/auth/verify-otp
router.post(
    "/auth/verify-otp",
    verifyOtp
);


// =====================================================
// PATIENT PUBLIC APIs
// No authentication required
// =====================================================


// Get all active clinics (optional ?search=)
// GET /api/patient/clinics
router.get(
    "/clinics",
    getClinics
);


// Get nearby clinics by lat/lng
// GET /api/patient/clinics/nearby?lat=&lng=&radius_km=
router.get(
    "/clinics/nearby",
    getNearbyClinics
);


// Get doctors belonging to a clinic
// GET /api/patient/clinics/:clinicId/doctors
router.get(
    "/clinics/:clinicId/doctors",
    getClinicDoctors
);


// Get doctor's future availability
// GET /api/patient/doctors/:doctorId/availability
router.get(
    "/doctors/:doctorId/availability",
    getDoctorAvailability
);


// Get available tokens for an availability
// GET /api/patient/availability/:availabilityId/tokens
router.get(
    "/availability/:availabilityId/tokens",
    getAvailabilityTokens
);


// Book appointment
// POST /api/patient/appointments
router.post(
    "/appointments",
    bookAppointment
);


// =====================================================
// AUTHENTICATED PATIENT APIs
// Requires Authorization: Bearer <token> from verify-otp
// =====================================================

// Get all of my appointments (across every clinic), by phone
// GET /api/patient/appointments/me
router.get(
    "/appointments/me",
    authenticatePatient,
    getMyAppointments
);


module.exports = router;
