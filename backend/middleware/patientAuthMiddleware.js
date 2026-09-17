const jwt = require("jsonwebtoken");

const authenticatePatient = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Access token is required"
            });
        }

        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format"
            });
        }

        const decoded = jwt.verify(parts[1], process.env.JWT_SECRET);

        if (decoded.type !== "patient") {
            return res.status(401).json({
                success: false,
                message: "Invalid token"
            });
        }

        req.patientAuth = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

module.exports = {
    authenticatePatient
};
