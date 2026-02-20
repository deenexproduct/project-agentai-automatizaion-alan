import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    email: string;
    name?: string;
    role: 'admin' | 'user';
    invitedBy?: mongoose.Types.ObjectId;
    otpCode?: string;
    otpExpiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    name: {
        type: String,
        trim: true,
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user',
    },
    invitedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    otpCode: {
        type: String, // 6-digit code
    },
    otpExpiresAt: {
        type: Date,
    },
}, {
    timestamps: true,
});

// Indexes for fast lookup
UserSchema.index({ email: 1 });
UserSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 }); // Automatic cleanup of expired OTPs optional, but we just want the index for fast query

export const UserModel = mongoose.model<IUser>('User', UserSchema);
