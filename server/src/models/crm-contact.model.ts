import mongoose, { Schema, Document, Model } from 'mongoose';

function toTitleCase(str: string) {
    if (!str) return str;
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, function (a) { return a.toUpperCase(); });
}

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
    positions: string[];
    role?: string;
    channel?: string;
    company?: mongoose.Types.ObjectId;
    companies: mongoose.Types.ObjectId[];
    partner?: mongoose.Types.ObjectId;
    linkedInContactId?: mongoose.Types.ObjectId;
    linkedInProfileUrl?: string;
    isResponsible: boolean;
    assignedTo?: mongoose.Types.ObjectId;
    tags: string[];
    notes: ICrmContactNote[];
    profilePhotoUrl?: string;
    country?: string;
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
        set: toTitleCase,
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
            validator: (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            message: 'El email no tiene un formato válido',
        },
    },
    phone: { type: String, trim: true },
    position: { type: String, trim: true },
    positions: [{ type: String, trim: true }],
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
    companies: [{
        type: Schema.Types.ObjectId,
        ref: 'Company',
        index: true,
    }],
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
    country: { type: String, trim: true, default: 'AR' },
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
CrmContactSchema.index({ userId: 1, companies: 1 });

/**
 * COMPOUND: userId + channel for filtering by source.
 */
CrmContactSchema.index({ userId: 1, channel: 1 });

/**
 * COMPOUND: userId + createdAt for paginated listing.
 */
CrmContactSchema.index({ userId: 1, createdAt: -1 });

// ── Hooks ─────────────────────────────────────────────────────

/**
 * Mantiene alineados los pares duplicados del modelo cuando se escribe POR QUERY
 * (`findOneAndUpdate`, `updateOne`, `updateMany`).
 *
 * El `pre('save')` de abajo es document middleware: Mongoose NO lo dispara en
 * los updates por query, y ese es justamente el camino del PATCH de contactos
 * (crm.routes.ts) y de otros 5 lugares. Sin este hook, mover un contacto de la
 * empresa A a la B dejaba `companies[]` en B y `company` en A, y como todas las
 * lecturas hacen `$or: [{company}, {companies}]`, el contacto quedaba colgando
 * de LAS DOS empresas para siempre.
 */
CrmContactSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (this: any, next) {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return next();

    // El update puede venir como { $set: {...} } o con los campos al tope.
    const set = update.$set ?? update;
    const tiene = (campo: string) => Object.prototype.hasOwnProperty.call(set, campo);

    if (tiene('companies')) {
        const arr: any[] = set.companies || [];
        set.company = arr.length > 0 ? arr[0] : null;
    } else if (tiene('company')) {
        set.companies = set.company ? [set.company] : [];
    }

    if (tiene('positions')) {
        const arr: any[] = set.positions || [];
        set.position = arr.length > 0 ? arr.join(', ') : '';
    }

    this.setUpdate(update);
    next();
});

CrmContactSchema.pre('save', function (next) {
    const contact = this as ICrmContact;

    // Sync array -> single reference
    if (contact.companies && contact.companies.length > 0) {
        if (!contact.company || contact.company.toString() !== contact.companies[0].toString()) {
            contact.company = contact.companies[0];
        }
    } else if (contact.company) {
        // Sync single reference -> array
        contact.companies = [contact.company];
    } else {
        contact.companies = [];
    }

    // Sync positions array -> position string for backward compat
    if (contact.positions && contact.positions.length > 0) {
        contact.position = contact.positions.join(', ');
    } else if (contact.position && (!contact.positions || contact.positions.length === 0)) {
        // Migrate old single position to array
        contact.positions = [contact.position];
    }

    next();
});

// ── Static Methods ────────────────────────────────────────────

CrmContactSchema.statics.findByCompany = async function (
    userId: string,
    companyId: string
): Promise<ICrmContact[]> {
    return this.find({
        userId,
        $or: [{ company: companyId }, { companies: companyId }]
    })
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
