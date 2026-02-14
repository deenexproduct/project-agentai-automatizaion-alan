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

export type ContactStatus = 'visitando' | 'conectando' | 'conectado' | 'interactuando' | 'esperando_aceptacion' | 'aceptado' | 'listo_para_mensaje' | 'mensaje_enviado';

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
    sentAt: Date;
    acceptedAt?: Date;
    readyForMessageAt?: Date;
    messageSentAt?: Date;

    // Notes
    notes: INote[];

    // Metadata
    prospectingBatchId?: string;
    createdAt: Date;
    updatedAt: Date;
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
        enum: ['visitando', 'conectando', 'conectado', 'interactuando', 'esperando_aceptacion', 'aceptado', 'listo_para_mensaje', 'mensaje_enviado'],
        default: 'conectado',
    },

    // Pipeline timestamps
    sentAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
    readyForMessageAt: { type: Date },
    messageSentAt: { type: Date },

    // Notes
    notes: { type: [NoteSchema], default: [] },

    // Metadata
    prospectingBatchId: { type: String },
}, {
    timestamps: true, // adds createdAt + updatedAt automatically
});

// ── Indexes for 100K+ performance ─────────────────────────────

// Unique profile URL — prevent duplicates
LinkedInContactSchema.index({ profileUrl: 1 }, { unique: true });

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

export const LinkedInContact = mongoose.model<ILinkedInContact>('LinkedInContact', LinkedInContactSchema);
