
// routes/customURL.js
import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import CustomURL from "../models/CustomURL.js";
import QrImage from "../models/QrImage.js";
import LogoImage from "../models/LogoImage.js";


const router = express.Router();

// CREATE / SET OR UPDATE custom URL + company name + redirect setting
router.post("/set-url", authMiddleware, async (req, res) => {
  const { url, companyName, redirectFromRating } = req.body;
  if (!url)
    return res.status(400).json({ success: false, message: "URL is required" });
  if (!companyName)
    return res.status(400).json({ success: false, message: "Company name is required" });
  if (
    redirectFromRating !== undefined &&
    (redirectFromRating < 1 || redirectFromRating > 5)
  ) {
    return res.status(400).json({
      success: false,
      message: "redirectFromRating must be between 1 to 5",
    });
  }
  try {
    let existing = await CustomURL.findOne({ user: req.user._id });
    if (existing) {
      existing.url = url;
      existing.companyName = companyName;
      if (redirectFromRating !== undefined) {
        existing.redirectFromRating = redirectFromRating;
      }
      await existing.save();
    } else {
      existing = await CustomURL.create({
        user: req.user._id,
        url,
        companyName,
        redirectFromRating: redirectFromRating ?? 3,
      });
    }

    res.json({
      success: true,
      message: "Custom URL & redirect setting saved successfully",
      data: existing,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// READ / Get URL, Company Name & Logo by qrId
router.get("/get-url/:qrId", async (req, res) => {
  const { qrId } = req.params;

  try {
    // 1. Find QR
    const qr = await QrImage.findOne({ randomId: qrId });
    if (!qr) {
      return res.status(404).json({
        success: false,
        message: "QR not found",
      });
    }

    // 2. Find Custom URL by user
    const customURL = await CustomURL.findOne({ user: qr.user });
    if (!customURL) {return res.status(404).json({success: false, message: "No custom URL set for this QR"});
    }
    // 3. Find Logo by same user
    const logo = await LogoImage.findOne({ user: qr.user });
    res.json({
      success: true,
      data: {
        url: customURL.url,
        companyName: customURL.companyName,
        redirectFromRating: customURL.redirectFromRating,
        logoUrl: logo ? logo.logoUrl : null, // or logo.imageUrl
      },
    });
  } catch (err) {
    console.error("Error fetching custom URL:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});



// UPDATE / Update URL & company name for logged-in user
router.put("/update-url", authMiddleware, async (req, res) => {
  const { url, companyName, redirectFromRating } = req.body;

  if (!url)
    return res.status(400).json({ success: false, message: "URL is required" });

  if (!companyName)
    return res.status(400).json({ success: false, message: "Company name is required" });

  if (
    redirectFromRating !== undefined &&
    (redirectFromRating < 1 || redirectFromRating > 5)
  ) {
    return res.status(400).json({
      success: false,
      message: "redirectFromRating must be between 1 to 5",
    });
  }

  try {
    const customURL = await CustomURL.findOne({ user: req.user._id });
    if (!customURL) {
      return res.status(404).json({
        success: false,
        message: "No custom URL found",
      });
    }
    customURL.url = url;
    customURL.companyName = companyName;
    // redirect setting update
    if (redirectFromRating !== undefined) {
      customURL.redirectFromRating = redirectFromRating;
    }

    await customURL.save();

    res.json({
      success: true,
      message: "Custom URL, Company Name & Redirect setting updated",
      data: customURL,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE // Delete URL + company name
router.delete("/delete-url", authMiddleware, async (req, res) => {
  try {
    const customURL = await CustomURL.findOne({ user: req.user._id });
    if (!customURL)
      return res.status(404).json({ success: false, message: "No custom URL found" });
    await CustomURL.deleteOne({ _id: customURL._id });
    res.json({ success: true, message: "Custom URL deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// GET custom URL + company name of logged-in user
router.get("/get-url", authMiddleware, async (req, res) => {
  try {
    const customURL = await CustomURL.findOne({ user: req.user._id });

    if (!customURL) {
      return res
        .status(404)
        .json({ success: false, message: "No custom URL set yet" });
    }

    // Fetch logo separately
    const logo = await LogoImage.findOne({ user: req.user._id });

    res.json({
      success: true,
      data: {
        url: customURL.url,
        companyName: customURL.companyName,
        redirectFromRating: customURL.redirectFromRating,
        logoUrl: logo ? logo.logoUrl : null,
      },
    });
  } catch (err) {
    console.error("Error fetching custom URL + logo:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

