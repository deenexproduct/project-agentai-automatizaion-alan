import mongoose, { Schema, Document } from 'mongoose';

// ── Interfaces ────────────────────────────────────────────────

export interface ITaskDetail {
    taskId: mongoose.Types.ObjectId;
    title: string;
    status: string;
    type?: string;
    completedAt?: Date;
    company?: { _id: mongoose.Types.ObjectId; name: string };
    contact?: { _id: mongoose.Types.ObjectId; fullName: string };
    assignedTo?: { _id: mongoose.Types.ObjectId; name: string };
}

export interface IGoalSnapshot {
    goalId: mongoose.Types.ObjectId;
    title: string;
    category: string;
    target: number;
    currentAtStart: number;
    currentAtEnd: number;
    weekDelta: number;
    weekProgress: number; // percentage gained this week
    totalTasks: number;
    completedTasks: number;
    tasksCompletedThisWeek: number;
    status: string;
    company?: { _id: mongoose.Types.ObjectId; name: string };
}

export interface IDayProductivity {
    day: string; // mon, tue, wed, thu, fri, sat, sun
    dayLabel: string; // Lunes, Martes, ...
    tasksCompleted: number;
    tasksCreated: number;
}

export interface IWeeklyReport extends Document {
    weekStart: Date;
    weekEnd: Date;
    weekLabel: string; // e.g. "Semana del 3 al 9 de marzo 2026"
    generatedAt: Date;
    generatedBy: mongoose.Types.ObjectId;

    // ── Task Metrics ──
    totalTasksAtStart: number;
    totalTasksCreated: number;
    totalTasksCompleted: number;
    completionRate: number; // percentage
    completedTasks: ITaskDetail[];
    pendingTasks: ITaskDetail[];

    // ── Goal Metrics ──
    goalsSnapshot: IGoalSnapshot[];
    goalsCompletedThisWeek: number;
    avgGoalProgress: number;

    // ── Productivity ──
    dailyProductivity: IDayProductivity[];
    mostProductiveDay: string;
    mostProductiveDayCount: number;

    // ── Pipeline Metrics ──
    dealsMovedForward: number;
    dealsByStatus: Record<string, number>;

    // ── Summary ──
    highlights: string[];
    overallScore: number; // 0-100

    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────

const TaskDetailSchema = new Schema({
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    title: String,
    status: String,
    type: String,
    completedAt: Date,
    company: {
        _id: Schema.Types.ObjectId,
        name: String,
    },
    contact: {
        _id: Schema.Types.ObjectId,
        fullName: String,
    },
    assignedTo: {
        _id: Schema.Types.ObjectId,
        name: String,
    },
}, { _id: false });

const GoalSnapshotSchema = new Schema({
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal' },
    title: String,
    category: String,
    target: Number,
    currentAtStart: Number,
    currentAtEnd: Number,
    weekDelta: Number,
    weekProgress: Number,
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    tasksCompletedThisWeek: { type: Number, default: 0 },
    status: String,
    company: {
        _id: Schema.Types.ObjectId,
        name: String,
    },
}, { _id: false });

const DayProductivitySchema = new Schema({
    day: String,
    dayLabel: String,
    tasksCompleted: Number,
    tasksCreated: Number,
}, { _id: false });

const WeeklyReportSchema = new Schema<IWeeklyReport>({
    weekStart: { type: Date, required: true, index: true },
    weekEnd: { type: Date, required: true },
    weekLabel: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    totalTasksAtStart: { type: Number, default: 0 },
    totalTasksCreated: { type: Number, default: 0 },
    totalTasksCompleted: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    completedTasks: [TaskDetailSchema],
    pendingTasks: [TaskDetailSchema],

    goalsSnapshot: [GoalSnapshotSchema],
    goalsCompletedThisWeek: { type: Number, default: 0 },
    avgGoalProgress: { type: Number, default: 0 },

    dailyProductivity: [DayProductivitySchema],
    mostProductiveDay: { type: String, default: '' },
    mostProductiveDayCount: { type: Number, default: 0 },

    dealsMovedForward: { type: Number, default: 0 },
    dealsByStatus: { type: Schema.Types.Mixed, default: {} },

    highlights: [String],
    overallScore: { type: Number, default: 0 },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, {
    timestamps: true,
    collection: 'ops_weekly_reports',
});

WeeklyReportSchema.index({ weekStart: -1, userId: 1 });

export const WeeklyReport = mongoose.model<IWeeklyReport>('WeeklyReport', WeeklyReportSchema);
