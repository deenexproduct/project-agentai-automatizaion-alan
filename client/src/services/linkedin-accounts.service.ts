/**
 * LinkedIn Accounts API Service
 *
 * Client-side service for managing LinkedIn accounts, circuit breaker status,
 * and audit logs through the REST API.
 */

import api from '../lib/axios';

// ── Types ──────────────────────────────────────────────────────

export interface LinkedInAccount {
    _id: string;
    workspaceId: string;
    label: string;
    status: 'active' | 'disabled' | 'reauth_required';
    cookieCount: number;
    cookiesSavedAt?: string;
    expiresAt?: string;
    lastUsedAt?: string;
    lastVerifiedAt?: string;
    lastAuthAt?: string;
    createdAt: string;
}

export interface CircuitStatus {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutiveFailures: number;
    openedAt: string | null;
    lastFailureReason: string | null;
    cooldownRemainingMs: number | null;
}

export interface AuditEvent {
    _id: string;
    accountId: string;
    eventType: string;
    details: Record<string, any>;
    createdAt: string;
}

// ── API Functions ──────────────────────────────────────────────

export async function getAccounts(workspaceId = 'default'): Promise<LinkedInAccount[]> {
    const res = await api.get(`/linkedin/accounts?workspaceId=${workspaceId}`);
    return res.data.accounts ?? [];
}

export async function getActiveAccount(workspaceId = 'default'): Promise<LinkedInAccount | null> {
    try {
        const res = await api.get(`/linkedin/accounts/active?workspaceId=${workspaceId}`);
        return res.data.account ?? null;
    } catch (err: any) {
        if (err.response?.status === 401 || err.response?.status === 404) {
            return null;
        }
        throw err;
    }
}

export async function createAccount(label: string, workspaceId = 'default'): Promise<LinkedInAccount> {
    try {
        const res = await api.post(`/linkedin/accounts?workspaceId=${workspaceId}`, { label });
        return res.data.account;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to create account');
    }
}

export async function setActiveAccount(id: string, workspaceId = 'default'): Promise<void> {
    try {
        await api.post(`/linkedin/accounts/${id}/set-active?workspaceId=${workspaceId}`);
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to set active account');
    }
}

export async function disableAccount(id: string, workspaceId = 'default'): Promise<void> {
    try {
        await api.delete(`/linkedin/accounts/${id}?workspaceId=${workspaceId}`);
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to disable account');
    }
}

export async function getCircuitStatus(id: string): Promise<CircuitStatus> {
    try {
        const res = await api.get(`/linkedin/accounts/${id}/circuit`);
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get circuit status');
    }
}

export async function resetCircuit(id: string): Promise<void> {
    try {
        await api.post(`/linkedin/accounts/${id}/circuit/reset`);
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to reset circuit');
    }
}

export async function getAuditLog(id: string, workspaceId = 'default', limit = 20): Promise<AuditEvent[]> {
    try {
        const res = await api.get(`/linkedin/accounts/${id}/audit?workspaceId=${workspaceId}&limit=${limit}`);
        return res.data.events ?? [];
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get audit log');
    }
}
