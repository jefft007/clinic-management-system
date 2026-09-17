const express = require("express");

const {
    createAvailability,
    getAvailability,
    updateAvailability,
    toggleLeave,
    deleteAvailability,
    getDoctorAppointments,
    updateDoctorAppointmentStatus,
    getRegularSchedule,
    updateRegularSchedule,
    resetAvailability
} = require("../controllers/doctorController");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const {
    authorizeRoles
} = require("../middleware/roleMiddleware");

const router = express.Router();


// =====================================================
// CREATE AVAILABILITY
// =====================================================

router.post(
    "/availability",
    authenticateToken,
    authorizeRoles(3),
    createAvailability
);


// =====================================================
// GET OWN AVAILABILITY
// =====================================================

router.get(
    "/availability",
    authenticateToken,
    authorizeRoles(3),
    getAvailability
);


// =====================================================
// UPDATE AVAILABILITY
// =====================================================

router.put(
    "/availability/:id",
    authenticateToken,
    authorizeRoles(3),
    updateAvailability
);


// =====================================================
// TOGGLE LEAVE
// =====================================================

router.patch(
    "/availability/:id/leave",
    authenticateToken,
    authorizeRoles(3),
    toggleLeave
);


// =====================================================
// DELETE AVAILABILITY
// =====================================================

router.delete(
    "/availability/:id",
    authenticateToken,
    authorizeRoles(3),
    deleteAvailability
);

// =====================================================
// GET DOCTOR APPOINTMENTS
// =====================================================

router.get(
    "/appointments",
    authenticateToken,
    authorizeRoles(3),
    getDoctorAppointments
);

router.patch(
    "/appointments/:id/status",
    authenticateToken,
    authorizeRoles(3),
    updateDoctorAppointmentStatus
);

// =====================================================
// REGULAR SCHEDULE
// =====================================================

router.get(
    "/regular-schedule",
    authenticateToken,
    authorizeRoles(3),
    getRegularSchedule
);

router.put(
    "/regular-schedule",
    authenticateToken,
    authorizeRoles(3),
    updateRegularSchedule
);

router.post(
    "/availability/:id/reset",
    authenticateToken,
    authorizeRoles(3),
    resetAvailability
);

module.exports = router;
