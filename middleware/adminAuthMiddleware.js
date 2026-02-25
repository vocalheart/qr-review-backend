import jwt from "jsonwebtoken";
import Admin from "../admin/models/Admin.js";

const superAdminMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.adminToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (admin.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. SuperAdmin only",
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked",
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error("SuperAdmin Middleware Error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

export default superAdminMiddleware;