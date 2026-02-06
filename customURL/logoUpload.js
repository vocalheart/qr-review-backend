import express from "express";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

import s3 from "../config/s3.js";
import uploadLogo from "../middleware/uploadLogo.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import LogoImage from "../models/LogoImage.js";

const router = express.Router();

router.post("/upload-logo", authMiddleware, uploadLogo.single("logo"), async (req, res) => {
    try {
      // 1️ File validation
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Logo file required" });
      }
      // 2 Check if user already has a logo
      const existingLogo = await LogoImage.findOne({ user: req.user._id });
      // 3 If exists → delete old logo from S3
      if (existingLogo?.s3Key) {
        try {
          await s3.send(new DeleteObjectCommand({
              Bucket: existingLogo.bucketName,
              Key: existingLogo.s3Key,
            })
          );
        } catch (deleteErr) {
          console.warn("Old logo delete failed:", deleteErr.message);
          // we continue even if delete fails
        }
      }
      // 4️ New file key
      const fileExt = req.file.originalname.split(".").pop();
      const fileKey = `logos/${req.user._id}-${crypto.randomUUID()}.${fileExt}`;
      // 5️ Upload new logo to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_LOGO_UPLOAD_SYSTEM_BUCKET_NAME,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );
      // 6 Public URL
      const logoUrl = `https://${process.env.AWS_LOGO_UPLOAD_SYSTEM_BUCKET_NAME}.s3.${process.env.AWS_REGION_LOGO}.amazonaws.com/${fileKey}`;
      // 7 Save / Update DB (ONE USER = ONE LOGO)
      const saved = await LogoImage.findOneAndUpdate(
        { user: req.user._id },
        {
          user: req.user._id,
          logoUrl,
          s3Key: fileKey,
          bucketName: process.env.AWS_LOGO_UPLOAD_SYSTEM_BUCKET_NAME,
        },
        { upsert: true, new: true }
      );
      // 8 Response
      res.json({success: true,message: existingLogo  ? "Logo updated successfully": "Logo uploaded successfully",data: saved});
    } catch (err) {
      console.error("Logo upload/update error:", err);
      res.status(500).json({
        success: false,
        message: err.message || "Logo upload/update failed",
      });
    }
  }
);
export default router;
