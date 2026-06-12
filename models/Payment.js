import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* =========================================
       ONE TIME PAYMENT
    ========================================= */

    orderId: {
      type: String,
      default: null,
    },

    paymentId: {
      type: String,
      default: null,
    },

    signature: {
      type: String,
      default: null,
    },

    /* =========================================
       SUBSCRIPTION
    ========================================= */

    subscriptionId: {
      type: String,
      default: null,
    },

    planId: {
      type: String,
      default: null,
    },

    planType: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      default: null,
    },

    shortUrl: {
      type: String,
      default: null,
    },

    /* =========================================
       PAYMENT INFO
    ========================================= */

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    type: {
      type: String,
      enum: ["order", "subscription"],
      required: true,
    },

    /* =========================================
       STATUS
    ========================================= */

    status: {
      type: String,
      enum: [
        "created",
        "authenticated",
        "active",
        "paid",
        "halted",
        "cancelled",
        "completed",
        "failed",
        "expired",
      ],
      default: "created",
    },

    /* =========================================
       HISTORY VISIBILITY
       false = pending/abandoned (hidden from history)
       true  = payment confirmed (show in history)
    ========================================= */

    isVisible: {
      type: Boolean,
      default: false,
    },

    /* =========================================
       SUBSCRIPTION DATES
    ========================================= */

    currentStart: {
      type: Date,
      default: null,
    },

    currentEnd: {
      type: Date,
      default: null,
    },

    nextChargeAt: {
      type: Date,
      default: null,
    },

    /* =========================================
       FREE TRIAL
    ========================================= */

    trialStart: {
      type: Date,
      default: null,
    },

    trialEnd: {
      type: Date,
      default: null,
    },

    // VERY IMPORTANT — ONLY ONE FREE TRIAL PER USER LIFETIME
    trialUsed: {
      type: Boolean,
      default: false,
    },

    /* =========================================
       FAILURE / CANCEL INFO
    ========================================= */

    cancelledAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    /* =========================================
       EXTRA
    ========================================= */

    notes: {
      type: Object,
      default: {},
    },

    razorpayCustomerId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;