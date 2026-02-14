import { API_BASE } from '../config';

// ── Types ────────────────────────────────────────────────────

export type ContactStatus = 'visitando' | 'conectando' | 'conectado' | 'interactuando' | 'esperando_aceptacion' | 'aceptado' | 'listo_para_mensaje' | 'mensaje_enviado';

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
    acceptedAt?: string;
    readyForMessageAt?: string;
    messageSentAt?: string;
    notes: INote[];
    prospectingBatchId?: string;
    createdAt: string;
    updatedAt: string;
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
    acceptedAt?: string;
    readyForMessageAt?: string;
    messageSentAt?: string;
    headline?: string;
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
    conectado: number;
    interactuando: number;
    esperando_aceptacion: number;
    aceptado: number;
    listo_para_mensaje: number;
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
