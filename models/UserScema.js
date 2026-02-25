import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: null },
    sendOtp: { otp: String, exp: Date },
    verifyOtp: { otp: String, exp: Date },

    // ── NEW FIELDS FOR ADMIN MANAGEMENT ─────────────────────
    isBlocked: { type: Boolean, default: false },     // Block / Unblock feature
    lastLogin: { type: Date, default: null },         // For "Today Active" users

}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

export default User;