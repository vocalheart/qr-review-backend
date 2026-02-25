import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
const router = express.Router();

/**
 *  ENV HELPERS (FINAL PRODUCTION SAFE)
 */
const isProduction = process.env.NODE_ENV === "production";

//  IMPORTANT: For subdomain cookie sharing
// API: qrapi.vocalheart.com
// Frontend: qradminpannel.vocalheart.com
const cookieOptions = {
  httpOnly: true,
  secure: true,          
  sameSite: "none",   
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
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

    //  SET PRODUCTION COOKIE (CROSS DOMAIN SAFE)
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
 * @desc    Admin Login + Secure Cookie (FINAL FIXED)
 */
// controllers/adminController.js ya routes/admin.js
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ success: false, message: "Admin not found" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Wrong password" });

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    //  Cookie set karo - httpOnly, sameSite ZARURI hai
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: true,       // localhost pe false, production pe true
      sameSite: "none",     // localhost ke liye "lax" use karo, "none" sirf HTTPS pe
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Middleware: Verify Admin (COOKIE BASED AUTH)
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
 * @desc    Get Logged In Admin (Used by AuthContext)
 */
router.get("/me", verifyAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");

    return res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error("Auth Me Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

/**
 * @route   POST /api/admin/logout
 * @desc    Logout + Clear Cookie (Cross-Domain Safe)
 */
router.post("/logout", (req, res) => {
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    domain: isProduction ? ".vocalheart.com" : "localhost",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export default router;