import { API_BASE } from '../config';

// ── Types ────────────────────────────────────────────────────

export type ContactStatus = 'visitando' | 'conectando' | 'interactuando' | 'enriqueciendo' | 'esperando_aceptacion' | 'aceptado' | 'mensaje_enviado';

export type EnrichmentStatus = 'pending' | 'enriching' | 'completed' | 'failed';

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
    _id?: string;
    text: string;
    createdAt: string;
}

export interface LinkedInContact {
    _id: string;
    profileUrl: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    currentCompany?: string;
    currentPosition?: string;
    companyLogoUrl?: string;
    industry?: string;
    location?: string;
    profilePhotoUrl?: string;
    bannerUrl?: string;
    about?: string;
    connectionsCount?: string;
    followersCount?: string;
    connectionDegree?: string;
    experience: IExperience[];
    education: IEducation[];
    skills: string[];
    status: ContactStatus;
    sentAt: string;
    interactedAt?: string;
    enrichedAt?: string;
    acceptedAt?: string;
    messageSentAt?: string;
    notes: INote[];
    prospectingBatchId?: string;
    createdAt: string;
    updatedAt: string;
    enrichmentData?: any;
    enrichmentStatus?: EnrichmentStatus;
    contextFilePath?: string;
}

export interface ContactCardData {
    _id: string;
    fullName: string;
    currentPosition?: string;
    currentCompany?: string;
    location?: string;
    profilePhotoUrl?: string;
    profileUrl: string;
    status: ContactStatus;
    sentAt: string;
    interactedAt?: string;
    enrichedAt?: string;
    acceptedAt?: string;
    messageSentAt?: string;
    headline?: string;
    enrichmentStatus?: EnrichmentStatus;
}

export interface PaginatedContacts {
    contacts: ContactCardData[];
    total: number;
    page: number;
    pages: number;
}

export interface StatusCounts {
    visitando: number;
    conectando: number;
    interactuando: number;
    enriqueciendo: number;
    esperando_aceptacion: number;
    aceptado: number;
    mensaje_enviado: number;
}

// ── API Functions ────────────────────────────────────────────

const CRM_BASE = `${API_BASE}/api/linkedin/crm`;

export async function getContacts(
    status?: ContactStatus,
    search?: string,
    page: number = 1,
    limit: number = 50,
): Promise<PaginatedContacts> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(limit));

    const res = await fetch(`${CRM_BASE}/contacts?${params}`);
    if (!res.ok) throw new Error('Failed to fetch contacts');
    return res.json();
}

export async function getCounts(): Promise<StatusCounts> {
    const res = await fetch(`${CRM_BASE}/contacts/counts`);
    if (!res.ok) throw new Error('Failed to fetch counts');
    return res.json();
}

export async function getContact(id: string): Promise<LinkedInContact> {
    const res = await fetch(`${CRM_BASE}/contacts/${id}`);
    if (!res.ok) throw new Error('Failed to fetch contact');
    return res.json();
}

export async function updateContactStatus(id: string, status: ContactStatus): Promise<void> {
    const res = await fetch(`${CRM_BASE}/contacts/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update status');
}

export async function addNote(id: string, text: string): Promise<INote[]> {
    const res = await fetch(`${CRM_BASE}/contacts/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Failed to add note');
    const data = await res.json();
    return data.notes;
}

export async function checkAccepted(): Promise<{ found: number; updated: number }> {
    const res = await fetch(`${CRM_BASE}/check-accepted`, { method: 'POST' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Check failed' }));
        throw new Error(err.error || 'Check failed');
    }
    return res.json();
}

export async function getLastCheckStatus(): Promise<{ lastCheck: string | null }> {
    const res = await fetch(`${CRM_BASE}/check-accepted/status`);
    if (!res.ok) throw new Error('Failed to fetch check status');
    return res.json();
}

// ── Enrichment Functions ─────────────────────────────────────

export async function enrichContact(id: string): Promise<any> {
    const res = await fetch(`${CRM_BASE}/contacts/${id}/enrich`, { method: 'POST' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Enrichment failed' }));
        throw new Error(err.error || 'Enrichment failed');
    }
    return res.json();
}

export async function getEnrichmentConfig(): Promise<any> {
    const res = await fetch(`${CRM_BASE}/enrichment/config`);
    if (!res.ok) throw new Error('Failed to fetch config');
    return res.json();
}

export async function updateEnrichmentConfig(config: any): Promise<void> {
    const res = await fetch(`${CRM_BASE}/enrichment/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to update config');
}

// ── Bulk Operations ──────────────────────────────────────────

export interface BulkEnrichResult {
    success: boolean;
    summary: { total: number; succeeded: number; failed: number };
    results: { id: string; status: string; error?: string }[];
}

export async function bulkEnrichContacts(ids: string[]): Promise<BulkEnrichResult> {
    const res = await fetch(`${CRM_BASE}/contacts/bulk/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error('Failed to bulk enrich');
    return res.json();
}

export async function bulkUpdateStatus(ids: string[], status: ContactStatus): Promise<{ success: boolean; modified: number }> {
    const res = await fetch(`${CRM_BASE}/contacts/bulk/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) throw new Error('Failed to bulk update status');
    return res.json();
}

export function exportContactsUrl(status?: ContactStatus, search?: string): string {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    return `${CRM_BASE}/contacts/export?${params}`;
}

// ── Stats ────────────────────────────────────────────────────

export interface ContactStats {
    total: number;
    byStatus: Record<string, number>;
    byEnrichmentStatus: Record<string, number>;
    recentLast7Days: number;
}

export async function getContactStats(): Promise<ContactStats> {
    const res = await fetch(`${CRM_BASE}/contacts/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
}
