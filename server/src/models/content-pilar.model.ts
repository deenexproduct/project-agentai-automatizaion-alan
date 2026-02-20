/**
 * ContentPilar Model
 *
 * Content pillars define the topics a client publishes about on LinkedIn.
 * The AI rotates between active pillars to maintain variety.
 * Performance scores are updated automatically based on engagement data.
 *
 * Deenex default pillars (from estrategia.md):
 *   1. Canal propio vs intermediarios
 *   2. Datos propios como ventaja competitiva
 *   3. Caso de éxito / social proof
 *   4. Tendencia de la industria (hot take)
 *   5. Fidelización y recurrencia
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Interface ────────────────────────────────────────────────

export interface IContentPilar extends Document {
    userId: string;
    nombre: string;
    descripcion: string;
    keywords: string[];
    frecuenciaSemanal: number;
    formatoPreferido: string;
    ejemplos: string[];
    diasPreferidos: string[];
    activo: boolean;
    performanceScore: number; // average engagement rate (auto-updated)
    totalPosts: number;       // count of published posts with this pilar
    createdAt: Date;
    updatedAt: Date;
}

export interface IContentPilarModel extends Model<IContentPilar> {
    /**
     * Get active pillars for a workspace, ordered by frequency.
     */
    getActiveForWorkspace(userId: string): Promise<IContentPilar[]>;
}

// ── Schema ────────────────────────────────────────────────────

const ContentPilarSchema = new Schema<IContentPilar>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        nombre: {
            type: String,
            required: true,
            trim: true,
        },
        descripcion: {
            type: String,
            required: true,
        },
        keywords: {
            type: [String],
            default: [],
        },
        frecuenciaSemanal: {
            type: Number,
            default: 1,
            min: 0,
            max: 7,
        },
        formatoPreferido: {
            type: String,
            default: 'text',
        },
        ejemplos: {
            type: [String],
            default: [],
        },
        diasPreferidos: {
            type: [String],
            default: [],
        },
        activo: {
            type: Boolean,
            default: true,
        },
        performanceScore: {
            type: Number,
            default: 0,
        },
        totalPosts: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'content_pilares',
    }
);

// ── Indexes ───────────────────────────────────────────────────

ContentPilarSchema.index({ userId: 1, activo: 1 });

// ── Static Methods ────────────────────────────────────────────

ContentPilarSchema.statics.getActiveForWorkspace = async function (
    userId: string
): Promise<IContentPilar[]> {
    return this.find({ userId, activo: true })
        .sort({ frecuenciaSemanal: -1 })
        .exec();
};

// ── Export ────────────────────────────────────────────────────

export const ContentPilar = mongoose.model<IContentPilar, IContentPilarModel>(
    'ContentPilar',
    ContentPilarSchema
);
