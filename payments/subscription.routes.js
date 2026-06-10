import express from "express";
import razorpay from "../config/razorpay.js";
import Payment from "../models/Payment.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   ADMIN – CREATE ALL PLANS
====================================================== */

router.post("/admin/create-plan", async (req, res) => {
  try {

    // MONTHLY PLAN
    const monthly = await razorpay.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: "Monthly Plan",
        amount: 119900,
        currency: "INR",
      },
    });

    // 3 MONTHS PLAN
    const quarterly = await razorpay.plans.create({
      period: "monthly",
      interval: 3,
      item: {
        name: "3 Months Plan",
        amount: 299900,
        currency: "INR",
      },
    });

    // YEARLY PLAN
    const yearly = await razorpay.plans.create({
      period: "yearly",
      interval: 1,
      item: {
        name: "Yearly Plan",
        amount: 699900,
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
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================================================
   USER – CREATE SUBSCRIPTION
====================================================== */

router.post("/create-subscription", authMiddleware, async (req, res) => {
  try {

    const { planType } = req.body;

    let planId;
    let amount;

    /* ============================================
       PLAN SELECT
    ============================================ */

    if (planType === "monthly") {
      planId = process.env.RAZORPAY_MONTHLY_PLAN_ID;
      amount = 119900;
    } else if (planType === "quarterly") {
      planId = process.env.RAZORPAY_3MONTH_PLAN_ID;
      amount = 299900;
    } else if (planType === "yearly") {
      planId = process.env.RAZORPAY_YEARLY_PLAN_ID;
      amount = 699900;
    } else {
      return res.status(400).json({ success: false, message: "Invalid plan type" });
    }

    const today = new Date();

    /* ============================================
       CHECK ACTIVE SUBSCRIPTION
       Block if user already has a valid sub
    ============================================ */

    const activeSubscription = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: { $in: ["active", "authenticated"] },
      $or: [
        { currentEnd: { $gt: today } },
        { trialEnd: { $gt: today } },
      ],
    });

    if (activeSubscription) {
      return res.status(400).json({
        success: false,
        message: "You already have an active subscription",
      });
    }

    /* ============================================
       AUTO EXPIRE OLD SUBSCRIPTIONS
    ============================================ */

    await Payment.updateMany(
      {
        userId: req.user._id,
        type: "subscription",
        status: { $in: ["active", "authenticated"] },
        $or: [
          { currentEnd: { $lte: today } },
          { trialEnd: { $lte: today } },
        ],
      },
      { $set: { status: "expired" } }
    );

    /* ============================================
       CHECK PENDING SUBSCRIPTION
    ============================================ */

    const existing = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: "created",
    });

    if (existing) {

      const timeDiff = Date.now() - existing.createdAt.getTime();

      // REUSE SAME LINK FOR 5 MIN
      if (timeDiff < 5 * 60 * 1000) {
        return res.json({
          success: true,
          subscription: {
            short_url: existing.shortUrl,
            status: "pending",
          },
        });
      }

      /* ============================================
         CANCEL OLD PENDING SUBSCRIPTION ON RAZORPAY
      ============================================ */

      if (existing.subscriptionId) {
        try {
          await razorpay.subscriptions.cancel(existing.subscriptionId);
        } catch (err) {
          console.log("Cancel old subscription error:", err.message);
        }
      }

      // MARK OLD AS FAILED
      await Payment.updateOne(
        { _id: existing._id },
        { status: "failed", failedAt: new Date() }
      );
    }

    /* ============================================
       CHECK IF TRIAL ALREADY USED
       One free trial per user — lifetime
    ============================================ */

    const alreadyUsedTrial = await Payment.findOne({
      userId: req.user._id,
      trialUsed: true,
    });

    let subscription;

    /* ============================================
       FIRST TIME USER → 7 DAYS FREE TRIAL
       start_at = 7 days from now
       User links card today, first debit after 7 days
       If they cancel within 7 days → no charge
    ============================================ */

    if (!alreadyUsedTrial) {

      // Razorpay valid Unix timestamp range: 946684800 (year 2000) → 4765046400 (year 2121)
      // Use server time (Date.now()), never trust client time
      const RAZORPAY_MIN_TS = 946684800;
      const RAZORPAY_MAX_TS = 4765046400;
      const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

      const nowSeconds   = Math.floor(Date.now() / 1000);
      const trialStartAt = nowSeconds + SEVEN_DAYS_SECONDS;

      // Safety guard — should never happen on server but log if it does
      if (trialStartAt < RAZORPAY_MIN_TS || trialStartAt > RAZORPAY_MAX_TS) {
        console.error("Invalid trialStartAt computed:", trialStartAt, "| nowSeconds:", nowSeconds);
        return res.status(500).json({
          success: false,
          message: "Server time error. Please try again.",
        });
      }

      console.log("Trial start_at (Unix):", trialStartAt, "| Human:", new Date(trialStartAt * 1000).toISOString());

      subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: 100,
        start_at: trialStartAt,   // First debit after 7 days
        notify_info: {
          notify_phone: true,
          notify_email: true,
        },
        notes: {
          userId: req.user._id.toString(),
          trial: "true",           // Flag for webhook to know this is a trial sub
        },
      });

      await Payment.create({
        userId: req.user._id,
        subscriptionId: subscription.id,
        planId,
        planType,
        shortUrl: subscription.short_url,
        type: "subscription",
        status: "created",
        amount,
        currency: "INR",
        // trialUsed is set to true ONLY after webhook confirms authentication
        // This prevents false-marking if user abandons checkout
      });

    } else {

      /* ============================================
         RETURNING USER → DIRECT PAID SUBSCRIPTION
         No trial, charge starts immediately
      ============================================ */

      subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: 100,
        notify_info: {
          notify_phone: true,
          notify_email: true,
        },
        notes: {
          userId: req.user._id.toString(),
          trial: "false",          // Flag for webhook: no trial
        },
      });

      await Payment.create({
        userId: req.user._id,
        subscriptionId: subscription.id,
        planId,
        planType,
        shortUrl: subscription.short_url,
        type: "subscription",
        status: "created",
        amount,
        currency: "INR",
      });
    }

    return res.json({ success: true, subscription });

  } catch (error) {
    console.log("SUBSCRIPTION ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================================================
   USER – SUBSCRIPTION STATUS
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

    const now = new Date();

    /* ============================================
       AUTO EXPIRE: active sub past currentEnd
    ============================================ */

    if (sub.status === "active" && sub.currentEnd && new Date(sub.currentEnd) <= now) {
      sub.status = "expired";
      await sub.save();
    }

    /* ============================================
       AUTO EXPIRE: trial sub past trialEnd
       Also auto-cancel on Razorpay side so no
       accidental charge after trial if user forgot
    ============================================ */

    // if (
    //   sub.status === "authenticated" &&
    //   sub.trialEnd &&
    //   new Date(sub.trialEnd) <= now
    // ) {
    //   sub.status = "expired";
    //   await sub.save();

    //   // Cancel on Razorpay too — safety net
    //   // (Razorpay should auto-debit, but if halted/failed, ensure no ghost sub)
    //   try {
    //     await razorpay.subscriptions.cancel(sub.subscriptionId);
    //   } catch (err) {
    //     console.log("Auto-cancel after trial expire error:", err.message);
    //   }
    // }

    /* ============================================
       REMAINING TIME
    ============================================ */

    let daysRemaining = 0;
    let hoursRemaining = 0;
    let expiryDate = null;

    // TRIAL USER
    if (sub.status === "authenticated" && sub.trialEnd) {
      expiryDate = new Date(sub.trialEnd);
    }

    // ACTIVE USER
    if (sub.status === "active" && sub.currentEnd) {
      expiryDate = new Date(sub.currentEnd);
    }

    if (expiryDate) {
      const diff = expiryDate - now;
      if (diff > 0) {
        daysRemaining = Math.floor(diff / (1000 * 60 * 60 * 24));
        hoursRemaining = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      }
    }

    /* ============================================
       PLAN MAP
    ============================================ */

    const planMap = {
      [process.env.RAZORPAY_MONTHLY_PLAN_ID]: { label: "Monthly Plan", price: "₹1199" },
      [process.env.RAZORPAY_3MONTH_PLAN_ID]:  { label: "3 Months Plan", price: "₹2999" },
      [process.env.RAZORPAY_YEARLY_PLAN_ID]:  { label: "1 Year Plan", price: "₹6999" },
    };

    const planInfo = planMap[sub.planId] || { label: "Premium Plan", price: "" };

    return res.json({
      success: true,
      status: sub.status,
      planId: sub.planId,
      planType: sub.planType || null,
      planLabel: planInfo.label,
      planPrice: planInfo.price,
      daysRemaining,
      hoursRemaining,
      currentStart:  sub.currentStart  || null,
      currentEnd:    sub.currentEnd    || null,
      nextChargeAt:  sub.nextChargeAt  || null,
      trialStart:    sub.trialStart    || null,
      trialEnd:      sub.trialEnd      || null,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false });
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
    console.log(error);
    res.status(500).json({ success: false });
  }
});

export default router;
