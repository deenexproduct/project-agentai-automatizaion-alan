import mongoose, { Schema, Document } from 'mongoose';

export interface ICompetitorNote {
    text: string;
    createdAt: Date;
}

export interface ICompetitor extends Document {
    name: string;
    logo?: string;
    url?: string;
    ceo?: string;
    localesCount?: number;
    foundedYear?: number;
    foundersCount?: number;
    employeesCount?: number;
    strength?: 'fuerte' | 'moderada' | 'debil';
    notes?: string;
    advantages: ICompetitorNote[];
    disadvantages: ICompetitorNote[];
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CompetitorSchema = new Schema({
    name: { type: String, required: true, trim: true },
    logo: { type: String },
    url: { type: String, trim: true },
    ceo: { type: String, trim: true },
    localesCount: { type: Number, default: 0 },
    foundedYear: { type: Number },
    foundersCount: { type: Number },
    employeesCount: { type: Number },
    strength: { type: String, enum: ['fuerte', 'moderada', 'debil'], default: 'moderada' },
    notes: { type: String },
    advantages: [{
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
    }],
    disadvantages: [{
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
    }],
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
}, { timestamps: true });

export const Competitor = mongoose.model<ICompetitor>('Competitor', CompetitorSchema);
