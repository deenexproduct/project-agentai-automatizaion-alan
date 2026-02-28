import mongoose, { Schema, Document, Model } from 'mongoose';

function toTitleCase(str: string) {
    if (!str) return str;
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, function (a) { return a.toUpperCase(); });
}

// ── Sub-Interfaces ────────────────────────────────────────────

export interface ISocialMedia {
    instagram?: string;
    linkedin?: string;
    twitter?: string;
    facebook?: string;
}

export interface IResearch {
    notes?: string;
    lastResearchedAt?: Date;
}

export interface ICompanyNote {
    text: string;
    createdAt: Date;
}

// ── Main Interface ────────────────────────────────────────────

export interface ICompany extends Document {
    name: string;
    logo?: string;
    themeColor?: string;
    sector?: string;
    website?: string;
    description?: string;
    localesCount?: number;
    franchiseCount?: number;
    ownedCount?: number;
    costPerLocation?: number;
    category?: string;
    partner?: string | any;
    competitors?: mongoose.Types.ObjectId[];
    posSystems?: mongoose.Types.ObjectId[];
    painPoints?: string[];
    deliveries?: string[];
    socialMedia?: ISocialMedia;
    research?: IResearch;
    assignedTo?: mongoose.Types.ObjectId;
    country?: string;
    notes: ICompanyNote[];
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICompanyModel extends Model<ICompany> {
    /**
     * Search companies by name (text search).
     */
    searchByName(userId: string, query: string, limit?: number): Promise<ICompany[]>;
}

// ── Schema ────────────────────────────────────────────────────

const SocialMediaSchema = new Schema<ISocialMedia>({
    instagram: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    twitter: { type: String, trim: true },
    facebook: { type: String, trim: true },
}, { _id: false });

const ResearchSchema = new Schema<IResearch>({
    notes: { type: String },
    lastResearchedAt: { type: Date },
}, { _id: false });

const CompanyNoteSchema = new Schema<ICompanyNote>({
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const CompanySchema = new Schema<ICompany>({
    name: {
        type: String,
        required: true,
        trim: true,
        set: toTitleCase,
    },
    logo: { type: String, trim: true },
    themeColor: { type: String, trim: true },
    sector: { type: String, trim: true },
    website: { type: String, trim: true },
    description: { type: String },
    localesCount: { type: Number, default: 1 },
    franchiseCount: { type: Number, default: 0 },
    ownedCount: { type: Number, default: 0 },
    costPerLocation: { type: Number, default: 0 },
    category: { type: String },
    partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    competitors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Competitor' }],
    posSystems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PosSystem' }],

    painPoints: [{ type: String }],
    deliveries: [{ type: String }],
    socialMedia: { type: SocialMediaSchema, default: () => ({}) },
    research: { type: ResearchSchema, default: () => ({}) },
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    country: { type: String, trim: true, default: 'AR' },
    notes: { type: [CompanyNoteSchema], default: [] },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
}, {
    timestamps: true,
    collection: 'crm_companies',
});

// ── Indexes ───────────────────────────────────────────────────

/**
 * TEXT INDEX: Full-text search on company name.
 */
CompanySchema.index(
    { name: 'text', description: 'text' },
    {
        name: 'company_text_search',
        default_language: 'spanish',
        weights: { name: 10, description: 3 },
    }
);

/**
 * COMPOUND: userId + sector for filtered queries.
 */
CompanySchema.index({ userId: 1, sector: 1 });

/**
 * COMPOUND: userId + name for uniqueness enforcement at app level.
 */
CompanySchema.index({ userId: 1, name: 1 });

/**
 * COMPOUND: userId + createdAt for paginated listing.
 */
CompanySchema.index({ userId: 1, createdAt: -1 });

// ── Static Methods ────────────────────────────────────────────

CompanySchema.statics.searchByName = async function (
    userId: string,
    query: string,
    limit: number = 20
): Promise<ICompany[]> {
    return this.find({
        userId,
        name: { $regex: query, $options: 'i' },
    })
        .limit(limit)
        .sort({ name: 1 })
        .lean()
        .exec();
};

// ── Export ─────────────────────────────────────────────────────

export const Company = mongoose.model<ICompany, ICompanyModel>(
    'Company',
    CompanySchema
);
