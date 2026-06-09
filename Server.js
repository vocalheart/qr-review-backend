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

// SABSE PEHLE CORS
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
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
}));

/* ======================================================
   RAZORPAY WEBHOOK (RAW BODY – MANDATORY)
====================================================== */

app.post("/api/subscription-webhook",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    try {

      const razorpaySignature =
        req.headers["x-razorpay-signature"];

      const webhookSecret =
        process.env.RAZORPAY_WEBHOOK_SECRET;

      const body = req.body.toString();

      /* ============================================
         VERIFY SIGNATURE
      ============================================ */

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");

      if (razorpaySignature !== expectedSignature) {

        console.log(
          "Webhook signature mismatch"
        );

        return res.status(400).json({
          success: false,
          message: "Invalid signature",
        });
      }

      /* ============================================
         PARSE EVENT
      ============================================ */

      const event = JSON.parse(body);

      console.log(
        "WEBHOOK EVENT:",
        event.event
      );

      const { payload } = event;

      /* ============================================
         EVENTS
      ============================================ */

      switch (event.event) {

        /* ========================================
           PAYMENT CAPTURED
        ======================================== */

        case "payment.captured":

          await handlePaymentCaptured(
            payload.payment.entity
          );

          break;

        /* ========================================
           PAYMENT AUTHORIZED
        ======================================== */

        case "payment.authorized":

          console.log(
            "Payment Authorized:",
            payload.payment.entity.id
          );

          break;

        /* ========================================
           PAYMENT FAILED
        ======================================== */

        case "payment.failed":

          await handlePaymentFailed(
            payload.payment.entity
          );

          break;

        /* ========================================
           SUBSCRIPTION AUTHENTICATED
        ======================================== */

        case "subscription.authenticated":

          await handleSubscriptionAuthenticated(
            payload.subscription.entity
          );

          break;

        /* ========================================
           SUBSCRIPTION ACTIVATED
        ======================================== */

        case "subscription.activated":

          await handleSubscriptionActivated(
            payload.subscription.entity
          );

          break;
          
case "subscription.halted":

  await handleSubscriptionHalted(
    payload.subscription.entity
  );

  break;


        /* ========================================
           SUBSCRIPTION CHARGED
        ======================================== */

        case "subscription.charged":

          await handleSubscriptionCharged(
            payload.payment.entity,
            payload.subscription.entity
          );

          break;

        /* ========================================
           SUBSCRIPTION COMPLETED
        ======================================== */

        case "subscription.completed":

          await handleSubscriptionCompleted(
            payload.subscription.entity
          );

          break;

        /* ========================================
           SUBSCRIPTION CANCELLED
        ======================================== */

        case "subscription.cancelled":

          await handleSubscriptionCancelled(
            payload.subscription.entity
          );

          break;

        /* ========================================
           DEFAULT
        ======================================== */

        default:

          console.log(
            "Unhandled event:",
            event.event
          );
      }

      return res.json({
        success: true,
      });

    } catch (err) {

      console.error(
        "Webhook error:",
        err
      );

      return res.status(500).json({
        success: false,
      });
    }
  }
);

/* ======================================================
   HANDLERS
====================================================== */

/* ======================================================
   PAYMENT CAPTURED
====================================================== */

async function handlePaymentCaptured(payment) {

  console.log(
    "Payment Captured:",
    payment.id,
    "| sub:",
    payment.subscription_id
  );

  if (!payment.subscription_id) {

    console.log(
      "No subscription_id found"
    );

    return;
  }

  const updateFields = {

    status: "active",

    paymentId: payment.id,
  };

  try {

    const sub =
      await razorpay.subscriptions.fetch(
        payment.subscription_id
      );

    if (sub.current_start) {

      updateFields.currentStart =
        new Date(
          sub.current_start * 1000
        );
    }

    if (sub.current_end) {

      updateFields.currentEnd =
        new Date(
          sub.current_end * 1000
        );
    }

    if (sub.charge_at) {

      updateFields.nextChargeAt =
        new Date(
          sub.charge_at * 1000
        );
    }

    console.log(
      "Dates:",
      updateFields.currentStart,
      "→",
      updateFields.currentEnd
    );

  } catch (err) {

    console.error(
      "Fetch subscription error:",
      err.message
    );
  }

  await Payment.updateOne(
    {
      subscriptionId:
        payment.subscription_id,
    },
    updateFields
  );
}

/* ======================================================
   PAYMENT FAILED
====================================================== */

async function handlePaymentFailed(payment) {

  console.log(
    "Payment Failed:",
    payment.id
  );

  await Payment.updateOne(
    {
      subscriptionId:
        payment.subscription_id,
    },
    {
      status: "failed",

      failedAt: new Date(),
    }
  );
}

/* ======================================================
   SUBSCRIPTION AUTHENTICATED
====================================================== */

async function handleSubscriptionAuthenticated(
  subscription
) {

  console.log(
    "Subscription Authenticated:",
    subscription.id
  );

  const updateFields = {

    status: "authenticated",
  };

  if (subscription.current_start) {

    updateFields.currentStart =
      new Date(
        subscription.current_start * 1000
      );
  }

  if (subscription.current_end) {

    updateFields.currentEnd =
      new Date(
        subscription.current_end * 1000
      );
  }

  if (subscription.charge_at) {

    updateFields.nextChargeAt =
      new Date(
        subscription.charge_at * 1000
      );
  }

  await Payment.updateOne(
    {
      subscriptionId:
        subscription.id,
    },
    updateFields
  );
}

/* ======================================================
   SUBSCRIPTION ACTIVATED
====================================================== */

async function handleSubscriptionActivated(
  subscription
) {

  console.log(
    "Subscription Activated:",
    subscription.id
  );

  const updateFields = {

    status: "active",
  };

  if (subscription.current_start) {

    updateFields.currentStart =
      new Date(
        subscription.current_start * 1000
      );
  }

  if (subscription.current_end) {

    updateFields.currentEnd =
      new Date(
        subscription.current_end * 1000
      );
  }

  if (subscription.charge_at) {

    updateFields.nextChargeAt =
      new Date(
        subscription.charge_at * 1000
      );
  }

  console.log(
    "Activated dates:",
    updateFields.currentStart,
    "→",
    updateFields.currentEnd
  );

  await Payment.updateOne(
    {
      subscriptionId:
        subscription.id,
    },
    updateFields
  );
}

/* ======================================================
   SUBSCRIPTION CHARGED
====================================================== */

async function handleSubscriptionCharged(
  payment,
  subscription
) {

  console.log(
    "Subscription Charged:",
    payment.id
  );

  const updateFields = {

    paymentId: payment.id,

    status: "active",
  };

  if (subscription?.current_start) {

    updateFields.currentStart =
      new Date(
        subscription.current_start * 1000
      );
  }

  if (subscription?.current_end) {

    updateFields.currentEnd =
      new Date(
        subscription.current_end * 1000
      );
  }

  if (subscription?.charge_at) {

    updateFields.nextChargeAt =
      new Date(
        subscription.charge_at * 1000
      );
  }

  await Payment.updateOne(
    {
      subscriptionId:
        payment.subscription_id,
    },
    updateFields
  );
}

/* ======================================================
   SUBSCRIPTION COMPLETED
====================================================== */

async function handleSubscriptionCompleted(
  subscription
) {

  console.log(
    "Subscription Completed:",
    subscription.id
  );

  // KEEP ACTIVE UNTIL currentEnd EXPIRES

  await Payment.updateOne(
    {
      subscriptionId:
        subscription.id,
    },
    {
      status: "active",
    }
  );
}

/* ======================================================
   SUBSCRIPTION CANCELLED
====================================================== */

async function handleSubscriptionCancelled(
  subscription
) {

  console.log(
    "Subscription Cancelled:",
    subscription.id
  );

  await Payment.updateOne(
    {
      subscriptionId:
        subscription.id,
    },
    {
      status: "cancelled",

      cancelledAt: new Date(),
    }
  );
}

/* ======================================================
   SUBSCRIPTION HALTED
====================================================== */

async function handleSubscriptionHalted(
  subscription
) {

  console.log(
    "Subscription Halted:",
    subscription.id
  );


await Payment.updateOne(
  {
    subscriptionId:
      subscription.id,
  },
  {
    status: "halted",
    failedAt: new Date(),
  }
);
}



/* ======================================================
   MIDDLEWARES
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