import mongoose, { Schema, Document } from 'mongoose';

export interface IScheduledMessage extends Document {
    chatId: string;
    chatName: string;
    isGroup: boolean;
    messageType: 'text' | 'audio' | 'file';
    textContent?: string;
    filePath?: string;
    fileName?: string;
    scheduledAt: Date;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    sentAt?: Date;
    error?: string;
    retryCount: number;
    isRecurring: boolean;
    cronPattern?: string;
    recurringLabel?: string;
    parentId?: mongoose.Types.ObjectId;
    createdAt: Date;
}

const ScheduledMessageSchema = new Schema<IScheduledMessage>({
    chatId: { type: String, required: true },
    chatName: { type: String, required: true },
    isGroup: { type: Boolean, default: false },
    messageType: { type: String, enum: ['text', 'audio', 'file'], required: true },
    textContent: { type: String },
    filePath: { type: String },
    fileName: { type: String },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending' },
    sentAt: { type: Date },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    isRecurring: { type: Boolean, default: false },
    cronPattern: { type: String },
    recurringLabel: { type: String },
    parentId: { type: Schema.Types.ObjectId, ref: 'ScheduledMessage' },
    createdAt: { type: Date, default: Date.now },
});

// Index for efficient scheduler queries
ScheduledMessageSchema.index({ status: 1, scheduledAt: 1 });

export const ScheduledMessage = mongoose.model<IScheduledMessage>('ScheduledMessage', ScheduledMessageSchema);
