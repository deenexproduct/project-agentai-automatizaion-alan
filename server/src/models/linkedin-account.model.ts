/**
 * LinkedInAccount Model
 *
 * Stores encrypted LinkedIn session cookies and account metadata.
 * One document per LinkedIn account per workspace.
 *
 * SECURITY: cookiesEncrypted, cookiesIv, cookiesAuthTag are AES-256-GCM
 * encrypted blobs. They must NEVER be logged or returned to the client.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────

export type AccountStatus = 'active' | 'disabled' | 'reauth_required';

export interface ILinkedInAccount extends Document {
    /** Tenant/user identifier. Use 'default' for single-user setups. */
    workspaceId: string;

    /** Human-readable label, e.g. "Alan - Main Account" */
    label: string;

    /** Current session status */
    status: AccountStatus;

    // ── Encrypted cookie storage (AES-256-GCM) ──────────────
    /** Base64-encoded ciphertext of JSON.stringify(cookies[]) */
    cookiesEncrypted: string | null;
    /** Base64-encoded random IV used for this encryption */
    cookiesIv: string | null;
    /** Base64-encoded GCM auth tag */
    cookiesAuthTag: string | null;

    // ── Session metadata (non-sensitive) ────────────────────
    /** Number of cookies saved (for diagnostics, not the cookies themselves) */
    cookieCount: number;
    /** When cookies were last saved */
    cookiesSavedAt: Date | null;
    /**
     * Earliest expiry of critical cookies (li_at).
     * Used to warn user before session expires.
     * null = unknown or no expiry set.
     */
    expiresAt: Date | null;

    // ── Audit timestamps ────────────────────────────────────
    /** When the user last completed a successful manual login */
    lastAuthAt: Date | null;
    /** When this account was last used for an operation */
    lastUsedAt: Date | null;
    /** When the session was last verified as valid (DOM check) */
    lastVerifiedAt: Date | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface ILinkedInAccountModel extends Model<ILinkedInAccount> {
    /**
     * Find the active account for a workspace.
     * Returns null if no active account exists.
     */
    findActive(workspaceId: string): Promise<ILinkedInAccount | null>;
}

// ── Schema ────────────────────────────────────────────────────

const LinkedInAccountSchema = new Schema<ILinkedInAccount>(
    {
        workspaceId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        label: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['active', 'disabled', 'reauth_required'],
            default: 'reauth_required',
            index: true,
        },

        // Encrypted cookie storage
        cookiesEncrypted: { type: String, default: null, select: false }, // excluded from default queries
        cookiesIv: { type: String, default: null, select: false },
        cookiesAuthTag: { type: String, default: null, select: false },

        // Session metadata
        cookieCount: { type: Number, default: 0 },
        cookiesSavedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null, index: true },

        // Audit timestamps
        lastAuthAt: { type: Date, default: null },
        lastUsedAt: { type: Date, default: null },
        lastVerifiedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'linkedin_accounts',
    }
);

// ── Indexes ───────────────────────────────────────────────────

// Enforce unique label per workspace
LinkedInAccountSchema.index({ workspaceId: 1, label: 1 }, { unique: true });

// Fast lookup: active accounts per workspace
LinkedInAccountSchema.index({ workspaceId: 1, status: 1 });

// Expiry monitoring (for pre-expiry warnings)
LinkedInAccountSchema.index({ expiresAt: 1 }, { sparse: true });

// Most recently used accounts
LinkedInAccountSchema.index({ workspaceId: 1, lastUsedAt: -1 });

// ── Static Methods ────────────────────────────────────────────

LinkedInAccountSchema.statics.findActive = async function (
    workspaceId: string
): Promise<ILinkedInAccount | null> {
    return this.findOne({ workspaceId, status: 'active' })
        .sort({ lastUsedAt: -1 })
        .exec();
};

// ── Security: Never serialize encrypted fields ────────────────

LinkedInAccountSchema.methods.toJSON = function () {
    const obj = this.toObject();
    // Strip encrypted fields from any JSON serialization
    delete obj.cookiesEncrypted;
    delete obj.cookiesIv;
    delete obj.cookiesAuthTag;
    return obj;
};

// ── Export ────────────────────────────────────────────────────

export const LinkedInAccount = mongoose.model<ILinkedInAccount, ILinkedInAccountModel>(
    'LinkedInAccount',
    LinkedInAccountSchema
);
