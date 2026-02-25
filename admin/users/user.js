import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Admin from "../models/Admin.js";
import User from "../../models/UserScema.js";           // ← Your file path
import superAdminMiddleware from "../../middleware/adminAuthMiddleware.js";

const router = express.Router();

// ====================== ADMIN MANAGEMENT ======================

/**
 * @route   POST /api/admin/create
 * @desc    SuperAdmin - Create new Admin or SuperAdmin
 * @access  Private
 */
router.post("/create", superAdminMiddleware, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });
    }

    const validRoles = ["admin", "superadmin"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be 'admin' or 'superadmin'" });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Admin with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || "admin",
      isActive: true,
      createdBy: req.admin._id,
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      admin: {
        _id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        isActive: newAdmin.isActive,
      },
    });
  } catch (error) {
    console.error("Create Admin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/all
 * @desc    Get all admins (paginated)
 */
router.get("/all", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const admins = await Admin.find({})
      .select("-password -resetPasswordToken -resetPasswordExpire")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Admin.countDocuments();

    res.status(200).json({
      success: true,
      admins,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      limit: safeLimit,
    });
  } catch (error) {
    console.error("Get All Admins Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   DELETE /api/admin/:id
 * @desc    Delete admin
 */
router.delete("/:id", superAdminMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    if (admin._id.toString() === req.admin._id.toString()) {
      return res.status(400).json({ success: false, message: "You cannot delete yourself" });
    }

    await Admin.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Admin deleted successfully" });
  } catch (error) {
    console.error("Delete Admin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   PATCH /api/admin/block/:id
 * @desc    Block/Unblock admin
 */
router.patch("/block/:id", superAdminMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    if (admin._id.toString() === req.admin._id.toString()) {
      return res.status(400).json({ success: false, message: "You cannot block/unblock yourself" });
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    res.json({
      success: true,
      message: admin.isActive ? "Admin unblocked successfully" : "Admin blocked successfully",
      isActive: admin.isActive,
    });
  } catch (error) {
    console.error("Block/Unblock Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   POST /api/admin/forgot-password
 * @desc    Forgot password
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) return res.status(400).json({ success: false, message: "Email is required" });

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    if (!admin) {
      return res.status(200).json({
        success: true,
        message: "If an account with this email exists, a password reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    admin.resetPasswordToken = resetToken;
    admin.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
      ...(process.env.NODE_ENV === "development" && { resetToken }),
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   POST /api/admin/reset-password
 * @desc    Reset password
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: "Token and new password are required" });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });

    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!admin) return res.status(400).json({ success: false, message: "Invalid or expired reset token" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;
    await admin.save();

    res.status(200).json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ====================== USER MANAGEMENT (SuperAdmin Only) ======================

/**
 * @route   GET /api/admin/users/all
 * @desc    Get ALL users (paginated - limit 10 default)
 */
router.get("/users/all", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const users = await User.find({})
      .select("-password -sendOtp -verifyOtp")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await User.countDocuments();

    res.status(200).json({
      success: true,
      users,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      limit: safeLimit,
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   PATCH /api/admin/users/block/:id
 * @desc    Block / Unblock any user
 */
router.patch("/users/block/:id", superAdminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      success: true,
      message: user.isBlocked ? "User blocked successfully" : "User unblocked successfully",
      isBlocked: user.isBlocked,
    });
  } catch (error) {
    console.error("Block User Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/users/blocked
 * @desc    Get only blocked users (paginated)
 */
router.get("/users/blocked", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const users = await User.find({ isBlocked: true })
      .select("-password -sendOtp -verifyOtp")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await User.countDocuments({ isBlocked: true });

    res.status(200).json({
      success: true,
      users,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      limit: safeLimit,
    });
  } catch (error) {
    console.error("Get Blocked Users Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/users/today-active
 * @desc    Get users who logged in TODAY (lastLogin >= today 00:00)
 */
router.get("/users/today-active", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const users = await User.find({ lastLogin: { $gte: startOfToday } })
      .select("-password -sendOtp -verifyOtp")
      .sort({ lastLogin: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await User.countDocuments({ lastLogin: { $gte: startOfToday } });

    res.status(200).json({
      success: true,
      users,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      limit: safeLimit,
    });
  } catch (error) {
    console.error("Today Active Users Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

export default router;