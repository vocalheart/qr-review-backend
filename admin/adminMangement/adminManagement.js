// Updated Backend: routes/admin.js (with Pagination support)
// Added query params: ?page= &limit= (default limit=10)
// Returns total, pages, etc. for frontend pagination

import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Admin from "../models/Admin.js";
import superAdminMiddleware from "../../middleware/adminAuthMiddleware.js";
import Payment from "../../models/Payment.js";   // ← Add this import
import User from "../../models/UserScema.js"; 
const router = express.Router();

/**
 * @route   POST /api/admin/create
 * @desc    SuperAdmin - Create new Admin or SuperAdmin
 * @access  Private (SuperAdmin only)
 */
router.post("/create", superAdminMiddleware, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const validRoles = ["admin", "superadmin"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'admin' or 'superadmin'",
      });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
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
 * @desc    SuperAdmin - Get all admins with pagination
 * @access  Private (SuperAdmin only)
 * @query   ?page=1&limit=10
 */
router.get("/all", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Safety checks
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit)); // max 50 to prevent abuse

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
 * @desc    SuperAdmin - Delete admin
 * @access  Private (SuperAdmin only)
 */
router.delete("/:id", superAdminMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (admin._id.toString() === req.admin._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete yourself",
      });
    }

    await Admin.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    console.error("Delete Admin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   PATCH /api/admin/block/:id
 * @desc    SuperAdmin - Block/Unblock admin
 * @access  Private (SuperAdmin only)
 */
router.patch("/block/:id", superAdminMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (admin._id.toString() === req.admin._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot block/unblock yourself",
      });
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
 * @desc    Forgot password (public)
 * @access  Public
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

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
 * @desc    Reset password using token
 * @access  Public
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    admin.password = hashedPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});





// ====================== PAYMENT MANAGEMENT (SuperAdmin Only) ======================


/**
 * @route   GET /api/admin/payments/stats
 * @desc    Get payment statistics for dashboard cards
 */
router.get("/payments/stats", superAdminMiddleware, async (req, res) => {
  try {
    const [totalPayments, totalRevenue, activeSubs, failedPayments] = await Promise.all([
      Payment.countDocuments(),
      Payment.aggregate([
        { $match: { status: { $in: ["paid", "active"] } } },
        { $group: { _id: null, revenue: { $sum: "$amount" } } }
      ]),
      Payment.countDocuments({ type: "subscription", status: "active" }),
      Payment.countDocuments({ status: "failed" }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalPayments,
        totalRevenue: totalRevenue[0]?.revenue || 0,   // in paise
        activeSubscriptions: activeSubs,
        failedPayments,
      },
    });
  } catch (error) {
    console.error("Payment Stats Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/payments/all
 * @desc    All payments (paginated)
 */
router.get("/payments/all", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const payments = await Payment.find({})
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Payment.countDocuments();

    res.status(200).json({
      success: true,
      payments,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      limit: safeLimit,
    });
  } catch (error) {
    console.error("All Payments Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/payments/orders
 * @desc    One-time orders only
 */
router.get("/payments/orders", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const payments = await Payment.find({ type: "order" })
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Payment.countDocuments({ type: "order" });

    res.status(200).json({
      success: true,
      payments,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
    });
  } catch (error) {
    console.error("Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/payments/subscriptions
 * @desc    All subscriptions
 */
router.get("/payments/subscriptions", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const payments = await Payment.find({ type: "subscription" })
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Payment.countDocuments({ type: "subscription" });

    res.status(200).json({
      success: true,
      payments,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
    });
  } catch (error) {
    console.error("Subscriptions Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/payments/active
 * @desc    Active subscriptions only
 */
router.get("/payments/active", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const payments = await Payment.find({ type: "subscription", status: "active" })
      .populate("userId", "username email")
      .sort({ currentEnd: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Payment.countDocuments({ type: "subscription", status: "active" });

    res.status(200).json({
      success: true,
      payments,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
    });
  } catch (error) {
    console.error("Active Subscriptions Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/payments/failed
 * @desc    Failed payments
 */
router.get("/payments/failed", superAdminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const payments = await Payment.find({ status: "failed" })
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Payment.countDocuments({ status: "failed" });

    res.status(200).json({
      success: true,
      payments,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
    });
  } catch (error) {
    console.error("Failed Payments Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});


// ====================== DASHBOARD APIs (SuperAdmin + Admin can use) ======================

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get all key stats for dashboard (users, admins, payments, revenue)
 * @access  Private (SuperAdmin + Admin)
 */
router.get("/dashboard/stats", superAdminMiddleware, async (req, res) => {   // ← use your admin auth middleware
  try {
    const [
      totalUsers,
      activeUsersToday,
      blockedUsers,
      totalAdmins,
      activeAdmins,
      totalPayments,
      totalRevenue,
      activeSubscriptions,
      failedPayments,
      recentPaymentsCount,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLogin: { $gte: new Date().setHours(0,0,0,0) } }),
      User.countDocuments({ isBlocked: true }),
      Admin.countDocuments(),
      Admin.countDocuments({ isActive: true }),
      Payment.countDocuments(),
      Payment.aggregate([
        { $match: { status: { $in: ["paid", "active"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.countDocuments({ type: "subscription", status: "active" }),
      Payment.countDocuments({ status: "failed" }),
      Payment.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } }), // last 7 days
    ]);

    res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          activeToday: activeUsersToday,
          blocked: blockedUsers,
        },
        admins: {
          total: totalAdmins,
          active: activeAdmins,
        },
        payments: {
          total: totalPayments,
          revenue: totalRevenue[0]?.total || 0,  // in paise
          activeSubscriptions,
          failed: failedPayments,
          recent7days: recentPaymentsCount,
        }
      }
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

/**
 * @route   GET /api/admin/dashboard/recent-activity
 * @desc    Recent payments + new users (last 10)
 */
router.get("/dashboard/recent-activity", superAdminMiddleware, async (req, res) => {
  try {
    const [recentPayments, recentUsers] = await Promise.all([
      Payment.find({})
        .populate("userId", "username email")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      User.find({})
        .select("username email createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      recent: {
        payments: recentPayments,
        newUsers: recentUsers,
      }
    });
  } catch (error) {
    console.error("Recent Activity Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

export default router;