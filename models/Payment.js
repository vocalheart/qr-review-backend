// models/Payment.js

import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ===== ONE-TIME PAYMENT =====
    orderId: String,
    paymentId: String,
    signature: String,

    // ===== SUBSCRIPTION =====
    subscriptionId: {
      type: String,
      index: true,
    },

    planId: String,
    shortUrl: String,

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

    status: {
      type: String,
      enum: [
        "created",
        "paid",
        "active",
        "cancelled",
        "failed",
        "expired"
      ],
      default: "created",
    },

    currentStart: Date,
    currentEnd: Date,
    nextChargeAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
