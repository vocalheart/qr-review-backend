import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

const router = express.Router();

/**
 * 🔒 Environment Helpers (PRODUCTION SAFE)
 */
const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction, // 🔥 true in production (HTTPS required)
  sameSite: isProduction ? "none" : "lax", // 🔥 VERY IMPORTANT
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/", // ensure cookie accessible everywhere
};

/**
 * Generate JWT Token
 */
const generateToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id,
      role: admin.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

/**
 * @route   POST /api/admin/signup
 * @desc    Create Admin + Set Secure Cookie
 */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin already exists with this email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
      role: role || "admin",
    });

    const token = generateToken(admin);

    // 🔥 PRODUCTION SAFE COOKIE
    res.cookie("adminToken", token, cookieOptions);

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

/**
 * @route   POST /api/admin/login
 * @desc    Admin Login + Secure Cookie
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and Password are required",
      });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    const token = generateToken(admin);

    // 🔥 SECURE COOKIE (PRODUCTION READY)
    res.cookie("adminToken", token, cookieOptions);

    res.status(200).json({
      success: true,
      message: "Login successful",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

/**
 * 🔐 Middleware: Verify Admin (Production Safe)
 */
const verifyAdmin = (req, res, next) => {
  try {
    const token = req.cookies?.adminToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    console.error("Verify Token Error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/**
 * @route   GET /api/admin/me
 * @desc    Get Logged In Admin
 */
router.get("/me", verifyAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");

    res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error("Auth Me Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

/**
 * @route   POST /api/admin/logout
 * @desc    Logout + Clear Cookie (Production Safe)
 */
router.post("/logout", (req, res) => {
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export default router;