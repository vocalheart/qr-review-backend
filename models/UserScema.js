import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true }, // REQUIRED
    password: { type: String, required: true },

    // OTP fields
    sendOtp: { otp: String, exp: Date },
    verifyOtp: { otp: String, exp: Date },

    // OTP flags
    createAccounteEmailVerificationOtp: {
        type: Boolean,
        default: false,
    },
    sendOtpVerificationOtp: {
        type: Boolean,
        default: false,
    },

    // Email verification
    isVerified: { type: Boolean, default: false },

    // Admin fields
    isBlocked: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },

}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

export default User;