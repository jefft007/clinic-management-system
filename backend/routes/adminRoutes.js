const express = require("express");

const {
    addClinic,
    getClinics,
    getClinicById,
    updateClinic,
    deleteClinic,
    checkClinicIdAvailable,
    addClinicStaff,
    getUsers,
    addUser,
    updateUser,
    updateUserStatus,
    getAdminDoctors,
    updateAdminDoctor,
    getReports,
    getReportSummary,
    getRecentActivity
} = require("../controllers/adminController");

const {
    getPendingRequests,
    approveRequest,
    rejectRequest
} = require("../controllers/passwordResetController");

const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles }    = require("../middleware/roleMiddleware");

const router = express.Router();



// =====================================================
// CLINIC ROUTES
// =====================================================

router.post(   "/clinics",     authenticateToken, authorizeRoles(1), addClinic);
router.get(    "/clinics",     authenticateToken, authorizeRoles(1), getClinics);
router.get(    "/clinics/check-id", authenticateToken, authorizeRoles(1), checkClinicIdAvailable);
router.get(    "/clinics/:id", authenticateToken, authorizeRoles(1), getClinicById);
router.put(    "/clinics/:id", authenticateToken, authorizeRoles(1), updateClinic);
router.delete( "/clinics/:id", authenticateToken, authorizeRoles(1), deleteClinic);


// =====================================================
// STAFF ROUTES
// =====================================================

router.post("/clinic-staff", authenticateToken, authorizeRoles(1), addClinicStaff);


// =====================================================
// USER ROUTES
// =====================================================

router.get(   "/users",           authenticateToken, authorizeRoles(1), getUsers);
router.post(  "/users",           authenticateToken, authorizeRoles(1), addUser);
router.put(   "/users/:id",       authenticateToken, authorizeRoles(1), updateUser);
router.patch( "/users/:id/status",authenticateToken, authorizeRoles(1), updateUserStatus);


// =====================================================
// DOCTORS ROUTES (Admin view — all doctors)
// =====================================================

router.get("/doctors", authenticateToken, authorizeRoles(1), getAdminDoctors);
router.put("/doctors/:id", authenticateToken, authorizeRoles(1), updateAdminDoctor);


// =====================================================
// REPORTS ROUTES
// /reports?type=summary|users|staff|doctors|clinics|overall
// Optional: &from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
// /reports/summary — quick summary counts only
// =====================================================

router.get("/reports/summary", authenticateToken, authorizeRoles(1), getReportSummary);
router.get("/reports",         authenticateToken, authorizeRoles(1), getReports);
router.get("/recent-activity", authenticateToken, authorizeRoles(1), getRecentActivity);


// =====================================================
// PASSWORD RESET REQUEST ROUTES (admin manages requests)
// =====================================================

router.get( "/password-reset-requests",          authenticateToken, authorizeRoles(1), getPendingRequests);
router.post("/password-reset-requests/:id/approve", authenticateToken, authorizeRoles(1), approveRequest);
router.post("/password-reset-requests/:id/reject",  authenticateToken, authorizeRoles(1), rejectRequest);


module.exports = router;