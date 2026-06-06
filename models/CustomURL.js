// models/CustomURL.js

import mongoose from "mongoose";

const customURLSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  companyName: {
    type: String,
    required: true,
    trim: true,
  },

  url: {
    type: String,
    required: true,
  },

  redirectFromRating: {
    type: Number,
    default: 3,
    min: 1,
    max: 5,
  },

  // ===== ANALYTICS =====

  totalViews: {
    type: Number,
    default: 0,
  },

  oneStarCount: {
    type: Number,
    default: 0,
  },

  twoStarCount: {
    type: Number,
    default: 0,
  },

  threeStarCount: {
    type: Number,
    default: 0,
  },

  fourStarCount: {
    type: Number,
    default: 0,
  },

  fiveStarCount: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const CustomURL = mongoose.model("CustomURL", customURLSchema);

export default CustomURL;