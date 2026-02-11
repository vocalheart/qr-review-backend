import express from "express";
import crypto from "crypto";
import razorpay from "../config/razorpay.js";
import Payment from "../models/Payment.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   ADMIN – CREATE PLAN
====================================================== */
router.post("/admin/create-plan", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { name, amount, interval, period } = req.body;

    const plan = await razorpay.plans.create({
      period: period || "daily",
      interval: interval || 3,
      item: {
        name: name || "3-Day Trial",
        amount: amount || 200,
        currency: "INR",
        description: "Subscription Plan",
      },
    });

    res.json({ success: true, plan });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================================================
   ADMIN – GET ALL PLANS
====================================================== */
router.get("/admin/get-plans", authMiddleware, async (req, res) => {
  try {
    const plans = await razorpay.plans.all({ count: 50 });
    res.json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================================================
   USER – CREATE SUBSCRIPTION (Dynamic Plan)
====================================================== */
router.post("/create-subscription", authMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ success: false, message: "Plan ID required" });
    }

    const active = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: "active",
    });

    if (active) {
      return res.status(400).json({
        success: false,
        message: "Active subscription already exists",
      });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 1,
    });

    await Payment.create({
      userId: req.user._id,
      subscriptionId: subscription.id,
      planId: planId,
      shortUrl: subscription.short_url,
      type: "subscription",
      amount: subscription.plan.item.amount,
      currency: subscription.plan.item.currency,
    });

    res.json({ success: true, subscription });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


router.get("/subscription-status", authMiddleware, async (req, res) => {
  try {
    const sub = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
    }).sort({ createdAt: -1 });

    if (!sub) {
      return res.json({ success: true, status: "none" });
    }

    let daysRemaining = 0;

    if (sub.status === "active" && sub.currentEnd) {
      const diff = sub.currentEnd - new Date();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    res.json({
      success: true,
      status: sub.status,
      planId: sub.planId,
      currentStart: sub.currentStart,
      currentEnd: sub.currentEnd,
      daysRemaining,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


export default router