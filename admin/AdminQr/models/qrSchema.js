import mongoose from 'mongoose';

const qrSchema = new mongoose.Schema(
  {
    qrUrl: {
      type: String,
      required: true,
    },

    randomId: {
      type: String,
      required: true,
      unique: true,
    },

    imageUrl: {
      type: String, // S3 image (optional but recommended)
    },

    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);

export default mongoose.model("QR", qrSchema);