import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    email: string;
    name?: string;
    profilePhotoUrl?: string;
    role: 'admin' | 'user';
    platforms: ('comercial' | 'operaciones')[];
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
    profilePhotoUrl: {
        type: String,
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user',
    },
    platforms: {
        type: [String],
        enum: ['comercial', 'operaciones'],
        default: ['comercial'],
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
UserSchema.index({ otpExpiresAt: 1 });

export const UserModel = mongoose.model<IUser>('User', UserSchema);
