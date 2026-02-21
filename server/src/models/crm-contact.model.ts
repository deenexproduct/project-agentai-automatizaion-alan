import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────

export const CONTACT_ROLES = ['decision_maker', 'influencer', 'champion', 'gatekeeper', 'user', 'other'] as const;
export type ContactRole = typeof CONTACT_ROLES[number];

export const CONTACT_CHANNELS = ['linkedin', 'whatsapp', 'cold_call', 'email', 'referral', 'event', 'instagram', 'other'] as const;
export type ContactChannel = typeof CONTACT_CHANNELS[number];

// ── Interfaces ────────────────────────────────────────────────

export interface ICrmContactNote {
    text: string;
    createdAt: Date;
}

export interface ICrmContact extends Document {
    fullName: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    position?: string;
    role?: string;
    channel?: string;
    company?: mongoose.Types.ObjectId;
    partner?: mongoose.Types.ObjectId;
    linkedInContactId?: mongoose.Types.ObjectId;
    linkedInProfileUrl?: string;
    isResponsible: boolean;
    assignedTo?: mongoose.Types.ObjectId;
    tags: string[];
    notes: ICrmContactNote[];
    profilePhotoUrl?: string;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICrmContactModel extends Model<ICrmContact> {
    /**
     * Find contacts for a company.
     */
    findByCompany(userId: string, companyId: string): Promise<ICrmContact[]>;
}

// ── Schema ────────────────────────────────────────────────────

const CrmContactNoteSchema = new Schema<ICrmContactNote>({
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const CrmContactSchema = new Schema<ICrmContact>({
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    position: { type: String, trim: true },
    role: {
        type: String,
        default: 'other',
    },
    channel: {
        type: String,
        default: 'other',
    },
    company: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        default: null,
        index: true,
    },
    partner: {
        type: Schema.Types.ObjectId,
        ref: 'Partner',
        default: null,
        index: true,
    },
    linkedInContactId: {
        type: Schema.Types.ObjectId,
        ref: 'LinkedInContact',
        default: null,
    },
    linkedInProfileUrl: {
        type: String,
        trim: true,
    },
    isResponsible: {
        type: Boolean,
        default: false,
    },
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    tags: { type: [String], default: [] },
    notes: { type: [CrmContactNoteSchema], default: [] },
    profilePhotoUrl: { type: String },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
}, {
    timestamps: true,
    collection: 'crm_contacts',
});

// ── Indexes ───────────────────────────────────────────────────

/**
 * TEXT INDEX: Full-text search on name, position, email.
 */
CrmContactSchema.index(
    { fullName: 'text', position: 'text', email: 'text' },
    {
        name: 'crm_contact_text_search',
        default_language: 'spanish',
        weights: { fullName: 10, position: 5, email: 3 },
    }
);

/**
 * COMPOUND: userId + company for listing contacts per company.
 */
CrmContactSchema.index({ userId: 1, company: 1 });

/**
 * COMPOUND: userId + channel for filtering by source.
 */
CrmContactSchema.index({ userId: 1, channel: 1 });

/**
 * COMPOUND: userId + createdAt for paginated listing.
 */
CrmContactSchema.index({ userId: 1, createdAt: -1 });

// ── Static Methods ────────────────────────────────────────────

CrmContactSchema.statics.findByCompany = async function (
    userId: string,
    companyId: string
): Promise<ICrmContact[]> {
    return this.find({ userId, company: companyId })
        .sort({ isResponsible: -1, fullName: 1 })
        .lean()
        .exec();
};

// ── Virtuals ──────────────────────────────────────────────────

CrmContactSchema.virtual('displayName').get(function (this: ICrmContact) {
    if (this.position) {
        return `${this.fullName} — ${this.position}`;
    }
    return this.fullName;
});

// Ensure virtuals are serialized
CrmContactSchema.set('toJSON', { virtuals: true });
CrmContactSchema.set('toObject', { virtuals: true });

// ── Export ─────────────────────────────────────────────────────

export const CrmContact = mongoose.model<ICrmContact, ICrmContactModel>(
    'CrmContact',
    CrmContactSchema
);
