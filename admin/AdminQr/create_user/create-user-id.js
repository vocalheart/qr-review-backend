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

router.post("/create-user", AdminMiddleware, async (req, res) => {
  try {
    const { username, email, randomId } = req.body;

    // 1. Validation
    if (!username || !email || !randomId) {
      return res.status(400).json({success: false,message: "username, email, randomId required"});
    }
    // 2. Check email
    const existemail = await User.findOne({ email });
    if (existemail) {
      return res.status(400).json({success: false,message: "Email already exists"});
    }
    // 3. Find QR
    const qrData = await Qr.findOne({ randomId });
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: "QR not found",
      });
    }

    // 4. Check already used
    if (qrData.isActive) {
      return res.status(400).json({success: false,message: "QR already assigned"});
    }
    //  5. Generate Password
    const plainPassword = generatePassword();
    //  6. Hash Password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    // 7. Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    // 8. Mark QR active
    qrData.isActive = true;
    await qrData.save();

    // 9. Save QR Image
    const qrImage = await QrImage.create({
      user: user._id,
      imageUrl: qrData.imageUrl,
      s3Key: "optional",
      randomId: qrData.randomId,
      data: qrData.qrUrl,
    });

    // 10. Send Email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your Account Created Successfully",
      html: `
        <h2>Hello ${username},</h2>
        <p>Your account has been successfully activated.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${plainPassword}</p>
        <br/>
        <p>Please login and change your password immediately.</p>
      `,
    });
    // 11. Response
    res.status(201).json({ success: true,message: "User created & email sent successfully",user,qrImage});
  } catch (error) {
    console.error(error);
    res.status(500).json({success: false,message: "Something went wrong"});
  }
});

export default router;