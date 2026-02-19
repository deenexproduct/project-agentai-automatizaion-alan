/**
 * LinkedInAuditLog Model
 *
 * Immutable append-only log of all LinkedIn account events.
 * Used for debugging, compliance, and detecting anomalies.
 *
 * SECURITY: metadata must NEVER contain tokens, cookies, or passwords.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────

export type AuditEventType =
    | 'auth_success'          // User completed manual login
    | 'auth_failed'           // Login attempt failed
    | 'session_restored'      // Cookies loaded from DB on startup
    | 'session_verified'      // DOM check passed — session is valid
    | 'session_expired'       // DOM check failed — session is invalid
    | 'session_expiring_soon' // Session will expire within 24h
    | 'reauth_required'       // System triggered re-auth
    | 'account_switch'        // Active account changed
    | 'account_created'       // New account registered
    | 'account_disabled'      // Account disabled
    | 'cookies_saved'         // Cookies encrypted and saved to DB
    | 'cookies_loaded'        // Cookies decrypted and injected into browser
    | 'circuit_opened'        // Circuit breaker opened (too many failures)
    | 'circuit_closed'        // Circuit breaker closed (recovered)
    | 'key_rotated'           // Encryption key rotation completed
    | 'operation_started'     // Prospecting/CRM operation started
    | 'operation_completed'   // Prospecting/CRM operation completed
    | 'operation_failed';     // Prospecting/CRM operation failed

export interface ILinkedInAuditLog extends Document {
    workspaceId: string;
    accountId: Types.ObjectId | null; // null for workspace-level events
    eventType: AuditEventType;
    /** Non-sensitive metadata. NEVER include tokens, cookies, or passwords. */
    metadata: Record<string, unknown>;
    createdAt: Date;
}

export interface ILinkedInAuditLogModel extends Model<ILinkedInAuditLog> {
    /**
     * Append an audit event. Never throws — logs to console on DB failure.
     */
    append(
        workspaceId: string,
        accountId: Types.ObjectId | null,
        eventType: AuditEventType,
        metadata?: Record<string, unknown>
    ): Promise<void>;

    /**
     * Get recent events for an account.
     */
    getRecent(
        workspaceId: string,
        accountId?: Types.ObjectId,
        limit?: number
    ): Promise<ILinkedInAuditLog[]>;
}

// ── Schema ────────────────────────────────────────────────────

const LinkedInAuditLogSchema = new Schema<ILinkedInAuditLog>(
    {
        workspaceId: {
            type: String,
            required: true,
            index: true,
        },
        accountId: {
            type: Schema.Types.ObjectId,
            ref: 'LinkedInAccount',
            default: null,
            index: true,
        },
        eventType: {
            type: String,
            required: true,
            enum: [
                'auth_success', 'auth_failed',
                'session_restored', 'session_verified', 'session_expired', 'session_expiring_soon',
                'reauth_required',
                'account_switch', 'account_created', 'account_disabled',
                'cookies_saved', 'cookies_loaded',
                'circuit_opened', 'circuit_closed',
                'key_rotated',
                'operation_started', 'operation_completed', 'operation_failed',
            ],
            index: true,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // append-only, no updatedAt
        collection: 'linkedin_audit_logs',
    }
);

// ── Indexes ───────────────────────────────────────────────────

// Most common query: recent events for a workspace
LinkedInAuditLogSchema.index({ workspaceId: 1, createdAt: -1 });

// Events for a specific account
LinkedInAuditLogSchema.index({ accountId: 1, createdAt: -1 });

// Event type filtering
LinkedInAuditLogSchema.index({ eventType: 1, createdAt: -1 });

// ── Static Methods ────────────────────────────────────────────

LinkedInAuditLogSchema.statics.append = async function (
    workspaceId: string,
    accountId: Types.ObjectId | null,
    eventType: AuditEventType,
    metadata: Record<string, unknown> = {}
): Promise<void> {
    try {
        await this.create({ workspaceId, accountId, eventType, metadata });
    } catch (err) {
        // Audit log failures must never crash the main flow
        console.error(`[AuditLog] ⚠️ Failed to write audit event '${eventType}':`, err);
    }
};

LinkedInAuditLogSchema.statics.getRecent = async function (
    workspaceId: string,
    accountId?: Types.ObjectId,
    limit = 50
): Promise<ILinkedInAuditLog[]> {
    const filter: Record<string, unknown> = { workspaceId };
    if (accountId) filter.accountId = accountId;

    return this.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();
};

// ── Export ────────────────────────────────────────────────────

export const LinkedInAuditLog = mongoose.model<ILinkedInAuditLog, ILinkedInAuditLogModel>(
    'LinkedInAuditLog',
    LinkedInAuditLogSchema
);
