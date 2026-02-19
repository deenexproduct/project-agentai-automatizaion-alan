/**
 * ClientProfile Model
 *
 * Stores the "personality" of a client for AI content generation.
 * Created once from the strategic questionnaire (preguntas.md).
 * The AI system prompt is built dynamically from this profile.
 *
 * One profile per workspace.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Sub-Interfaces ────────────────────────────────────────────

export interface IClientIdentity {
    nombre: string;
    empresa: string;
    rol: string;
    propuestaValor: string;
}

export interface IClientAudience {
    personaPrimaria: string;
    personaSecundaria?: string;
    region: string;
    industrias: string[];
    dolores: string[];
}

export interface IClientTone {
    adjetivos: string[];
    prohibiciones: string[];
    referentes: string[];
}

export interface IClientCalendar {
    frecuencia: string;
    anticipacionRevision: string;
    formatosPreferidos: Record<string, number>; // format → weight%
    zonaHoraria: string;
    horarioBase: string;
}

export interface IClientVisual {
    coloresPrimarios: string[];
    tipografia: string;
    logoUrl?: string;
    estilosPreferidos: string[];
    estilosProhibidos: string[];
}

export interface IClientBusiness {
    productoFeatures: string[];
    eventosProximos: string[];
    fuentesIndustria: string[];
    casosExito: string[];
}

// ── Main Interface ────────────────────────────────────────────

export interface IClientProfile extends Document {
    workspaceId: string;
    identidad: IClientIdentity;
    audiencia: IClientAudience;
    tono: IClientTone;
    calendario: IClientCalendar;
    visual: IClientVisual;
    negocio: IClientBusiness;
    nivelAutonomia: 'low' | 'medium' | 'high';
    createdAt: Date;
    updatedAt: Date;
}

export interface IClientProfileModel extends Model<IClientProfile> {
    /**
     * Get the profile for a workspace (there should be exactly one).
     */
    getForWorkspace(workspaceId: string): Promise<IClientProfile | null>;
}

// ── Schema ────────────────────────────────────────────────────

const ClientIdentitySchema = new Schema<IClientIdentity>(
    {
        nombre: { type: String, required: true },
        empresa: { type: String, required: true },
        rol: { type: String, required: true },
        propuestaValor: { type: String, required: true },
    },
    { _id: false }
);

const ClientAudienceSchema = new Schema<IClientAudience>(
    {
        personaPrimaria: { type: String, required: true },
        personaSecundaria: { type: String },
        region: { type: String, default: 'LATAM' },
        industrias: { type: [String], default: [] },
        dolores: { type: [String], default: [] },
    },
    { _id: false }
);

const ClientToneSchema = new Schema<IClientTone>(
    {
        adjetivos: { type: [String], default: [] },
        prohibiciones: { type: [String], default: [] },
        referentes: { type: [String], default: [] },
    },
    { _id: false }
);

const ClientCalendarSchema = new Schema<IClientCalendar>(
    {
        frecuencia: { type: String, default: '4-5 posts/semana' },
        anticipacionRevision: { type: String, default: '12h' },
        formatosPreferidos: { type: Schema.Types.Mixed, default: {} },
        zonaHoraria: { type: String, default: 'America/Argentina/Buenos_Aires' },
        horarioBase: { type: String, default: '08:00' },
    },
    { _id: false }
);

const ClientVisualSchema = new Schema<IClientVisual>(
    {
        coloresPrimarios: { type: [String], default: [] },
        tipografia: { type: String, default: '' },
        logoUrl: { type: String },
        estilosPreferidos: { type: [String], default: [] },
        estilosProhibidos: { type: [String], default: [] },
    },
    { _id: false }
);

const ClientBusinessSchema = new Schema<IClientBusiness>(
    {
        productoFeatures: { type: [String], default: [] },
        eventosProximos: { type: [String], default: [] },
        fuentesIndustria: { type: [String], default: [] },
        casosExito: { type: [String], default: [] },
    },
    { _id: false }
);

const ClientProfileSchema = new Schema<IClientProfile>(
    {
        workspaceId: {
            type: String,
            required: true,
            unique: true,
        },
        identidad: { type: ClientIdentitySchema, required: true },
        audiencia: { type: ClientAudienceSchema, required: true },
        tono: { type: ClientToneSchema, default: () => ({}) },
        calendario: { type: ClientCalendarSchema, default: () => ({}) },
        visual: { type: ClientVisualSchema, default: () => ({}) },
        negocio: { type: ClientBusinessSchema, default: () => ({}) },
        nivelAutonomia: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'low',
        },
    },
    {
        timestamps: true,
        collection: 'client_profiles',
    }
);

// ── Static Methods ────────────────────────────────────────────

ClientProfileSchema.statics.getForWorkspace = async function (
    workspaceId: string
): Promise<IClientProfile | null> {
    return this.findOne({ workspaceId }).exec();
};

// ── Export ────────────────────────────────────────────────────

export const ClientProfile = mongoose.model<IClientProfile, IClientProfileModel>(
    'ClientProfile',
    ClientProfileSchema
);
