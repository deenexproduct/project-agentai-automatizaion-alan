import mongoose, { Schema, Document } from 'mongoose';

export interface IInvestmentItem {
    concept: string;
    amount: number;
}

export interface IEventFair extends Document {
    name: string;
    description?: string;
    location?: string;
    website?: string;
    startDate: Date;
    endDate?: Date;
    status: 'upcoming' | 'attending' | 'completed' | 'cancelled';
    ticketStatus: 'none' | 'pending' | 'purchased';
    ticketCount: number;
    investment: number;
    currency: string;
    investmentBreakdown: IInvestmentItem[];
    expectedLeads: mongoose.Types.ObjectId[];
    notes?: string;
    assignedTo?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const EventFairSchema = new Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String },
    location: { type: String, trim: true },
    website: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, enum: ['upcoming', 'attending', 'completed', 'cancelled'], default: 'upcoming' },
    ticketStatus: { type: String, enum: ['none', 'pending', 'purchased'], default: 'none' },
    ticketCount: { type: Number, default: 0 },
    investment: { type: Number, default: 0 },
    currency: { type: String, default: 'ARS' },
    investmentBreakdown: [{
        concept: { type: String, required: true },
        amount: { type: Number, required: true },
    }],
    expectedLeads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CrmContact' }],
    notes: { type: String },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
}, { timestamps: true });

export const EventFair = mongoose.model<IEventFair>('EventFair', EventFairSchema);
