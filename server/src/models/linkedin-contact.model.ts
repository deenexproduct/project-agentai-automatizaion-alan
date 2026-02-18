import mongoose, { Schema, Document, Model, FilterQuery, QueryOptions } from 'mongoose';

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
    /**
     * @deprecated Use `status` instead. Maintained for backward compatibility.
     */
    pipelineStatus?: ContactStatus;

    // Multi-tenant support (optional, for future use)
    userId?: mongoose.Types.ObjectId;

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

// ── Query Options Interface ───────────────────────────────────

export interface IContactQueryOptions extends QueryOptions {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    populate?: string | string[];
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
    profileUrl: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        index: true, // Single index for exact lookups
    },
    fullName: { 
        type: String, 
        required: true,
        trim: true,
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    headline: { type: String, trim: true },

    // Professional
    currentCompany: { 
        type: String, 
        trim: true,
        index: true, // Index for company-based queries
    },
    currentPosition: { type: String, trim: true },
    companyLogoUrl: { type: String },
    industry: { type: String, trim: true },
    location: { type: String, trim: true },

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
        index: true, // Single index for status filtering
    },
    // Alias for backward compatibility and future multi-status support
    pipelineStatus: {
        type: String,
        enum: ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'],
        default: null,
    },

    // Multi-tenant support (optional)
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
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
    prospectingBatchId: { type: String, index: true },

    // Enrichment
    enrichmentData: { type: Schema.Types.Mixed, default: null },
    enrichmentStatus: { 
        type: String, 
        enum: ['pending', 'enriching', 'completed', 'failed'], 
        default: null,
        index: true,
    },
    contextFilePath: { type: String },
}, {
    timestamps: true, // adds createdAt + updatedAt automatically
});

// ── Optimized Indexes for High-Volume Performance ─────────────

/**
 * INDEX STRATEGY DOCUMENTATION
 * ============================
 * 
 * 1. COMPOUND INDEX: pipelineStatus + createdAt
 *    - Supports: Filtering by status sorted by creation date
 *    - Use case: Kanban boards, recent contacts by status
 *    - Note: Uses `status` field (pipelineStatus is alias)
 */
LinkedInContactSchema.index({ status: 1, createdAt: -1 });

/**
 * 2. COMPOUND INDEX: userId + pipelineStatus
 *    - Supports: Multi-tenant queries by user and status
 *    - Use case: User-scoped contact lists
 *    - Note: Partial index for documents with userId
 */
LinkedInContactSchema.index(
    { userId: 1, status: 1 },
    { partialFilterExpression: { userId: { $exists: true } } }
);

/**
 * 3. INDEX: company
 *    - Supports: Filtering by current company
 *    - Use case: Company-based contact segmentation
 *    - Note: Defined in schema definition above
 */
// currentCompany: { type: String, index: true } // Already defined in schema

/**
 * 4. TEXT INDEX: fullName
 *    - Supports: Full-text search on contact names
 *    - Use case: Search autocomplete, name matching
 *    - Note: Weights prioritize fullName over other fields
 */
LinkedInContactSchema.index(
    { fullName: 'text' },
    { 
        name: 'text_search_fullname',
        default_language: 'spanish',
        weights: { fullName: 10 }
    }
);

/**
 * 5. LEGACY TEXT INDEX (compound)
 *    - Supports: Full-text search across multiple fields
 *    - Use case: Global search in contact list
 */
LinkedInContactSchema.index(
    { fullName: 'text', headline: 'text', currentCompany: 'text' },
    { 
        name: 'text_search_compound',
        weights: { fullName: 10, currentCompany: 5, headline: 3 },
        default_language: 'spanish',
    }
);

/**
 * 6. STATUS + UPDATED AT
 *    - Supports: Kanban columns with recent activity sorting
 *    - Use case: Main dashboard view
 */
LinkedInContactSchema.index({ status: 1, updatedAt: -1 });

/**
 * 7. PIPELINE DATE INDEXES
 *    - Supports: Sorting by various pipeline events
 *    - Use case: Timeline views, recent activity reports
 */
LinkedInContactSchema.index({ sentAt: -1 });
LinkedInContactSchema.index({ acceptedAt: -1 });
LinkedInContactSchema.index({ enrichedAt: -1 });

/**
 * 8. ENRICHMENT STATUS + CREATED AT
 *    - Supports: Enrichment queue processing
 *    - Use case: Batch enrichment jobs
 */
LinkedInContactSchema.index({ enrichmentStatus: 1, createdAt: 1 });

// ── Static Methods ────────────────────────────────────────────

export interface ILinkedInContactModel extends Model<ILinkedInContact> {
    /**
     * Find contacts by pipeline status with pagination
     * @param status - Pipeline status to filter by
     * @param options - Query options (limit, skip, sort, populate)
     * @returns Promise with contacts and count
     */
    findByPipelineStatus(
        status: ContactStatus,
        options?: IContactQueryOptions
    ): Promise<{ contacts: any[]; total: number }>;

    /**
     * Find enriched contacts with populated enrichment data
     * @param options - Query options (limit, skip, sort)
     * @returns Promise with enriched contacts
     */
    findEnriched(
        options?: IContactQueryOptions
    ): Promise<any[]>;

    /**
     * Find contacts pending enrichment (queued for processing)
     * @param limit - Maximum number of contacts to return (default: 100)
     * @returns Promise with contacts pending enrichment
     */
    findPendingEnrichment(
        limit?: number
    ): Promise<any[]>;
}

// Static method: Find by pipeline status
LinkedInContactSchema.statics.findByPipelineStatus = async function(
    this: ILinkedInContactModel,
    status: ContactStatus,
    options: IContactQueryOptions = {}
): Promise<{ contacts: any[]; total: number }> {
    const { limit = 50, skip = 0, sort = { createdAt: -1 }, populate } = options;
    
    const filter: FilterQuery<ILinkedInContact> = { 
        $or: [{ status }, { pipelineStatus: status }] 
    };
    
    const [contacts, total] = await Promise.all([
        this.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate(populate || [])
            .lean()
            .exec(),
        this.countDocuments(filter).exec()
    ]);
    
    return { contacts, total };
};

// Static method: Find enriched contacts
LinkedInContactSchema.statics.findEnriched = async function(
    this: ILinkedInContactModel,
    options: IContactQueryOptions = {}
): Promise<any[]> {
    const { limit = 50, skip = 0, sort = { enrichedAt: -1 } } = options;
    
    return this.find({
        enrichmentStatus: 'completed',
        enrichmentData: { $exists: true, $ne: null }
    })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
};

// Static method: Find pending enrichment
LinkedInContactSchema.statics.findPendingEnrichment = async function(
    this: ILinkedInContactModel,
    limit: number = 100
): Promise<any[]> {
    return this.find({
        $and: [
            {
                $or: [
                    { enrichmentStatus: 'pending' },
                    { enrichmentStatus: { $exists: false } }
                ]
            },
            // Exclude recently processed to prevent race conditions
            {
                $or: [
                    { updatedAt: { $lt: new Date(Date.now() - 60000) } }, // 1 minute buffer
                    { updatedAt: { $exists: false } }
                ]
            }
        ]
    })
        .sort({ createdAt: 1 }) // FIFO order
        .limit(limit)
        .select('-enrichmentData') // Exclude large data field for performance
        .lean()
        .exec();
};

// ── Instance Methods ─────────────────────────────────────────

/**
 * Check if contact is fully enriched
 */
LinkedInContactSchema.methods.isEnriched = function(this: ILinkedInContact): boolean {
    return this.enrichmentStatus === 'completed' && !!this.enrichmentData;
};

/**
 * Get display name with position
 */
LinkedInContactSchema.methods.getDisplayName = function(this: ILinkedInContact): string {
    if (this.currentPosition && this.currentCompany) {
        return `${this.fullName} - ${this.currentPosition} at ${this.currentCompany}`;
    }
    return this.fullName;
};

// ── Pre-save Middleware ──────────────────────────────────────

// Sync pipelineStatus with status for backward compatibility
LinkedInContactSchema.pre('save', function(next) {
    if (this.isModified('status') && !this.pipelineStatus) {
        this.pipelineStatus = this.status;
    }
    next();
});

// ── Export ───────────────────────────────────────────────────

export const LinkedInContact = mongoose.model<ILinkedInContact, ILinkedInContactModel>(
    'LinkedInContact', 
    LinkedInContactSchema
);
