import mongoose, { Document, Schema } from 'mongoose';

export interface ISummary extends Document {
    chatId: string;
    chatName: string;
    hours?: number;
    rangeFrom?: Date;
    rangeTo?: Date;
    rangeMode: 'hours' | 'range';
    totalMessages: number;
    totalAudios: number;
    summary: string;
    config: {
        includeExecutiveSummary: boolean;
        includeTopics: boolean;
        includeDecisions: boolean;
        includeTasks: boolean;
        includeImportantData: boolean;
        includeSentiment: boolean;
        includeSuggestions: boolean;
    };
    llmModel: string;
    processingTimeSeconds: number;
    createdAt: Date;
}

const SummarySchema = new Schema<ISummary>({
    chatId: { type: String, required: true },
    chatName: { type: String, required: true },
    hours: { type: Number },
    rangeFrom: { type: Date },
    rangeTo: { type: Date },
    rangeMode: { type: String, enum: ['hours', 'range'], required: true },
    totalMessages: { type: Number, required: true },
    totalAudios: { type: Number, required: true },
    summary: { type: String, required: true },
    config: {
        includeExecutiveSummary: { type: Boolean, default: true },
        includeTopics: { type: Boolean, default: true },
        includeDecisions: { type: Boolean, default: true },
        includeTasks: { type: Boolean, default: true },
        includeImportantData: { type: Boolean, default: true },
        includeSentiment: { type: Boolean, default: true },
        includeSuggestions: { type: Boolean, default: true },
    },
    llmModel: { type: String, default: 'mistral' },
    processingTimeSeconds: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
});

export const Summary = mongoose.model<ISummary>('Summary', SummarySchema);
