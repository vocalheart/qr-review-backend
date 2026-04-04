import express from "express";
const router = express.Router();

import s3 from "./config/s3.js";
import { v4 as uuidv4 } from "uuid";
import QR from "./models/qrSchema.js";
import AdminAuthMiddleware from "../../middleware/adminAuthMiddleware.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";




// ================== Upload QR ==================

router.post("/upload-qr", AdminAuthMiddleware, async (req, res) => {
  try {
    const { image, randomId, formUrl } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Image required",
      });
    }
    if (!image.startsWith("data:image/png;base64,")) {
      return res.status(400).json({
        success: false,
        message: "Invalid image format",
      });
    }

    if (!randomId || !formUrl) {
      return res.status(400).json({
        success: false,
        message: "randomId and formUrl are required",
      });
    }

    // ========= S3 UPLOAD =========
    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const fileName = `qr/${uuidv4()}.png`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: "image/png",
    });
    await s3.send(command);
    const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    // ========= SAVE TO DATABASE =========
    const qr = await QR.create({
      qrUrl: formUrl,
      randomId,
      imageUrl,
      admin: req.admin._id,
      
    });
    return res.status(201).json({
      success: true,
      message: "QR uploaded successfully",
      data: qr,
    }); 
  } catch (error) {
    console.error("Upload Error:", error);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
});


// ================== Pagination Helper ==================
const getPagination = (page, limit) => {
  const currentPage = parseInt(page) || 1;
  const perPage = parseInt(limit) || 10;
  const skip = (currentPage - 1) * perPage;
  return { currentPage, perPage, skip };
};

// ================== Get My QRs (Pagination) ==================

router.get("/my-qrs", AdminAuthMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const { currentPage, perPage, skip } = getPagination(page, limit); 
    const total = await QR.countDocuments({ admin: req.admin._id });

    const qrs = await QR.find({ admin: req.admin._id })
      .populate("admin", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage);

    return res.status(200).json({
      success: true,
      total,
      page: currentPage,
      limit: perPage,
      totalPages: Math.ceil(total / perPage),

      next: skip + perPage < total ? currentPage + 1 : null,
      previous: currentPage > 1 ? currentPage - 1 : null,

      data: qrs,
    });

  } catch (error) {
    console.error("Fetch Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching QR",
    });
  }
});


// ================== Get All QRs (Pagination) ==================
router.get("/all-qrs", AdminAuthMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;

    const { currentPage, perPage, skip } = getPagination(page, limit);

    const total = await QR.countDocuments();

    const qrs = await QR.find()
      .populate("admin", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage);

    return res.status(200).json({
      success: true,
      total,
      page: currentPage,
      limit: perPage,
      totalPages: Math.ceil(total / perPage),
      next: skip + perPage < total ? currentPage + 1 : null,
      previous: currentPage > 1 ? currentPage - 1 : null,
      data: qrs,
    });

  } catch (error) {
    console.error("Fetch Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching QR",
    });
  }
});

export default router;