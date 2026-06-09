
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
        amount: 64900, // ₹649
        currency: "INR",
      },
    });

    // 3 MONTHS PLAN
    const quarterly = await razorpay.plans.create({
      period: "monthly",
      interval: 3,
      item: {
        name: "3 Months Plan",
        amount: 249900, // ₹2499
        currency: "INR",
      },
    });

    // YEARLY PLAN
    const yearly = await razorpay.plans.create({
      period: "yearly",
      interval: 1,
      item: {
        name: "Yearly Plan",
        amount: 699900, // ₹6999
        currency: "INR",
      },
    });

    res.json({
      success: true,
      plans: {
        monthly,
        quarterly,
        yearly,
      },
    });

  } catch (error) {

    console.log("PLAN ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ======================================================
   ADMIN – GET ALL PLANS
====================================================== */

router.get("/admin/get-plans", authMiddleware, async (req, res) => {
  try {

    const plans = await razorpay.plans.all({
      count: 50,
    });

    res.json({
      success: true,
      plans,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
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
      amount = 64900;

    } else if (planType === "quarterly") {

      planId = process.env.RAZORPAY_3MONTH_PLAN_ID;
      amount = 249900;

    } else if (planType === "yearly") {

      planId = process.env.RAZORPAY_YEARLY_PLAN_ID;
      amount = 699900;

    } else {

      return res.status(400).json({
        success: false,
        message: "Invalid plan type",
      });
    }

    /* ============================================
       ACTIVE SUBSCRIPTION CHECK
    ============================================ */

    const activeSubscription = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: "active",
    });

    // VALID ACTIVE SUBSCRIPTION
    if (
      activeSubscription &&
      activeSubscription.currentEnd &&
      new Date(activeSubscription.currentEnd) > new Date()
    ) {

      return res.status(400).json({
        success: false,
        message: "You already have an active subscription",
      });
    }

    // EXPIRED SUBSCRIPTION
    if (
      activeSubscription &&
      activeSubscription.currentEnd &&
      new Date(activeSubscription.currentEnd) <= new Date()
    ) {

      await Payment.updateOne(
        { _id: activeSubscription._id },
        {
          status: "expired",
        }
      );
    }

    /* ============================================
       PENDING SUBSCRIPTION CHECK
    ============================================ */

    const existing = await Payment.findOne({
      userId: req.user._id,
      type: "subscription",
      status: "created",
    });

    if (existing) {

      const timeDiff =
        Date.now() - existing.createdAt.getTime();

      // REUSE EXISTING LINK WITHIN 5 MINUTES
      if (timeDiff < 5 * 60 * 1000) {

        return res.json({
          success: true,
          subscription: {
            short_url: existing.shortUrl,
            status: "pending",
          },
        });
      }

      // CANCEL OLD PENDING SUBSCRIPTION
      if (existing.subscriptionId) {

        try {

          await razorpay.subscriptions.cancel(
            existing.subscriptionId
          );

        } catch (err) {

          console.log(
            "Cancel subscription error:",
            err.message
          );
        }
      }

      // MARK FAILED
      await Payment.updateOne(
        { _id: existing._id },
        {
          status: "failed",
          failedAt: new Date(),
        }
      );
    }

    /* ============================================
       7 DAYS FREE TRIAL
    ============================================ */

    const trialEnd =
      Math.floor(Date.now() / 1000) +
      (7 * 24 * 60 * 60);

    /* ============================================
       CREATE RAZORPAY SUBSCRIPTION
    ============================================ */

    const subscription =
      await razorpay.subscriptions.create({

        plan_id: planId,

        customer_notify: 1,

        total_count: 999,

        start_at: trialEnd,

        notify_info: {
          notify_phone: true,
          notify_email: true,
        },
      });

    /* ============================================
       SAVE PAYMENT
    ============================================ */

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

      trialStart: new Date(),

      trialEnd: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ),
    });

    res.json({
      success: true,
      subscription,
    });

  } catch (error) {

    console.log("SUBSCRIPTION ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
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

      return res.json({
        success: true,
        status: "none",
      });
    }

    // AUTO EXPIRE CHECK
    if (
      sub.status === "active" &&
      sub.currentEnd &&
      new Date(sub.currentEnd) <= new Date()
    ) {

      sub.status = "expired";

      await sub.save();
    }

    let daysRemaining = 0;
    let hoursRemaining = 0;

    if (
      (sub.status === "active" ||
        sub.status === "authenticated") &&
      sub.currentEnd
    ) {

      const diff =
        new Date(sub.currentEnd) - new Date();

      if (diff > 0) {

        daysRemaining = Math.floor(
          diff / (1000 * 60 * 60 * 24)
        );

        hoursRemaining = Math.floor(
          (
            diff %
            (1000 * 60 * 60 * 24)
          ) /
          (1000 * 60 * 60)
        );
      }
    }

    /* ============================================
       PLAN MAP
    ============================================ */

    const planMap = {

      [process.env.RAZORPAY_MONTHLY_PLAN_ID]: {
        label: "Monthly Plan",
        price: "₹649",
      },

      [process.env.RAZORPAY_3MONTH_PLAN_ID]: {
        label: "3 Months Plan",
        price: "₹2499",
      },

      [process.env.RAZORPAY_YEARLY_PLAN_ID]: {
        label: "1 Year Plan",
        price: "₹6999",
      },
    };

    const planInfo =
      planMap[sub.planId] || {
        label: "Premium Plan",
        price: "",
      };

    res.json({

      success: true,

      status: sub.status,

      planId: sub.planId,

      planType: sub.planType || null,

      planLabel: planInfo.label,

      planPrice: planInfo.price,

      daysRemaining,

      hoursRemaining,

      currentStart: sub.currentStart || null,

      currentEnd: sub.currentEnd || null,

      nextChargeAt: sub.nextChargeAt || null,

      trialStart: sub.trialStart || null,

      trialEnd: sub.trialEnd || null,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
    });
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

    res.json({
      success: true,
      history,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
    });
  }
});

export default router;