import mongoose from 'mongoose';

const qrSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },

    qrUrl: {
      type: String,
      required: true,
    },

    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", //relation with Admin
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    }
  },
  { timestamps: true }
);

export default mongoose.model("QR", qrSchema);