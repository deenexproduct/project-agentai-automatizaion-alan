import { Schema, model, Document } from 'mongoose';

export interface ITranscription extends Document {
    userId: Schema.Types.ObjectId;
    text: string;
    source: 'dictation' | 'file' | 'blob';
    duration?: number;
    filename?: string;
    createdAt: Date;
    updatedAt: Date;
}

const transcriptionSchema = new Schema<ITranscription>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        text: {
            type: String,
            required: true
        },
        source: {
            type: String,
            enum: ['dictation', 'file', 'blob'],
            required: true
        },
        duration: {
            type: Number,
            default: 0
        },
        filename: {
            type: String
        }
    },
    { timestamps: true }
);

// Optional: Automatically remove transcriptions older than X days to save space
// transcriptionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days 

export const Transcription = model<ITranscription>('Transcription', transcriptionSchema);
