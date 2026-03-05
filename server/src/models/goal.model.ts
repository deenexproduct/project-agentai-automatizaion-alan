import mongoose, { Schema, Document } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────

export const GOAL_CATEGORIES = ['despliegue', 'tecnico', 'capacitacion', 'revenue', 'operativo', 'custom'] as const;
export type GoalCategory = typeof GOAL_CATEGORIES[number];

export const GOAL_STATUSES = ['active', 'completed', 'cancelled', 'archived'] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];

// ── Sub-document: completion history entry ────────────────────

export interface IGoalHistoryEntry {
    date: Date;
    previousValue: number;
    newValue: number;
    note?: string;
    completedBy?: mongoose.Types.ObjectId;
}

const GoalHistoryEntrySchema = new Schema<IGoalHistoryEntry>({
    date: { type: Date, default: Date.now },
    previousValue: { type: Number, required: true },
    newValue: { type: Number, required: true },
    note: { type: String },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

export interface IMilestone {
    title: string;
    completed: boolean;
    completedAt?: Date;
}

const MilestoneSchema = new Schema<IMilestone>({
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
}, { _id: true });

// ── Interface ─────────────────────────────────────────────────

export interface IGoal extends Document {
    title: string;
    description?: string;
    target: number;
    current: number;
    unit: string;
    category: GoalCategory;
    customCategory?: string;
    status: GoalStatus;
    deadline?: Date;
    company?: mongoose.Types.ObjectId;
    assignedTo?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    history: IGoalHistoryEntry[];
    milestones: IMilestone[];
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────

const GoalSchema = new Schema<IGoal>({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: { type: String },
    target: {
        type: Number,
        required: true,
        min: 1,
    },
    current: {
        type: Number,
        default: 0,
        min: 0,
    },
    unit: {
        type: String,
        required: true,
        trim: true,
        default: 'unidades',
    },
    category: {
        type: String,
        enum: GOAL_CATEGORIES,
        default: 'operativo',
    },
    customCategory: { type: String },
    status: {
        type: String,
        enum: GOAL_STATUSES,
        default: 'active',
        index: true,
    },
    deadline: { type: Date },
    company: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        default: null,
    },
    assignedTo: {
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
    history: {
        type: [GoalHistoryEntrySchema],
        default: [],
    },
    milestones: {
        type: [MilestoneSchema],
        default: [],
    },
    completedAt: { type: Date },
}, {
    timestamps: true,
    collection: 'ops_goals',
});

// ── Virtuals ──────────────────────────────────────────────────

GoalSchema.virtual('progress').get(function (this: IGoal): number {
    if (this.target <= 0) return 0;
    return Math.min(Math.round((this.current / this.target) * 100), 100);
});

GoalSchema.virtual('isOverdue').get(function (this: IGoal): boolean {
    if (!this.deadline) return false;
    if (this.status === 'completed' || this.status === 'cancelled') return false;
    return this.deadline.getTime() < Date.now();
});

GoalSchema.set('toJSON', { virtuals: true });
GoalSchema.set('toObject', { virtuals: true });

// ── Indexes ───────────────────────────────────────────────────

GoalSchema.index({ userId: 1, status: 1 });
GoalSchema.index({ company: 1, status: 1 });

// ── Export ─────────────────────────────────────────────────────

export const Goal = mongoose.model<IGoal>('Goal', GoalSchema);
