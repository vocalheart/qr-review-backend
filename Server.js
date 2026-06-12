import express from "express";
import cors from "cors";
import signupAuth from "./auth/authContoller.js";
import connectDB from "./config/db.js";
import cookieParser from "cookie-parser";
import upload from "./upload/upload.js";
import customURLRoutes from "./customURL/customURL.js";
import feedbackRoutes from "./feedbackRoutes/feedbackRoutes.js";
import payment from "./payments/subscription.routes.js";
import uploadLogo from "./customURL/logoUpload.js";
import crypto from "crypto";
import Payment from "./models/Payment.js";
import adminRoutes from "./admin/routes/routes.js";
import razorpay from "./config/razorpay.js";

const app = express();

// CORS
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://qr.vocalheart.com",
      "https://qradminpannel.vocalheart.com",
      "https://www.reviewbadhao.com",
      "https://admin.reviewbadhao.com",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials:    true,
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
}));

/* ======================================================
   RAZORPAY WEBHOOK
   Must use raw body — do NOT move this below express.json()
====================================================== */

app.post(
  "/api/subscription-webhook",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    try {
      const razorpaySignature = req.headers["x-razorpay-signature"];
      const webhookSecret     = process.env.RAZORPAY_WEBHOOK_SECRET;
      const body              = req.body.toString();

      /* ============================================
         VERIFY SIGNATURE
      ============================================ */

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");

      if (razorpaySignature !== expectedSignature) {
        console.log("Webhook signature mismatch");
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }

      /* ============================================
         PARSE EVENT
      ============================================ */

      const event = JSON.parse(body);
      console.log("WEBHOOK EVENT:", event.event);
      const { payload } = event;

      /* ============================================
         EVENT ROUTER
      ============================================ */

      switch (event.event) {

        case "payment.captured":
          await handlePaymentCaptured(payload.payment.entity);
          break;

        case "payment.authorized":
          console.log("Payment Authorized:", payload.payment.entity.id);
          break;

        case "payment.failed":
          await handlePaymentFailed(payload.payment.entity);
          break;

        case "subscription.authenticated":
          await handleSubscriptionAuthenticated(payload.subscription.entity);
          break;

        case "subscription.activated":
          await handleSubscriptionActivated(payload.subscription.entity);
          break;

        case "subscription.charged":
          await handleSubscriptionCharged(
            payload.payment.entity,
            payload.subscription.entity
          );
          break;

        case "subscription.halted":
          await handleSubscriptionHalted(payload.subscription.entity);
          break;

        case "subscription.completed":
          await handleSubscriptionCompleted(payload.subscription.entity);
          break;

        case "subscription.cancelled":
          await handleSubscriptionCancelled(payload.subscription.entity);
          break;

        default:
          console.log("Unhandled event:", event.event);
      }

      return res.json({ success: true });

    } catch (err) {
      console.error("Webhook error:", err);
      return res.status(500).json({ success: false });
    }
  }
);

/* ======================================================
   WEBHOOK HANDLERS
====================================================== */

/* ======================================================
   PAYMENT CAPTURED
   Fires when Razorpay successfully captures payment.
   This is the main "user is now paid & active" event.
   ✅ Sets isVisible = true so it appears in history.
====================================================== */

async function handlePaymentCaptured(payment) {

  console.log("Payment Captured:", payment.id, "| sub:", payment.subscription_id);

  if (!payment.subscription_id) {
    console.log("No subscription_id found — skipping");
    return;
  }

  const updateFields = {
    status:    "active",
    paymentId: payment.id,
    isVisible: true,               // ✅ Now visible in payment history
  };

  try {

    const sub = await razorpay.subscriptions.fetch(payment.subscription_id);

    if (sub.current_start) updateFields.currentStart = new Date(sub.current_start * 1000);
    if (sub.current_end)   updateFields.currentEnd   = new Date(sub.current_end   * 1000);
    if (sub.charge_at)     updateFields.nextChargeAt = new Date(sub.charge_at     * 1000);

    console.log("Dates:", updateFields.currentStart, "→", updateFields.currentEnd);

  } catch (err) {
    console.error("Fetch subscription error:", err.message);
  }

  await Payment.updateOne(
    { subscriptionId: payment.subscription_id },
    updateFields
  );
}

/* ======================================================
   PAYMENT FAILED
   Fires when auto-debit fails (e.g. card declined).
   Don't overwrite halted status.
   isVisible stays false — failed payments not shown in history.
====================================================== */

async function handlePaymentFailed(payment) {

  console.log("Payment Failed:", payment.id);

  const existing = await Payment.findOne({
    subscriptionId: payment.subscription_id,
  });

  // If already halted, don't downgrade to failed
  if (existing && existing.status === "halted") {
    console.log("Already halted — skipping failed update");
    return;
  }

  await Payment.updateOne(
    { subscriptionId: payment.subscription_id },
    { status: "failed", failedAt: new Date() }
    // isVisible remains false — don't show failed payments in history
  );
}

/* ======================================================
   SUBSCRIPTION AUTHENTICATED
   Fires when user successfully links their card/UPI.
   This is the START of the 7-day trial for new users.
   ✅ Sets isVisible = true — card linked = user committed.
====================================================== */

async function handleSubscriptionAuthenticated(subscription) {

  console.log("Subscription Authenticated:", subscription.id);

  const dbRecord = await Payment.findOne({ subscriptionId: subscription.id });

  if (!dbRecord) {
    console.log("No DB record found for:", subscription.id);
    return;
  }

  /* ============================================
     Check the notes flag we set at creation time
     trial: "true"  → new user, give free trial
     trial: "false" → returning user, no trial
  ============================================ */

  const isTrial = subscription.notes?.trial === "true";

  const updateFields = {
    status:    "authenticated",
    isVisible: true,               // ✅ Show in history — user has committed
  };

  if (isTrial) {

    // ✅ Trial starts NOW (card linked moment)
    // ✅ Trial ends 7 days later
    // ✅ First real charge happens after trialEnd (Razorpay uses start_at)
    updateFields.trialStart = new Date();
    updateFields.trialEnd   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    updateFields.trialUsed  = true;   // Lock: this user can never get trial again

    console.log("Trial started. Ends:", updateFields.trialEnd);

  } else {

    // Returning paid user — mark trialUsed true as a safety measure
    updateFields.trialUsed = true;

    console.log("Non-trial subscription authenticated");
  }

  // Store Razorpay's own dates too (may be null during trial period)
  if (subscription.current_start) updateFields.currentStart = new Date(subscription.current_start * 1000);
  if (subscription.current_end)   updateFields.currentEnd   = new Date(subscription.current_end   * 1000);
  if (subscription.charge_at)     updateFields.nextChargeAt = new Date(subscription.charge_at     * 1000);

  await Payment.updateOne(
    { subscriptionId: subscription.id },
    updateFields
  );
}

/* ======================================================
   SUBSCRIPTION ACTIVATED
   Fires when first payment is collected and sub goes live.
   For trial users: fires after 7-day trial ends + debit OK.
   For direct users: fires on first successful charge.
   ✅ isVisible already true from authenticated — no change needed.
====================================================== */

async function handleSubscriptionActivated(subscription) {

  console.log("Subscription Activated:", subscription.id);

  const updateFields = {
    status:    "active",
    isVisible: true,               // ✅ Ensure visible (safety)
  };

  if (subscription.current_start) updateFields.currentStart = new Date(subscription.current_start * 1000);
  if (subscription.current_end)   updateFields.currentEnd   = new Date(subscription.current_end   * 1000);
  if (subscription.charge_at)     updateFields.nextChargeAt = new Date(subscription.charge_at     * 1000);

  console.log("Activated:", updateFields.currentStart, "→", updateFields.currentEnd);

  await Payment.updateOne(
    { subscriptionId: subscription.id },
    updateFields
  );
}

/* ======================================================
   SUBSCRIPTION CHARGED
   Fires on every successful recurring charge.
   Updates billing cycle dates so the user stays active.
   ✅ isVisible = true — recurring charge confirmed.
====================================================== */

async function handleSubscriptionCharged(payment, subscription) {

  console.log("Subscription Charged:", payment.id);

  const updateFields = {
    paymentId: payment.id,
    status:    "active",
    isVisible: true,               // ✅ Each successful charge is visible
  };

  if (subscription?.current_start) updateFields.currentStart = new Date(subscription.current_start * 1000);
  if (subscription?.current_end)   updateFields.currentEnd   = new Date(subscription.current_end   * 1000);
  if (subscription?.charge_at)     updateFields.nextChargeAt = new Date(subscription.charge_at     * 1000);

  await Payment.updateOne(
    { subscriptionId: payment.subscription_id },
    updateFields
  );
}

/* ======================================================
   SUBSCRIPTION HALTED
   Fires when Razorpay retries auto-debit multiple times
   and all attempts fail. Subscription is suspended.
   User must update payment method to reactivate.
====================================================== */

async function handleSubscriptionHalted(subscription) {

  console.log("Subscription Halted:", subscription.id);

  await Payment.updateOne(
    { subscriptionId: subscription.id },
    { status: "halted", failedAt: new Date() }
    // isVisible unchanged — was true if previously active
  );
}

/* ======================================================
   SUBSCRIPTION COMPLETED
   Fires when total_count cycles are exhausted.
   We keep record as "completed" — frontend can prompt renewal.
====================================================== */

async function handleSubscriptionCompleted(subscription) {

  console.log("Subscription Completed:", subscription.id);

  await Payment.updateOne(
    { subscriptionId: subscription.id },
    { status: "completed" }
    // isVisible unchanged — was already true
  );
}

/* ======================================================
   SUBSCRIPTION CANCELLED
   Fires when user or admin cancels the subscription.
   Access remains until currentEnd date.
====================================================== */

async function handleSubscriptionCancelled(subscription) {

  console.log("Subscription Cancelled:", subscription.id);

  await Payment.updateOne(
    { subscriptionId: subscription.id },
    { status: "cancelled", cancelledAt: new Date() }
    // isVisible unchanged — keep in history so user can see cancelled record
  );
}

/* ======================================================
   MIDDLEWARES
   Must come after webhook route (raw body needed there)
====================================================== */

app.use(express.json());
app.use(cookieParser());

/* ======================================================
   DB
====================================================== */

connectDB();

/* ======================================================
   ROUTES
====================================================== */

app.use("/api", signupAuth);
app.use("/api", upload);
app.use("/api", feedbackRoutes);
app.use("/api/custom-url", customURLRoutes);
app.use("/api", payment);
app.use("/api/form", uploadLogo);
app.use("/api", adminRoutes);

/* ======================================================
   HEALTH CHECK
====================================================== */

app.get("/", async (req, res) => {
  res.status(200).send("Server is running");
});

/* ======================================================
   START
====================================================== */

const PORT = process.env.PORT || 5001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});