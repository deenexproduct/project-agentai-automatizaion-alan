import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Interfaces ────────────────────────────────────────────────

export interface IPipelineStage {
    key: string;
    label: string;
    color: string;
    order: number;
    isFinal: boolean;
    isActive: boolean;
}

export interface IPipelineConfig extends Document {
    name: string;
    userId: mongoose.Types.ObjectId;
    stages: IPipelineStage[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IPipelineConfigModel extends Model<IPipelineConfig> {
    /**
     * Get config for a user, or create with default stages if none exists.
     */
    getOrCreate(userId: string): Promise<IPipelineConfig>;

    /**
     * Get active stage keys for validation.
     */
    getStageKeys(userId: string): Promise<string[]>;
}

// ── Default Stages Seed ───────────────────────────────────────

const DEFAULT_STAGES: IPipelineStage[] = [
    { key: 'lead', label: 'Lead Potencial', color: '#6366f1', order: 1, isFinal: false, isActive: true },
    { key: 'contactado', label: 'Contactado', color: '#8b5cf6', order: 2, isFinal: false, isActive: true },
    { key: 'coordinando', label: 'Coordinando', color: '#0ea5e9', order: 3, isFinal: false, isActive: true },
    { key: 'seguimiento', label: 'Seguimiento', color: '#a855f7', order: 4, isFinal: false, isActive: true },
    { key: 'reuniones', label: 'Reuniones', color: '#ec4899', order: 5, isFinal: false, isActive: true },
    { key: 'negociacion', label: 'Negociación', color: '#f97316', order: 6, isFinal: false, isActive: true },
    { key: 'ganado', label: 'Ganado', color: '#22c55e', order: 7, isFinal: true, isActive: true },
    { key: 'perdido', label: 'Perdido', color: '#ef4444', order: 8, isFinal: true, isActive: true },
    { key: 'pausado', label: 'Pausado', color: '#94a3b8', order: 9, isFinal: false, isActive: true },
];

// ── Schema ────────────────────────────────────────────────────

const PipelineStageSchema = new Schema<IPipelineStage>({
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    color: { type: String, required: true, default: '#6366f1' },
    order: { type: Number, required: true, min: 0 },
    isFinal: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
}, { _id: false });

const PipelineConfigSchema = new Schema<IPipelineConfig>({
    name: {
        type: String,
        required: true,
        default: 'Pipeline Comercial',
        trim: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    stages: {
        type: [PipelineStageSchema],
        default: [],
        validate: {
            validator: (stages: IPipelineStage[]) => stages.length > 0,
            message: 'Pipeline must have at least one stage.',
        },
    },
}, {
    timestamps: true,
    collection: 'pipeline_configs',
});

// ── Indexes ───────────────────────────────────────────────────

/**
 * Unique pipeline per user (for now single pipeline per tenant).
 */
PipelineConfigSchema.index({ userId: 1 }, { unique: true });

// ── Static Methods ────────────────────────────────────────────

/**
 * Get config for a user, or create with default 9 stages if none exists.
 */
PipelineConfigSchema.statics.getOrCreate = async function (
    userId: string
): Promise<IPipelineConfig> {
    let config = await this.findOne({ userId }).exec();
    if (!config) {
        config = await this.create({
            userId,
            stages: DEFAULT_STAGES,
        });
    }
    return config;
};

/**
 * Get active stage keys for validation (e.g., when creating/updating a Deal).
 */
PipelineConfigSchema.statics.getStageKeys = async function (
    userId: string
): Promise<string[]> {
    const config = await (this as IPipelineConfigModel).getOrCreate(userId);
    return config.stages
        .filter((s: IPipelineStage) => s.isActive)
        .sort((a: IPipelineStage, b: IPipelineStage) => a.order - b.order)
        .map((s: IPipelineStage) => s.key);
};

// ── Export ─────────────────────────────────────────────────────

export const PipelineConfig = mongoose.model<IPipelineConfig, IPipelineConfigModel>(
    'PipelineConfig',
    PipelineConfigSchema
);

export { DEFAULT_STAGES };
