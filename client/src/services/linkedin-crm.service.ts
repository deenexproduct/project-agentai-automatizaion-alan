import api from '../lib/axios';

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

    try {
        const res = await api.get(`/linkedin/crm/contacts?${params}`);
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch contacts');
    }
}

export async function getCounts(): Promise<StatusCounts> {
    try {
        const res = await api.get('/linkedin/crm/contacts/counts');
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch counts');
    }
}

export async function getContact(id: string): Promise<LinkedInContact> {
    try {
        const res = await api.get(`/linkedin/crm/contacts/${id}`);
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch contact');
    }
}

export async function updateContactStatus(id: string, status: ContactStatus): Promise<void> {
    try {
        await api.patch(`/linkedin/crm/contacts/${id}/status`, { status });
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to update status');
    }
}

export async function addNote(id: string, text: string): Promise<INote[]> {
    try {
        const res = await api.post(`/linkedin/crm/contacts/${id}/notes`, { text });
        return res.data.notes;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to add note');
    }
}

export async function checkAccepted(): Promise<{ found: number; updated: number }> {
    try {
        const res = await api.post('/linkedin/crm/check-accepted');
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Check failed');
    }
}

export async function getLastCheckStatus(): Promise<{ lastCheck: string | null }> {
    try {
        const res = await api.get('/linkedin/crm/check-accepted/status');
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch check status');
    }
}

// ── Enrichment Functions ─────────────────────────────────────

export async function enrichContact(id: string): Promise<any> {
    try {
        const res = await api.post(`/linkedin/crm/contacts/${id}/enrich`);
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Enrichment failed');
    }
}

export async function getEnrichmentConfig(): Promise<any> {
    try {
        const res = await api.get('/linkedin/crm/enrichment/config');
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch config');
    }
}

export async function updateEnrichmentConfig(config: any): Promise<void> {
    try {
        await api.patch('/linkedin/crm/enrichment/config', config);
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to update config');
    }
}

// ── Bulk Operations ──────────────────────────────────────────

export interface BulkEnrichResult {
    success: boolean;
    summary: { total: number; succeeded: number; failed: number };
    results: { id: string; status: string; error?: string }[];
}

export async function bulkEnrichContacts(ids: string[]): Promise<BulkEnrichResult> {
    try {
        const res = await api.post('/linkedin/crm/contacts/bulk/enrich', { ids });
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to bulk enrich');
    }
}

export async function bulkUpdateStatus(ids: string[], status: ContactStatus): Promise<{ success: boolean; modified: number }> {
    try {
        const res = await api.post('/linkedin/crm/contacts/bulk/status', { ids, status });
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to bulk update status');
    }
}

export function exportContactsUrl(status?: ContactStatus, search?: string): string {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    return `/api/linkedin/crm/contacts/export?${params}`;
}

// ── Stats ────────────────────────────────────────────────────

export interface ContactStats {
    total: number;
    byStatus: Record<string, number>;
    byEnrichmentStatus: Record<string, number>;
    recentLast7Days: number;
}

export async function getContactStats(): Promise<ContactStats> {
    try {
        const res = await api.get('/linkedin/crm/contacts/stats');
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch stats');
    }
}
