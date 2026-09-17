const express = require("express");

const {
  getDashboard,
  getClinicProfile,
  updateClinicSettings,
  getClinicDoctors,
  getClinicStaff,
  getClinicPatients,
  getClinicReports,

  addClinicStaff,
  addClinicDoctor,
  addClinicPatient,

  updateClinicPatient,
  getClinicPatientDetails,

  getClinicDoctorAvailability,
  getClinicAppointments,

  updateClinicDoctor,
  updateClinicDoctorStatus,
  deleteClinicDoctor,

  updateClinicStaff,
  updateClinicStaffStatus,
  deleteClinicStaff,

  bookToken,
  bookMultipleTokens,
  updateTokenStatus,
  autoMarkAbsent,
  unblockToken,
  getAvailabilityTokenMap,
  addExtraTokens,

  getClinicAvailability,
  setAvailability,
  markLeave,

  getClinicDoctorRegularSchedule,
  updateClinicDoctorRegularSchedule,
  resetClinicDoctorAvailability,
  
  startSession,
  endSession,

  blockSlot,
  unblockSlot,
  getSessionTokenSettings,
  updateSessionTokenSettings,
  getDoctorSessionTokenSettings,
  updateDoctorSessionTokenSettings,
} = require("../controllers/clinicController");

const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// =====================================================
// CLINIC DASHBOARD
// =====================================================

router.get(
  "/dashboard",
  authenticateToken,
  authorizeRoles(2),
  getDashboard
);

// =====================================================
// CLINIC PROFILE
// =====================================================

router.get(
  "/profile",
  authenticateToken,
  authorizeRoles(2),
  getClinicProfile
);

router.patch(
  "/settings",
  authenticateToken,
  authorizeRoles(2),
  updateClinicSettings
);

router.get(
  "/session-token-settings",
  authenticateToken,
  authorizeRoles(2),
  getSessionTokenSettings
);

router.post(
  "/session-token-settings",
  authenticateToken,
  authorizeRoles(2),
  updateSessionTokenSettings
);

// =====================================================
// REPORTS
// =====================================================

router.get(
  "/reports",
  authenticateToken,
  authorizeRoles(2),
  getClinicReports
);

// =====================================================
// DOCTORS
// =====================================================

router.get(
  "/doctors",
  authenticateToken,
  authorizeRoles(2),
  getClinicDoctors
);

router.post(
  "/doctor",
  authenticateToken,
  authorizeRoles(2),
  addClinicDoctor
);

router.put(
  "/doctor/:id",
  authenticateToken,
  authorizeRoles(2),
  updateClinicDoctor
);

router.patch(
  "/doctor/:id/status",
  authenticateToken,
  authorizeRoles(2),
  updateClinicDoctorStatus
);

router.delete(
  "/doctor/:id",
  authenticateToken,
  authorizeRoles(2),
  deleteClinicDoctor
);

// =====================================================
// CLINIC STAFF
// =====================================================

router.get(
  "/staff",
  authenticateToken,
  authorizeRoles(2),
  getClinicStaff
);

router.post(
  "/staff",
  authenticateToken,
  authorizeRoles(2),
  addClinicStaff
);

router.put(
  "/staff/:id",
  authenticateToken,
  authorizeRoles(2),
  updateClinicStaff
);

router.patch(
  "/staff/:id/status",
  authenticateToken,
  authorizeRoles(2),
  updateClinicStaffStatus
);

router.delete(
  "/staff/:id",
  authenticateToken,
  authorizeRoles(2),
  deleteClinicStaff
);

// =====================================================
// PATIENTS
// =====================================================

router.get(
  "/patients",
  authenticateToken,
  authorizeRoles(2),
  getClinicPatients
);

router.post(
  "/patients",
  authenticateToken,
  authorizeRoles(2),
  addClinicPatient
);

router.put(
  "/patients/:id",
  authenticateToken,
  authorizeRoles(2),
  updateClinicPatient
);

router.get(
  "/patients/:id/details",
  authenticateToken,
  authorizeRoles(2),
  getClinicPatientDetails
);

// =====================================================
// DOCTOR AVAILABILITY
// =====================================================

router.get(
  "/doctors/:doctorId/availability",
  authenticateToken,
  authorizeRoles(2),
  getClinicDoctorAvailability
);

router.get(
  "/doctors/:doctorId/regular-schedule",
  authenticateToken,
  authorizeRoles(2),
  getClinicDoctorRegularSchedule
);

router.put(
  "/doctors/:doctorId/regular-schedule",
  authenticateToken,
  authorizeRoles(2),
  updateClinicDoctorRegularSchedule
);

// Per-doctor weekly repeating on-site/online token split — takes
// priority over the clinic-wide /session-token-settings above
// whenever a row exists for this doctor (see getOnsiteTokenLimit).
router.get(
  "/doctors/:doctorId/session-token-settings",
  authenticateToken,
  authorizeRoles(2),
  getDoctorSessionTokenSettings
);

router.post(
  "/doctors/:doctorId/session-token-settings",
  authenticateToken,
  authorizeRoles(2),
  updateDoctorSessionTokenSettings
);

// =====================================================
// GENERAL AVAILABILITY
// =====================================================

router.get(
  "/availability",
  authenticateToken,
  authorizeRoles(2),
  getClinicAvailability
);

router.post(
  "/availability",
  authenticateToken,
  authorizeRoles(2),
  setAvailability
);

router.patch(
  "/availability/:id/leave",
  authenticateToken,
  authorizeRoles(2),
  markLeave
);

router.post(
  "/availability/:id/reset",
  authenticateToken,
  authorizeRoles(2),
  resetClinicDoctorAvailability
);

// =====================================================
// APPOINTMENTS / TOKENS
// =====================================================

router.get(
  "/appointments",
  authenticateToken,
  authorizeRoles(2),
  getClinicAppointments
);

// Full token map (theatre/bus-ticket style) for a session —
// which tokens are gone, which are free, and the estimated
// time/arrive-by for each. Powers the token picker UI.
// GET /api/clinic/availability/:availabilityId/tokens
router.get(
  "/availability/:availabilityId/tokens",
  authenticateToken,
  authorizeRoles(2),
  getAvailabilityTokenMap
);

// Append-only "add extra tokens" for one date/session — see
// addExtraTokens in clinicController.js for the numbering rules.
// POST /api/clinic/availability/:availabilityId/add-tokens
router.post(
  "/availability/:availabilityId/add-tokens",
  authenticateToken,
  authorizeRoles(2),
  addExtraTokens
);

router.post(
  "/appointments/book",
  authenticateToken,
  authorizeRoles(2),
  bookToken
);

// Book several tokens for the SAME patient in one go (e.g. a
// procedure that spans multiple slots). All tokens share a
// booking_group_id so the token grid can highlight them together.
// POST /api/clinic/appointments/book-multiple
router.post(
  "/appointments/book-multiple",
  authenticateToken,
  authorizeRoles(2),
  bookMultipleTokens
);

router.patch(
  "/appointments/:id/status",
  authenticateToken,
  authorizeRoles(2),
  updateTokenStatus
);

// Silently mark 'Booked' (never-arrived) appointments as Absent
// once their session has fully ended. Safe to call repeatedly.
// POST /api/clinic/appointments/auto-absent
router.post(
  "/appointments/auto-absent",
  authenticateToken,
  authorizeRoles(2),
  autoMarkAbsent
);

// Release a blocked token (status = 'Reserved') back to the
// pool — deletes the hold so patients can see and book it
// again. See unblockToken in clinicController.js.
// DELETE /api/clinic/appointments/:id/unblock
router.delete(
  "/appointments/:id/unblock",
  authenticateToken,
  authorizeRoles(2),
  unblockToken
);

router.post(
  "/appointments/start-session",
  authenticateToken,
  authorizeRoles(2),
  startSession
);

router.post(
  "/appointments/end-session",
  authenticateToken,
  authorizeRoles(2),
  endSession
);

// =====================================================
// BLOCK / UNBLOCK SLOT (whole-session emergency hold)
// =====================================================

router.post(
  "/availability/:availabilityId/block",
  authenticateToken,
  authorizeRoles(2),
  blockSlot
);

router.post(
  "/availability/:availabilityId/unblock",
  authenticateToken,
  authorizeRoles(2),
  unblockSlot
);

module.exports = router;