import mongoose, { Schema, Document } from 'mongoose';

export interface IPartner extends Document {
    name: string;
    email?: string;
    phone?: string;
    commissionPercentage?: number;
    notes?: string;
    assignedTo?: mongoose.Types.ObjectId;
    userId: string;
    accessToken?: string;
    accessTokenActivo: boolean;
    ultimoAccesoEn?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PartnerSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    commissionPercentage: { type: Number, default: 0 },
    notes: { type: String },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    accessToken: { type: String, index: true, sparse: true },
    accessTokenActivo: { type: Boolean, default: true },
    ultimoAccesoEn: { type: Date },
}, { timestamps: true });

export const Partner = mongoose.model<IPartner>('Partner', PartnerSchema);
