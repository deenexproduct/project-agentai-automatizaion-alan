import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────

export const TASK_TYPES = ['call', 'meeting', 'follow_up', 'proposal', 'research', 'other'] as const;
export type TaskType = typeof TASK_TYPES[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

// ── Interface ─────────────────────────────────────────────────

export interface ITask extends Document {
    title: string;
    type: TaskType;
    priority: TaskPriority;
    status: TaskStatus;
    description?: string;
    assignedTo?: mongoose.Types.ObjectId;
    contact?: mongoose.Types.ObjectId;
    deal?: mongoose.Types.ObjectId;
    company?: mongoose.Types.ObjectId;
    dueDate?: Date;
    durationMinutes: number;
    completedAt?: Date;
    calendarEventId?: string;
    calendarSynced: boolean;
    reminderMinutes: number;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;

    // Virtuals
    isOverdue: boolean;
}

export interface ITaskModel extends Model<ITask> {
    /**
     * Find overdue tasks for a user.
     */
    findOverdue(userId: string): Promise<ITask[]>;

    /**
     * Find tasks due today for a user.
     */
    findDueToday(userId: string): Promise<ITask[]>;
}

// ── Schema ────────────────────────────────────────────────────

const TaskSchema = new Schema<ITask>({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        enum: TASK_TYPES,
        default: 'other',
    },
    priority: {
        type: String,
        enum: TASK_PRIORITIES,
        default: 'medium',
        index: true,
    },
    status: {
        type: String,
        enum: TASK_STATUSES,
        default: 'pending',
        index: true,
    },
    description: { type: String },
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
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
    dueDate: {
        type: Date,
        index: true,
    },
    durationMinutes: {
        type: Number,
        default: 30,
        min: 1,
    },
    completedAt: { type: Date },
    calendarEventId: { type: String },
    calendarSynced: {
        type: Boolean,
        default: false,
    },
    reminderMinutes: {
        type: Number,
        default: 30,
        min: 0,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
}, {
    timestamps: true,
    collection: 'crm_tasks',
});

// ── Indexes ───────────────────────────────────────────────────

/**
 * COMPOUND: userId + status + dueDate for task center default view.
 */
TaskSchema.index({ userId: 1, status: 1, dueDate: 1 });

/**
 * COMPOUND: userId + assignedTo + status for "my tasks" view.
 */
TaskSchema.index({ userId: 1, assignedTo: 1, status: 1 });

/**
 * COMPOUND: userId + priority for priority-sorted views.
 */
TaskSchema.index({ userId: 1, priority: 1 });

/**
 * COMPOUND: deal + status for deal-task listing.
 */
TaskSchema.index({ deal: 1, status: 1 });

/**
 * COMPOUND: contact + status for contact-task listing.
 */
TaskSchema.index({ contact: 1, status: 1 });

// ── Virtuals ──────────────────────────────────────────────────

/**
 * isOverdue: true if dueDate < now and status is not completed/cancelled.
 */
TaskSchema.virtual('isOverdue').get(function (this: ITask): boolean {
    if (!this.dueDate) return false;
    if (this.status === 'completed' || this.status === 'cancelled') return false;
    return this.dueDate.getTime() < Date.now();
});

// Ensure virtuals are serialized
TaskSchema.set('toJSON', { virtuals: true });
TaskSchema.set('toObject', { virtuals: true });

// ── Static Methods ────────────────────────────────────────────

/**
 * Find overdue tasks (dueDate < now and status pending/in_progress).
 */
TaskSchema.statics.findOverdue = async function (
    userId: string
): Promise<ITask[]> {
    return this.find({
        userId,
        dueDate: { $lt: new Date() },
        status: { $in: ['pending', 'in_progress'] },
    })
        .populate('contact', 'fullName')
        .populate('deal', 'title')
        .populate('company', 'name')
        .populate('assignedTo', 'name email')
        .sort({ dueDate: 1 })
        .lean()
        .exec();
};

/**
 * Find tasks due today.
 */
TaskSchema.statics.findDueToday = async function (
    userId: string
): Promise<ITask[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return this.find({
        userId,
        dueDate: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['pending', 'in_progress'] },
    })
        .populate('contact', 'fullName')
        .populate('deal', 'title')
        .populate('company', 'name')
        .populate('assignedTo', 'name email')
        .sort({ dueDate: 1 })
        .lean()
        .exec();
};

// ── Export ─────────────────────────────────────────────────────

export const Task = mongoose.model<ITask, ITaskModel>(
    'Task',
    TaskSchema
);
