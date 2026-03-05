import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Interfaces ────────────────────────────────────────────────

export interface IOpsStage {
    key: string;
    label: string;
    emoji: string;
    color: string;
    order: number;
    duration: string; // e.g. "~2 meses", "Mes 1", "Mes 2-3", "Mes 4+"
    description: string;
    isFinal: boolean;
    isActive: boolean;
}

export interface IOpsPipelineConfig extends Document {
    name: string;
    userId: mongoose.Types.ObjectId;
    stages: IOpsStage[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IOpsPipelineConfigModel extends Model<IOpsPipelineConfig> {
    getOrCreate(userId: string): Promise<IOpsPipelineConfig>;
    getStageKeys(userId: string): Promise<string[]>;
}

// ── Default Stages Seed ───────────────────────────────────────

const DEFAULT_OPS_STAGES: IOpsStage[] = [
    {
        key: 'anticipo',
        label: 'Fase Anticipo',
        emoji: '🚀',
        color: '#6366f1',
        order: 1,
        duration: '~2 meses',
        description: 'Integración POS, App Store/Play Store, setup operativo, capacitaciones, materiales, tablero de rollout. Fee de implementación.',
        isFinal: false,
        isActive: true,
    },
    {
        key: 'go_live',
        label: 'Go-Live Locales Propios',
        emoji: '🏪',
        color: '#0ea5e9',
        order: 2,
        duration: 'Mes 1',
        description: 'Lanzamiento piloto en locales propios. Cobro solo por esos locales. Validar operación real, flujo de pedidos, staff, tiempos y fricciones.',
        isFinal: false,
        isActive: true,
    },
    {
        key: 'ola_1',
        label: 'Ola 1 de Despliegue',
        emoji: '🌊',
        color: '#f97316',
        order: 3,
        duration: 'Mes 2-3',
        description: 'Rollout por tandas (25%-50% franquiciados). Capacitaciones y ajustes finos. Cobro por locales activados.',
        isFinal: false,
        isActive: true,
    },
    {
        key: 'cadena_completa',
        label: 'Cadena Completa',
        emoji: '🏁',
        color: '#22c55e',
        order: 4,
        duration: 'Mes 4+',
        description: 'Cobro de toda la cadena (mínimo garantizado por contrato). Independiente del ritmo interno del cliente.',
        isFinal: true,
        isActive: true,
    },
];

// ── Schema ────────────────────────────────────────────────────

const OpsStageSchema = new Schema<IOpsStage>({
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    emoji: { type: String, default: '' },
    color: { type: String, required: true, default: '#6366f1' },
    order: { type: Number, required: true, min: 0 },
    duration: { type: String, default: '' },
    description: { type: String, default: '' },
    isFinal: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
}, { _id: false });

const OpsPipelineConfigSchema = new Schema<IOpsPipelineConfig>({
    name: {
        type: String,
        required: true,
        default: 'Pipeline Operaciones',
        trim: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    stages: {
        type: [OpsStageSchema],
        default: [],
        validate: {
            validator: (stages: IOpsStage[]) => stages.length > 0,
            message: 'Operations pipeline must have at least one stage.',
        },
    },
}, {
    timestamps: true,
    collection: 'ops_pipeline_configs',
});

// ── Indexes ───────────────────────────────────────────────────

OpsPipelineConfigSchema.index({ userId: 1 }, { unique: true });

// ── Static Methods ────────────────────────────────────────────

OpsPipelineConfigSchema.statics.getOrCreate = async function (
    userId: string
): Promise<IOpsPipelineConfig> {
    let config = await this.findOne({ userId }).exec();
    if (!config) {
        config = await this.create({
            userId,
            stages: DEFAULT_OPS_STAGES,
        });
    }
    return config;
};

OpsPipelineConfigSchema.statics.getStageKeys = async function (
    userId: string
): Promise<string[]> {
    const config = await (this as IOpsPipelineConfigModel).getOrCreate(userId);
    return config.stages
        .filter((s: IOpsStage) => s.isActive)
        .sort((a: IOpsStage, b: IOpsStage) => a.order - b.order)
        .map((s: IOpsStage) => s.key);
};

// ── Export ─────────────────────────────────────────────────────

export const OpsPipelineConfig = mongoose.model<IOpsPipelineConfig, IOpsPipelineConfigModel>(
    'OpsPipelineConfig',
    OpsPipelineConfigSchema
);

export { DEFAULT_OPS_STAGES };
