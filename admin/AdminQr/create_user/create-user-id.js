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
  return crypto.randomBytes(6).toString("hex"); // 12 char password
};

// OTP Generator
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

//
// 1. SEND OTP FOR CREATE USER
//
router.post("/send-create-user-otp", AdminMiddleware, async (req, res) => {
  try {
    const { username, email, phone, randomId } = req.body;
    // Validation
    if (!username || !email || !phone || !randomId) {
      return res.status(400).json({success: false, message: "username, email, phone and randomId required"});
    };
    // Check existing email
    const existemail = await User.findOne({ email });
    if (existemail) {return res.status(400).json({success: false,message: "Email already exists"})}
    // Check existing phone
    const existPhone = await User.findOne({ phone });
    if (existPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }
    // Find QR
    const qrData = await Qr.findOne({ randomId });
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: "QR not found",
      });
    }
    // Check QR already assigned
    if (qrData.isActive) {
      return res.status(400).json({
        success: false,
        message: "QR already assigned",
      });
    }
    const otp = generateOtp();
    const expTime = new Date(Date.now() + 5 * 60 * 1000); // 5 min
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        username,
        email,
        phone,
        password: "temp123456",
      });
    } else {
      user.username = username;
      user.phone = phone;
    }
    user.verifyOtp = { otp, exp: expTime };
    user.createAccounteEmailVerificationOtp = true;
    await user.save();
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "OTP Verification",
      html: `
        <h2>Hello ${username},</h2>
        <p>Your OTP for account creation is:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      `,
    });
    return res.status(200).json({success: true,message: "OTP sent successfully"});
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error sending OTP",
    });
  }
});

//
// 2. VERIFY OTP AND CREATE USER ACCOUNT
//
router.post("/verify-create-user-otp", AdminMiddleware, async (req, res) => {
  try {
    const { email, otp, randomId } = req.body;

    if (!email || !otp || !randomId) {
      return res.status(400).json({
        success: false,
        message: "email, otp and randomId required",
      });
    }

    const user = await User.findOne({ email });

    if (!user || !user.verifyOtp) {
      return res.status(400).json({
        success: false,
        message: "OTP not found",
      });
    }

    if (user.verifyOtp.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (user.verifyOtp.exp < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    // Find QR
    const qrData = await Qr.findOne({ randomId });
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: "QR not found",
      });
    }

    // Check already used
    if (qrData.isActive) {
      return res.status(400).json({
        success: false,
        message: "QR already assigned",
      });
    }

    // Generate Password
    const plainPassword = generatePassword();

    // Hash Password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    user.password = hashedPassword;
    user.isVerified = true;
    user.verifyOtp = undefined;
    user.createAccounteEmailVerificationOtp = false;

    await user.save();

    // Mark QR active
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

    // Send Email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your Account Created Successfully",
      html: `
        <h2>Hello ${user.username},</h2>
        <p>Your account has been successfully verified and activated.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${user.phone}</p>
        <p><b>Password:</b> ${plainPassword}</p>
        <br/>
        <p>Please login and change your password immediately.</p>
      `,
    });

    return res.status(201).json({
      success: true,
      message: "Account created after OTP verification",
      user,
      qrImage,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
});

//
// 3. DIRECT CREATE USER
//
router.post("/create-user", AdminMiddleware, async (req, res) => {
  try {
    const { username, email, phone, randomId } = req.body;

    // Validation
    if (!username || !email || !phone || !randomId) {
      return res.status(400).json({
        success: false,
        message: "username, email, phone and randomId required",
      });
    }

    // Check email
    const existemail = await User.findOne({ email });
    if (existemail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Check phone
    const existPhone = await User.findOne({ phone });
    if (existPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    // Find QR
    const qrData = await Qr.findOne({ randomId });
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: "QR not found",
      });
    }

    // Check already used
    if (qrData.isActive) {
      return res.status(400).json({
        success: false,
        message: "QR already assigned",
      });
    }

    // Generate Password
    const plainPassword = generatePassword();

    // Hash Password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      phone,
      password: hashedPassword,
      isVerified: true,
    });
    // Mark QR active
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

    // Send Email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your Account Created Successfully",
      html: `
        <h2>Hello ${username},</h2>
        <p>Your account has been successfully activated.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Password:</b> ${plainPassword}</p>
        <br/>
        <p>Please login and change your password immediately.</p>
      `,
    });

    return res.status(201).json({
      success: true,
      message: "User created & email sent successfully",
      user,
      qrImage,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
});

export default router;