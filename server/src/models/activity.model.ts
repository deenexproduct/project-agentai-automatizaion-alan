import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────

export const ACTIVITY_TYPES = ['call', 'whatsapp', 'linkedin_message', 'email', 'meeting', 'note', 'task_completed', 'referral'] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];

// ── Interface ─────────────────────────────────────────────────

export interface IActivity extends Document {
    type: ActivityType;
    description: string;
    contact?: mongoose.Types.ObjectId;
    deal?: mongoose.Types.ObjectId;
    company?: mongoose.Types.ObjectId;
    task?: mongoose.Types.ObjectId;     // If originated from a completed task
    scheduledAt?: Date;
    completedAt?: Date;
    calendarEventId?: string;
    outcome?: string;
    createdBy?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface IActivityModel extends Model<IActivity> {
    /**
     * Get recent activities for a user (dashboard timeline).
     */
    getRecent(userId: string, limit?: number): Promise<IActivity[]>;

    /**
     * Get activities counts by type for a given week.
     */
    getWeekCounts(userId: string): Promise<Record<string, number>>;
}

// ── Schema ────────────────────────────────────────────────────

const ActivitySchema = new Schema<IActivity>({
    type: {
        type: String,
        enum: ACTIVITY_TYPES,
        required: true,
        index: true,
    },
    description: {
        type: String,
        required: true,
    },
    contact: {
        type: Schema.Types.ObjectId,
        ref: 'CrmContact',
        default: null,
        index: true,
    },
    deal: {
        type: Schema.Types.ObjectId,
        ref: 'Deal',
        default: null,
        index: true,
    },
    company: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        default: null,
    },
    task: {
        type: Schema.Types.ObjectId,
        ref: 'Task',
        default: null,
    },
    scheduledAt: { type: Date },
    completedAt: { type: Date },
    calendarEventId: { type: String },
    outcome: { type: String, trim: true },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
}, {
    timestamps: true,
    collection: 'crm_activities',
});

// ── Indexes ───────────────────────────────────────────────────

/**
 * COMPOUND: userId + createdAt for timeline (default view).
 */
ActivitySchema.index({ userId: 1, createdAt: -1 });

/**
 * COMPOUND: contact + createdAt for contact detail timeline.
 */
ActivitySchema.index({ contact: 1, createdAt: -1 });

/**
 * COMPOUND: deal + createdAt for deal activity log.
 */
ActivitySchema.index({ deal: 1, createdAt: -1 });

/**
 * COMPOUND: company + createdAt for company activity log.
 */
ActivitySchema.index({ company: 1, createdAt: -1 });

/**
 * COMPOUND: userId + type for filtering by activity type.
 */
ActivitySchema.index({ userId: 1, type: 1 });

// ── Static Methods ────────────────────────────────────────────

/**
 * Get recent activities for dashboard timeline.
 */
ActivitySchema.statics.getRecent = async function (
    userId: string,
    limit: number = 20
): Promise<IActivity[]> {
    return this.find({ userId })
        .populate('contact', 'fullName profilePhotoUrl')
        .populate('deal', 'title')
        .populate('company', 'name logo')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();
};

/**
 * Get activity counts by type for the current week.
 */
ActivitySchema.statics.getWeekCounts = async function (
    userId: string
): Promise<Record<string, number>> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const results = await this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                createdAt: { $gte: weekAgo },
            },
        },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
            },
        },
    ]);

    const counts: Record<string, number> = {};
    for (const r of results) {
        counts[r._id] = r.count;
    }
    return counts;
};

// ── Export ─────────────────────────────────────────────────────

export const Activity = mongoose.model<IActivity, IActivityModel>(
    'Activity',
    ActivitySchema
);
