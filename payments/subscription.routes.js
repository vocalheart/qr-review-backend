import express from "express";
import crypto from "crypto";
import razorpay from "../config/razorpay.js";
import Payment from "../models/Payment.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   ADMIN – CREATE ALL PLANS (Monthly / 3 Months / Yearly)
====================================================== */

router.post("/admin/create-plan", async (req, res) => {
  try {
    const monthly = await razorpay.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: "Monthly Plan",
        amount: 64900, // ₹649
        currency: "INR",
      },
    });

    const quarterly = await razorpay.plans.create({
      period: "monthly",
      interval: 3,
      item: {
        name: "3 Months Plan",
        amount: 144900, // ₹1449
        currency: "INR",
      },
    });

    const yearly = await razorpay.plans.create({
      period: "yearly",
      interval: 1,
      item: {
        name: "Yearly Plan",
        amount: 249900, // ₹2499
        currency: "INR",
      },
    });

    res.json({
      success: true,
      plans: { monthly, quarterly, yearly },
    });

  } catch (error) {
    console.log("PLAN ERROR:", error);
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
   USER – CREATE SUBSCRIPTION (MULTI PLAN + 5 MIN RULE)
====================================================== */

router.post("/create-subscription", authMiddleware, async (req, res) => {
  try {
    const { planType } = req.body;

    let planId;
    let amount;

    if (planType === "monthly") {
      planId = process.env.RAZORPAY_MONTHLY_PLAN_ID;
      amount = 64900;
    } else if (planType === "quarterly") {
      planId = process.env.RAZORPAY_3MONTH_PLAN_ID;
      amount = 144900;
    } else if (planType === "yearly") {
      planId = process.env.RAZORPAY_YEARLY_PLAN_ID;
      amount = 249900;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid plan type",
      });
    }

    // Active subscription check
    const activeSubscription = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: "active",
    });

    if (activeSubscription) {
      return res.status(400).json({
        success: false,
        message: "You already have an active subscription",
      });
    }

    // Pending check
    const existing = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: "created",
    });

    if (existing) {
      const timeDiff = Date.now() - existing.createdAt.getTime();

      // reuse link within 5 mins
      if (timeDiff < 5 * 60 * 1000) {
        return res.json({
          success: true,
          subscription: {
            short_url: existing.shortUrl,
            status: "pending",
          },
        });
      }

      // cancel old
      if (existing.subscriptionId) {
        try {
          await razorpay.subscriptions.cancel(existing.subscriptionId);
        } catch (err) {
          console.log("Cancel error:", err.message);
        }
      }

      await Payment.updateOne({ _id: existing._id }, { status: "failed" });
    }

    // Create new subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 1,
    });

    await Payment.create({
      userId: req.user._id,
      subscriptionId: subscription.id,
      planId: planId,
      planType: planType, 
      shortUrl: subscription.short_url,
      type: "subscription",
      status: "created",
      amount,
      currency: "INR",
    });

    res.json({ success: true, subscription });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================================================
   WEBHOOK – RAZORPAY (update currentStart / currentEnd)
   Make sure this is already wired up in your app.
   Just confirming the Payment.updateOne sets both fields.
====================================================== */

// Example inside your existing webhook handler — update this block:
// await Payment.updateOne(
//   { subscriptionId: subscriptionId },
//   {
//     status: "active",
//     currentStart: new Date(payload.subscription.entity.current_start * 1000),
//     currentEnd:   new Date(payload.subscription.entity.current_end   * 1000),
//   }
// );

/* ======================================================
   USER – CHECK SUBSCRIPTION STATUS  ← FIXED
====================================================== */

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
    let hoursRemaining = 0;

    if (sub.status === "active" && sub.currentEnd) {
      const diff = new Date(sub.currentEnd) - new Date();
      if (diff > 0) {
        daysRemaining  = Math.floor(diff / (1000 * 60 * 60 * 24));
        hoursRemaining = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      }
    }

    // Map planId → human label + price  (env vars must match)
    const planMap = {
      [process.env.RAZORPAY_MONTHLY_PLAN_ID]:  { label: "Monthly Plan",   price: "₹649"  },
      [process.env.RAZORPAY_3MONTH_PLAN_ID]:   { label: "3 Months Plan",  price: "₹1449" },
      [process.env.RAZORPAY_YEARLY_PLAN_ID]:   { label: "1 Year Plan",    price: "₹2499" },
    };

    const planInfo = planMap[sub.planId] || { label: "Premium Plan", price: "" };

    res.json({
      success: true,
      status:        sub.status,
      planId:        sub.planId,
      planType:      sub.planType || null,
      planLabel:     planInfo.label,   // ← NEW: "Monthly Plan" / "3 Months Plan" / "1 Year Plan"
      planPrice:     planInfo.price,   // ← NEW: "₹649" / "₹1449" / "₹2499"
      daysRemaining,
      hoursRemaining,                  // ← NEW: hours part
      currentStart:  sub.currentStart || null,  // ← was missing before
      currentEnd:    sub.currentEnd   || null,  // ← was missing before
    });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   USER – SUBSCRIPTION HISTORY
====================================================== */

router.get("/subscription-history", authMiddleware, async (req, res) => {
  try {
    const history = await Payment.find({
      userId: req.user._id,
      type: "subscription",
    }).sort({ createdAt: -1 });

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

export default router;