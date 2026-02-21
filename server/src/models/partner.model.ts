import mongoose, { Schema, Document } from 'mongoose';

export interface IPartner extends Document {
    name: string;
    email?: string;
    phone?: string;
    commissionPercentage?: number;
    notes?: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
}

const PartnerSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    commissionPercentage: { type: Number, default: 0 },
    notes: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
}, { timestamps: true });

export const Partner = mongoose.model<IPartner>('Partner', PartnerSchema);
