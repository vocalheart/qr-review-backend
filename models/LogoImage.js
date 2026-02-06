import mongoose from "mongoose";

const logoImageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one user = one logo (optional, but recommended)
    },

    logoUrl: {
      type: String,
      required: true,
    },

    s3Key: {
      type: String,
      required: true,
    },

    bucketName: {
      type: String,
      required: true,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("LogoImage", logoImageSchema);
