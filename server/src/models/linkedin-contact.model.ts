import mongoose, { Schema, Document } from 'mongoose';

// ── Interfaces ────────────────────────────────────────────────

export interface IExperience {
    company: string;
    position: string;
    duration?: string;
    logoUrl?: string;
}

export interface IEducation {
    institution: string;
    degree?: string;
    years?: string;
}

export interface INote {
    text: string;
    createdAt: Date;
}

export type ContactStatus = 'visitando' | 'conectando' | 'interactuando' | 'enriqueciendo' | 'esperando_aceptacion' | 'aceptado' | 'mensaje_enviado';

export type EnrichmentStatus = 'pending' | 'enriching' | 'completed' | 'failed';

export interface IEnrichmentNews {
    title: string;
    source: string;
    url: string;
    date?: string;
    summary?: string;
    urlValid?: boolean;
}

export interface IEnrichmentCompany {
    name?: string;
    nameSource?: string;      // Fuente del nombre (ej: "LinkedIn", "Website oficial")
    
    description?: string;     // Descripción completa de la empresa
    descriptionSource?: string; // Fuente de la descripción
    
    website?: string;         // URL oficial
    websiteSource?: string;   // Fuente del website
    
    category?: string;        // Categoría específica
    categorySource?: string;  // Fuente de la categoría
    
    sector?: string;          // Sector general
    sectorSource?: string;    // Fuente del sector
    
    locationsCount?: string;  // Cantidad de locales
    locationsCountSource?: string; // Fuente: "LinkedIn", "Noticia: [URL]", "Website"
    
    socialMedia?: {
        instagram?: string;
        twitter?: string;
    };
    socialMediaSource?: string; // Fuente de redes sociales
}

export interface IEnrichmentInsight {
    text: string;
    source?: string;      // Fuente del insight (ej: "Noticia: [URL]", "LinkedIn", "Análisis")
    confidence?: 'high' | 'medium' | 'low';  // Nivel de confianza
}

export interface IEnrichmentSignal {
    text: string;
    source?: string;      // Fuente de la señal
    evidence?: string;    // Evidencia específica que respalda la señal
    confidence?: 'high' | 'medium' | 'low';
}

export interface IEnrichmentData {
    personProfile?: {
        verifiedPosition?: string;
        positionSource?: string;  // Fuente del cargo
        verifiedCompany?: string;
        companySource?: string;   // Fuente de la empresa verificada
        summary?: string;
        summarySource?: string;   // Fuente del summary
    };
    personNews?: IEnrichmentNews[];
    company?: IEnrichmentCompany;
    companyNews?: IEnrichmentNews[];
    keyInsights?: IEnrichmentInsight[];  // Ahora con fuentes
    buyingSignals?: IEnrichmentSignal[]; // Ahora con fuentes y evidencia
    
    // Metadata de confianza
    confidenceScore?: number;  // 0-100
    dataQuality?: 'verified' | 'partial' | 'estimated' | 'insufficient';
    lastVerifiedAt?: Date;     // Cuándo se verificaron los datos
}

export interface ILinkedInContact extends Document {
    // Identification
    profileUrl: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    headline?: string;

    // Professional
    currentCompany?: string;
    currentPosition?: string;
    companyLogoUrl?: string;
    industry?: string;
    location?: string;

    // Extended profile
    profilePhotoUrl?: string;
    bannerUrl?: string;
    about?: string;
    connectionsCount?: string;
    followersCount?: string;
    connectionDegree?: string;

    // Experience & Education
    experience: IExperience[];
    education: IEducation[];
    skills: string[];

    // CRM State
    status: ContactStatus;

    // Pipeline timestamps
    sentAt: Date;                    // Cuando se envió la solicitud de conexión
    interactedAt?: Date;             // Cuando se dio like al post
    enrichedAt?: Date;               // Cuando se completó el enriquecimiento
    acceptedAt?: Date;               // Cuando aceptaron la conexión
    messageSentAt?: Date;            // Cuando se envió el mensaje manual

    // Notes
    notes: INote[];

    // Metadata
    prospectingBatchId?: string;
    createdAt: Date;
    updatedAt: Date;

    // Enrichment
    enrichmentData?: IEnrichmentData;
    enrichmentStatus?: EnrichmentStatus;
    contextFilePath?: string;
}

// ── Schema ────────────────────────────────────────────────────

const ExperienceSchema = new Schema<IExperience>({
    company: { type: String, required: true },
    position: { type: String, required: true },
    duration: { type: String },
    logoUrl: { type: String },
}, { _id: false });

const EducationSchema = new Schema<IEducation>({
    institution: { type: String, required: true },
    degree: { type: String },
    years: { type: String },
}, { _id: false });

const NoteSchema = new Schema<INote>({
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const LinkedInContactSchema = new Schema<ILinkedInContact>({
    // Identification
    profileUrl: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    firstName: { type: String },
    lastName: { type: String },
    headline: { type: String },

    // Professional
    currentCompany: { type: String },
    currentPosition: { type: String },
    companyLogoUrl: { type: String },
    industry: { type: String },
    location: { type: String },

    // Extended profile
    profilePhotoUrl: { type: String },
    bannerUrl: { type: String },
    about: { type: String },
    connectionsCount: { type: String },
    followersCount: { type: String },
    connectionDegree: { type: String },

    // Experience & Education
    experience: { type: [ExperienceSchema], default: [] },
    education: { type: [EducationSchema], default: [] },
    skills: { type: [String], default: [] },

    // CRM State
    status: {
        type: String,
        enum: ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'],
        default: 'visitando',
    },

    // Pipeline timestamps
    sentAt: { type: Date, default: Date.now },
    interactedAt: { type: Date },
    enrichedAt: { type: Date },
    acceptedAt: { type: Date },
    messageSentAt: { type: Date },

    // Notes
    notes: { type: [NoteSchema], default: [] },

    // Metadata
    prospectingBatchId: { type: String },

    // Enrichment
    enrichmentData: { type: Schema.Types.Mixed, default: null },
    enrichmentStatus: { type: String, enum: ['pending', 'enriching', 'completed', 'failed'], default: null },
    contextFilePath: { type: String },
}, {
    timestamps: true, // adds createdAt + updatedAt automatically
});

// ── Indexes for 100K+ performance ─────────────────────────────

// Unique profile URL — prevent duplicates
// LinkedInContactSchema.index({ profileUrl: 1 }, { unique: true }); // Already handled by schema definition

// Filter by status + sort by date — Kanban columns
LinkedInContactSchema.index({ status: 1, updatedAt: -1 });

// Full-text search on name, headline, company
LinkedInContactSchema.index(
    { fullName: 'text', headline: 'text', currentCompany: 'text' },
    { weights: { fullName: 10, currentCompany: 5, headline: 3 } }
);

// Sort by pipeline dates
LinkedInContactSchema.index({ sentAt: -1 });
LinkedInContactSchema.index({ acceptedAt: -1 });

// Enrichment status queries
LinkedInContactSchema.index({ enrichmentStatus: 1 });

export const LinkedInContact = mongoose.model<ILinkedInContact>('LinkedInContact', LinkedInContactSchema);
