/**
 * ScheduledPost Model
 *
 * The central model for the LinkedIn Publishing Engine.
 * Tracks a post through its full lifecycle:
 *   draft → approved → scheduled → publishing → published → (metrics scraped)
 *
 * Contains the AI-generated content, scheduling info, and engagement metrics.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────

export type PostStatus =
    | 'draft'       // AI generated, waiting for CEO approval
    | 'approved'    // CEO approved, waiting for scheduled time
    | 'scheduled'   // In the publish queue
    | 'publishing'  // Currently being posted via Puppeteer
    | 'published'   // Successfully posted to LinkedIn
    | 'failed'      // Publish attempt failed (after retries)
    | 'rejected';   // CEO rejected the draft

const POST_STATUSES: PostStatus[] = [
    'draft', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected',
];

// ── AI Metadata ───────────────────────────────────────────────

export interface IAIMetadata {
    originalIdea: string;
    context?: string;
    pilar: string;
    formato: string;
    hookType: string;
    trendSignals: string[];
    predictedEngagement: 'bajo' | 'medio' | 'alto';
    model: string;
    promptUsed: string;
    generationTimeMs: number;
    imagePrompt?: string;
}

// ── Engagement Metrics ────────────────────────────────────────

export interface IMetricSnapshot {
    at: Date;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
}

export interface IEngagementMetrics {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    engagementRate: number; // (likes+comments+shares) / impressions * 100
    scrapedAt?: Date;
    snapshots: IMetricSnapshot[];
}

// ── Main Interface ────────────────────────────────────────────

export interface IScheduledPost extends Document {
    accountId: Types.ObjectId;
    workspaceId: string;
    content: string;
    hashtags: string[];
    mediaUrls: string[];
    scheduledAt: Date;
    publishedAt?: Date;
    linkedinPostUrl?: string;
    status: PostStatus;
    rejectionReason?: string;
    retryCount: number;
    aiMetadata: IAIMetadata;
    engagement: IEngagementMetrics;
    createdAt: Date;
    updatedAt: Date;
}

export interface IScheduledPostModel extends Model<IScheduledPost> {
    /**
     * Find posts ready to publish: status=approved AND scheduledAt <= now.
     */
    findPendingForAccount(accountId: Types.ObjectId): Promise<IScheduledPost[]>;

    /**
     * Find draft posts for a workspace (awaiting CEO approval).
     */
    findDraftsForWorkspace(workspaceId: string): Promise<IScheduledPost[]>;
}

// ── Sub-Schemas ───────────────────────────────────────────────

const MetricSnapshotSchema = new Schema<IMetricSnapshot>(
    {
        at: { type: Date, required: true },
        impressions: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
    },
    { _id: false }
);

const AIMetadataSchema = new Schema<IAIMetadata>(
    {
        originalIdea: { type: String, required: true },
        context: { type: String },
        pilar: { type: String, required: true },
        formato: { type: String, required: true },
        hookType: { type: String, default: '' },
        trendSignals: { type: [String], default: [] },
        predictedEngagement: {
            type: String,
            enum: ['bajo', 'medio', 'alto'],
            default: 'medio',
        },
        model: { type: String, required: true },
        promptUsed: { type: String, required: true },
        generationTimeMs: { type: Number, default: 0 },
        imagePrompt: { type: String },
    },
    { _id: false }
);

const EngagementSchema = new Schema<IEngagementMetrics>(
    {
        impressions: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        engagementRate: { type: Number, default: 0 },
        scrapedAt: { type: Date },
        snapshots: { type: [MetricSnapshotSchema], default: [] },
    },
    { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────

const ScheduledPostSchema = new Schema<IScheduledPost>(
    {
        accountId: {
            type: Schema.Types.ObjectId,
            ref: 'LinkedInAccount',
            required: true,
            index: true,
        },
        workspaceId: {
            type: String,
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: true,
            maxlength: [3000, 'LinkedIn posts cannot exceed 3000 characters'],
        },
        hashtags: {
            type: [String],
            validate: {
                validator: (v: string[]) => v.length <= 5,
                message: 'Maximum 5 hashtags allowed',
            },
            default: [],
        },
        mediaUrls: {
            type: [String],
            default: [],
        },
        scheduledAt: {
            type: Date,
            required: true,
        },
        publishedAt: {
            type: Date,
        },
        linkedinPostUrl: {
            type: String,
        },
        status: {
            type: String,
            required: true,
            enum: POST_STATUSES,
            default: 'draft',
            index: true,
        },
        rejectionReason: {
            type: String,
        },
        retryCount: {
            type: Number,
            default: 0,
        },
        aiMetadata: {
            type: AIMetadataSchema,
            required: true,
        },
        engagement: {
            type: EngagementSchema,
            default: () => ({}),
        },
    },
    {
        timestamps: true,
        collection: 'scheduled_posts',
    }
);

// ── Indexes ───────────────────────────────────────────────────

// Publish queue: find approved posts ready to publish
ScheduledPostSchema.index({ accountId: 1, status: 1, scheduledAt: 1 });

// Workspace drafts
ScheduledPostSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

// Analytics by pilar
ScheduledPostSchema.index({ 'aiMetadata.pilar': 1, status: 1 });

// ── Pre-save Hook ─────────────────────────────────────────────

ScheduledPostSchema.pre('save', function (next) {
    // Auto-set publishedAt when status changes to 'published'
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
        this.publishedAt = new Date();
    }
    next();
});

// ── Static Methods ────────────────────────────────────────────

ScheduledPostSchema.statics.findPendingForAccount = async function (
    accountId: Types.ObjectId
): Promise<IScheduledPost[]> {
    return this.find({
        accountId,
        status: 'approved',
        scheduledAt: { $lte: new Date() },
    })
        .sort({ scheduledAt: 1 })
        .exec();
};

ScheduledPostSchema.statics.findDraftsForWorkspace = async function (
    workspaceId: string
): Promise<IScheduledPost[]> {
    return this.find({
        workspaceId,
        status: 'draft',
    })
        .sort({ createdAt: -1 })
        .exec();
};

// ── Export ────────────────────────────────────────────────────

export const ScheduledPost = mongoose.model<IScheduledPost, IScheduledPostModel>(
    'ScheduledPost',
    ScheduledPostSchema
);
