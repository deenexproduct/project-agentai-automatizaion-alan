/**
 * LinkedIn Accounts API Service
 *
 * Client-side service for managing LinkedIn accounts, circuit breaker status,
 * and audit logs through the REST API.
 */

import { API_BASE } from '../config';

const API_URL = `${API_BASE}/api/linkedin/accounts`;

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
    const res = await fetch(`${API_URL}?workspaceId=${workspaceId}`);
    const data = await res.json();
    return data.accounts ?? [];
}

export async function getActiveAccount(workspaceId = 'default'): Promise<LinkedInAccount | null> {
    const res = await fetch(`${API_URL}/active?workspaceId=${workspaceId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.account ?? null;
}

export async function createAccount(label: string, workspaceId = 'default'): Promise<LinkedInAccount> {
    const res = await fetch(`${API_URL}?workspaceId=${workspaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create account');
    return data.account;
}

export async function setActiveAccount(id: string, workspaceId = 'default'): Promise<void> {
    const res = await fetch(`${API_URL}/${id}/set-active?workspaceId=${workspaceId}`, {
        method: 'POST',
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to set active account');
    }
}

export async function disableAccount(id: string, workspaceId = 'default'): Promise<void> {
    const res = await fetch(`${API_URL}/${id}?workspaceId=${workspaceId}`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to disable account');
    }
}

export async function getCircuitStatus(id: string): Promise<CircuitStatus> {
    const res = await fetch(`${API_URL}/${id}/circuit`);
    const data = await res.json();
    return data;
}

export async function resetCircuit(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/${id}/circuit/reset`, { method: 'POST' });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset circuit');
    }
}

export async function getAuditLog(id: string, workspaceId = 'default', limit = 20): Promise<AuditEvent[]> {
    const res = await fetch(`${API_URL}/${id}/audit?workspaceId=${workspaceId}&limit=${limit}`);
    const data = await res.json();
    return data.events ?? [];
}
