/**
 * TrendSignal Model
 *
 * Stores sector trends detected by the TrendScraperService.
 * The AI can use these signals to generate timely, reactive content (hot takes).
 * Signals auto-delete after 7 days via TTL index.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// ── Interface ────────────────────────────────────────────────

export interface ITrendSignal extends Document {
    workspaceId: string;
    source: string;
    sourceUrl: string;
    title: string;
    summary: string;
    hotTake?: string;
    relevanceScore: number; // 0-100
    keywords: string[];
    detectedAt: Date;
    used: boolean;
    usedInPostId?: Types.ObjectId;
}

export interface ITrendSignalModel extends Model<ITrendSignal> {
    /**
     * Get unused, high-relevance signals for a workspace.
     */
    getActiveForWorkspace(workspaceId: string, minScore?: number): Promise<ITrendSignal[]>;
}

// ── Schema ────────────────────────────────────────────────────

const TrendSignalSchema = new Schema<ITrendSignal>(
    {
        workspaceId: {
            type: String,
            required: true,
            index: true,
        },
        source: {
            type: String,
            required: true,
        },
        sourceUrl: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        summary: {
            type: String,
            default: '',
        },
        hotTake: {
            type: String,
        },
        relevanceScore: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 0,
        },
        keywords: {
            type: [String],
            default: [],
        },
        detectedAt: {
            type: Date,
            default: () => new Date(),
        },
        used: {
            type: Boolean,
            default: false,
        },
        usedInPostId: {
            type: Schema.Types.ObjectId,
            ref: 'ScheduledPost',
        },
    },
    {
        timestamps: false,
        collection: 'trend_signals',
    }
);

// ── Indexes ───────────────────────────────────────────────────

// Auto-delete after 7 days
TrendSignalSchema.index({ detectedAt: 1 }, { expireAfterSeconds: 604800 });

// Find unused, relevant signals
TrendSignalSchema.index({ workspaceId: 1, used: 1, relevanceScore: -1 });

// Prevent duplicate URLs
TrendSignalSchema.index({ sourceUrl: 1 }, { unique: true, sparse: true });

// ── Static Methods ────────────────────────────────────────────

TrendSignalSchema.statics.getActiveForWorkspace = async function (
    workspaceId: string,
    minScore = 30
): Promise<ITrendSignal[]> {
    return this.find({
        workspaceId,
        used: false,
        relevanceScore: { $gte: minScore },
    })
        .sort({ relevanceScore: -1 })
        .limit(10)
        .exec();
};

// ── Export ────────────────────────────────────────────────────

export const TrendSignal = mongoose.model<ITrendSignal, ITrendSignalModel>(
    'TrendSignal',
    TrendSignalSchema
);
