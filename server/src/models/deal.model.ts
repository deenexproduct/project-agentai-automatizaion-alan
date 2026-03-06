import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Interfaces ────────────────────────────────────────────────

export interface IStatusChange {
    from: string;
    to: string;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
}

export interface IDealNote {
    text: string;
    createdAt: Date;
}

export interface IDeal extends Document {
    title: string;
    value: number;
    currency: string;
    status: string; // Dynamic — validated against PipelineConfig at route level
    company?: mongoose.Types.ObjectId;
    primaryContact?: mongoose.Types.ObjectId;
    contacts: mongoose.Types.ObjectId[];
    assignedTo?: mongoose.Types.ObjectId;
    expectedCloseDate?: Date;
    closedAt?: Date;
    lostReason?: string;
    statusHistory: IStatusChange[];
    notes: IDealNote[];
    userId: mongoose.Types.ObjectId;
    // Operations pipeline fields
    opsStatus?: string;
    opsAssignedTo?: mongoose.Types.ObjectId;
    opsStartDate?: Date;
    opsStatusHistory: IStatusChange[];
    createdAt: Date;
    updatedAt: Date;

    // Instance methods
    daysInCurrentStatus(): number;
}

export interface IDealModel extends Model<IDeal> {
    /**
     * Get deals grouped by status for Kanban view.
     */
    getByPipeline(userId: string): Promise<Record<string, IDeal[]>>;
}

// ── Schema ────────────────────────────────────────────────────

const StatusChangeSchema = new Schema<IStatusChange>({
    from: { type: String, required: true },
    to: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const DealNoteSchema = new Schema<IDealNote>({
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const DealSchema = new Schema<IDeal>({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    value: {
        type: Number,
        default: 0,
        min: 0,
    },
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'ARS', 'EUR'],
        trim: true,
    },
    status: {
        type: String,
        required: true,
        default: 'lead',
        trim: true,
        index: true,
    },
    company: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        default: null,
        index: true,
    },
    primaryContact: {
        type: Schema.Types.ObjectId,
        ref: 'CrmContact',
        default: null,
    },
    contacts: [{
        type: Schema.Types.ObjectId,
        ref: 'CrmContact',
    }],
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    expectedCloseDate: { type: Date },
    closedAt: { type: Date },
    lostReason: { type: String, trim: true },
    statusHistory: { type: [StatusChangeSchema], default: [] },
    notes: { type: [DealNoteSchema], default: [] },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // ── Operations Pipeline Fields ──
    opsStatus: {
        type: String,
        default: null,
        trim: true,
        index: true,
    },
    opsAssignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    opsStartDate: {
        type: Date,
        default: null,
    },
    opsStatusHistory: { type: [StatusChangeSchema], default: [] },
}, {
    timestamps: true,
    collection: 'crm_deals',
});

// ── Indexes ───────────────────────────────────────────────────

/**
 * COMPOUND: userId + status for Kanban pipeline queries.
 */
DealSchema.index({ userId: 1, status: 1 });

/**
 * COMPOUND: userId + company for company-detail deals tab.
 */
DealSchema.index({ userId: 1, company: 1 });

/**
 * COMPOUND: userId + assignedTo for task-center filtering.
 */
DealSchema.index({ userId: 1, assignedTo: 1 });

/**
 * COMPOUND: userId + expectedCloseDate for forecasting.
 */
DealSchema.index({ userId: 1, expectedCloseDate: 1 });

/**
 * COMPOUND: userId + createdAt for paginated listing.
 */
DealSchema.index({ userId: 1, createdAt: -1 });

// ── Pre-save Middleware ───────────────────────────────────────

/**
 * Record status changes in statusHistory automatically.
 */
DealSchema.pre('save', function (next) {
    if (this.isModified('status') && !this.isNew) {
        const previousStatus = (this as any)._previousStatus;
        if (previousStatus && previousStatus !== this.status) {
            this.statusHistory.push({
                from: previousStatus,
                to: this.status,
                changedAt: new Date(),
                changedBy: undefined, // Set by route handler via deal._previousStatus
            });
        }
    }
    // Track opsStatus changes
    if (this.isModified('opsStatus') && !this.isNew) {
        const prevOps = (this as any)._previousOpsStatus;
        if (prevOps && prevOps !== this.opsStatus) {
            this.opsStatusHistory.push({
                from: prevOps,
                to: this.opsStatus!,
                changedAt: new Date(),
                changedBy: (this as any)._opsChangedBy || undefined,
            });
        }
    }
    next();
});

/**
 * Capture the previous status before any save.
 */
DealSchema.pre('validate', function (next) {
    if (this.isModified('status') && !this.isNew) {
        // We need the original value. Mongoose tracks it via this.modifiedPaths()
        // but not the old value. We store it as a transient property.
        const original = this.get('status', null, { getters: false });
        // This is a workaround: the route handler should set _previousStatus before saving
    }
    next();
});

// ── Instance Methods ──────────────────────────────────────────

/**
 * Calculate days the deal has been in its current status.
 */
DealSchema.methods.daysInCurrentStatus = function (this: IDeal): number {
    if (this.statusHistory.length === 0) {
        // Never changed — days since creation
        const diffMs = Date.now() - this.createdAt.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
    const lastChange = this.statusHistory[this.statusHistory.length - 1];
    const diffMs = Date.now() - lastChange.changedAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// ── Static Methods ────────────────────────────────────────────

/**
 * Get deals grouped by status for Kanban view.
 */
DealSchema.statics.getByPipeline = async function (
    userId: string
): Promise<Record<string, IDeal[]>> {
    const deals = await this.find({ userId })
        .populate('company', 'name logo sector')
        .populate('primaryContact', 'fullName position profilePhotoUrl')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    const grouped: Record<string, IDeal[]> = {};
    for (const deal of deals) {
        const status = (deal as IDeal).status;
        if (!grouped[status]) {
            grouped[status] = [];
        }
        grouped[status].push(deal as IDeal);
    }
    return grouped;
};

// ── Export ─────────────────────────────────────────────────────

export const Deal = mongoose.model<IDeal, IDealModel>(
    'Deal',
    DealSchema
);
