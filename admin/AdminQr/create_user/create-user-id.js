import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";

import User from "../../../models/UserScema.js";
import QrImage from "../../../models/QrImage.js";
import Qr from "../../../admin/AdminQr/models/qrSchema.js";
import AdminMiddleware from "../../../middleware/adminAuthMiddleware.js";

const router = express.Router();

// Mail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Password Generator Function
const generatePassword = () => {
  return crypto.randomBytes(6).toString("hex"); // 12 character password
};

// OTP Generator
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Temporary OTP Storage (in-memory)
// For production: Replace with Redis + TTL
const otpStore = new Map(); // key: email → { otp, exp, username, phone, randomId }

// 
// 1. SEND OTP FOR CREATE USER (No user is created yet)
//  

router.post("/send-create-user-otp", AdminMiddleware, async (req, res) => {
  try {
    const { username, email, phone, randomId } = req.body;

    if (!username || !email || !phone || !randomId) {
      return res.status(400).json({
        success: false,
        message: "username, email, phone and randomId are required",
      });
    }
    // Check if email or phone already exists
    const existEmail = await User.findOne({ email });
    if (existEmail) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }
    const existPhone = await User.findOne({ phone });
    if (existPhone) {
      return res.status(400).json({ success: false, message: "Phone number already exists" });
    }
    // Check QR validity
    const qrData = await Qr.findOne({ randomId });
    if (!qrData) {
      return res.status(404).json({ success: false, message: "QR not found" });
    }
    if (qrData.isActive) {
      return res.status(400).json({ success: false, message: "QR already assigned" });
    }
    const otp = generateOtp();
    const expTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    // Store data temporarily
    otpStore.set(email, {
      otp,
      exp: expTime,
      username,
      phone,
      randomId,
    });
    // Send OTP Email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "OTP for Account Creation",
      html: `
        <h2>Hello ${username},</h2>
        <p>Your OTP for creating new account is:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes only.</p>
        <p>Please do not share this OTP.</p>
      `,
    });
    return res.status(200).json({
      success: true,
      message: "OTP sent successfully to your email",
    });
  } catch (error) {
    console.error("Send OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error sending OTP",
    });
  }
});

//
// 2. VERIFY OTP AND CREATE USER (User created only here)
//
router.post("/verify-create-user-otp", AdminMiddleware, async (req, res) => {
  try {
    const { email, otp, randomId } = req.body;
    if (!email || !otp || !randomId) {
      return res.status(400).json({
        success: false,
        message: "email, otp and randomId are required",
      });
    }
    const otpData = otpStore.get(email);
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "No OTP request found for this email",
      });
    }
    // OTP validation
    if (otpData.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    if (otpData.exp < new Date()) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: "OTP has expired" });
    }

    if (otpData.randomId !== randomId) {
      return res.status(400).json({ success: false, message: "Invalid QR for this request" });
    }

    // Final QR check
    const qrData = await Qr.findOne({ randomId });
    if (!qrData || qrData.isActive) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: "QR is no longer available" });
    }
    // Generate password
    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    // === CREATE USER ONLY AFTER SUCCESSFUL OTP VERIFICATION ===
    const user = await User.create({
      username: otpData.username,
      email: email,
      phone: otpData.phone,
      password: hashedPassword,
      isVerified: true,
    });

    // Activate QR
    qrData.isActive = true;
    await qrData.save();

    // Save QR Image
    const qrImage = await QrImage.create({
      user: user._id,
      imageUrl: qrData.imageUrl,
      s3Key: "optional",
      randomId: qrData.randomId,
      data: qrData.qrUrl,
    });

    // Send Welcome Email with Credentials
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Account Created Successfully",
      html: `
        <h2>Hello ${user.username},</h2>
        <p>Your account has been successfully created and verified.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${user.phone}</p>
        <p><b>Password:</b> ${plainPassword}</p>
        <br/>
        <p><strong>Security Note:</strong> Please login and change your password immediately.</p>
      `,
    });

    // Clean up OTP
    otpStore.delete(email);

    return res.status(201).json({
      success: true,
      message: "User account created successfully",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
      },
      qrImage,
    });
  } catch (error) {
    console.error("Create User Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating account",
    });
  }
});

export default router;