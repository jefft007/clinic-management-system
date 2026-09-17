const express = require("express");

const {
    authenticateToken
} = require("../middleware/authMiddleware");

const {
    authorizeRoles
} = require("../middleware/roleMiddleware");

const router = express.Router();


// Any logged-in staff member
router.get(
    "/profile",
    authenticateToken,
    (req, res) => {
        res.json({
            success: true,
            message: "You accessed a protected API",
            user: req.user
        });
    }
);


// Admin only
router.get(
    "/admin",
    authenticateToken,
    authorizeRoles(1),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome Admin"
        });
    }
);


// Clinic only
router.get(
    "/clinic",
    authenticateToken,
    authorizeRoles(2),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome Clinic Staff"
        });
    }
);


// Doctor only
router.get(
    "/doctor",
    authenticateToken,
    authorizeRoles(3),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome Doctor"
        });
    }
);


module.exports = router;