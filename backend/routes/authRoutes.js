const express = require("express");

const {
    login,
    forgotPassword,
    resetPassword,
    validateResetToken,
    changePassword
} = require("../controllers/authController");

const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

// ── Existing ─────────────────────────────────────────────
router.post("/login", login);

// ── Forgot / Reset password (public — no auth needed) ────
router.post("/forgot-password",          forgotPassword);
router.post("/reset-password",           resetPassword);
router.get( "/reset-password/validate",  validateResetToken);

// ── Change password (must be logged in) ──────────────────
router.post("/change-password", authenticateToken, changePassword);

module.exports = router;