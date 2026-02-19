/**
 * LinkedIn Posts API Service
 *
 * Client-side service for the LinkedIn Publishing Engine.
 * Manages post generation, approval, rejection, and metrics.
 */

import { API_BASE } from '../config';

const POSTS_URL = `${API_BASE}/api/linkedin/posts`;
const CONFIG_URL = `${API_BASE}/api/linkedin/publishing`;

// ── Types ──────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'rejected';

export interface AIMetadata {
    originalIdea: string;
    context?: string;
    pilar: string;
    formato: string;
    hookType: string;
    trendSignals: string[];
    predictedEngagement: 'bajo' | 'medio' | 'alto';
    model: string;
    promptUsed: string;
    generationTimeMs: number;
    imagePrompt?: string;
}

export interface EngagementMetrics {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    engagementRate: number;
    scrapedAt?: string;
}

export interface ScheduledPost {
    _id: string;
    accountId: string;
    workspaceId: string;
    content: string;
    hashtags: string[];
    mediaUrls: string[];
    scheduledAt: string;
    publishedAt?: string;
    linkedinPostUrl?: string;
    status: PostStatus;
    rejectionReason?: string;
    retryCount: number;
    aiMetadata: AIMetadata;
    engagement: EngagementMetrics;
    createdAt: string;
    updatedAt: string;
}

export interface PostDraft {
    texto: string;
    hashtags: string[];
    formato_sugerido: string;
    hook_type: string;
    prompt_imagen: string;
    carousel_slides: string[];
    pregunta_engagement: string;
    prediccion_engagement: 'bajo' | 'medio' | 'alto';
    razon_prediccion: string;
}

export interface ValidationIssue {
    type: 'critical' | 'warning';
    rule: string;
    detail: string;
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}

export interface ContentPilar {
    _id: string;
    nombre: string;
    descripcion: string;
    keywords: string[];
    frecuenciaSemanal: number;
    formatoPreferido: string;
    activo: boolean;
    performanceScore: number;
    totalPosts: number;
}

export interface AIHealthStatus {
    ollama: { healthy: boolean; models: string[]; error?: string };
    imageGenerator: { available: boolean };
    overall: 'ok' | 'degraded';
}

// ── Posts API ──────────────────────────────────────────────────

export async function generatePost(
    idea: string,
    accountId: string,
    options?: { context?: string; pilar?: string; formato?: string; includeTrends?: boolean },
    workspaceId = 'default'
): Promise<{ post: ScheduledPost; draft: PostDraft; validation: ValidationResult }> {
    const res = await fetch(`${POSTS_URL}/generate?workspaceId=${workspaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idea,
            accountId,
            ...options,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details || 'Failed to generate post');
    return data;
}

export async function getDrafts(workspaceId = 'default'): Promise<ScheduledPost[]> {
    const res = await fetch(`${POSTS_URL}/drafts?workspaceId=${workspaceId}`);
    const data = await res.json();
    return data.drafts ?? [];
}

export async function getScheduledPosts(workspaceId = 'default'): Promise<ScheduledPost[]> {
    const res = await fetch(`${POSTS_URL}/scheduled?workspaceId=${workspaceId}`);
    const data = await res.json();
    return data.posts ?? [];
}

export async function getPublishedPosts(workspaceId = 'default', limit = 20): Promise<ScheduledPost[]> {
    const res = await fetch(`${POSTS_URL}/published?workspaceId=${workspaceId}&limit=${limit}`);
    const data = await res.json();
    return data.posts ?? [];
}

export async function approvePost(id: string, scheduledAt?: string): Promise<ScheduledPost> {
    const res = await fetch(`${POSTS_URL}/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to approve post');
    return data.post;
}

export async function rejectPost(id: string, reason?: string): Promise<ScheduledPost> {
    const res = await fetch(`${POSTS_URL}/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reject post');
    return data.post;
}

export async function regeneratePost(id: string, feedback: string): Promise<{ post: ScheduledPost; draft: PostDraft; validation: ValidationResult }> {
    const res = await fetch(`${POSTS_URL}/${id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details || 'Failed to regenerate post');
    return data;
}

export async function editPost(id: string, updates: { content?: string; hashtags?: string[]; scheduledAt?: string }): Promise<ScheduledPost> {
    const res = await fetch(`${POSTS_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to edit post');
    return data.post;
}

export async function deletePost(id: string): Promise<void> {
    const res = await fetch(`${POSTS_URL}/${id}`, { method: 'DELETE' });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete post');
    }
}

// ── Config API ────────────────────────────────────────────────

export async function getPilares(workspaceId = 'default'): Promise<ContentPilar[]> {
    const res = await fetch(`${CONFIG_URL}/pilares?workspaceId=${workspaceId}`);
    const data = await res.json();
    return data.pilares ?? [];
}

export async function getAIHealth(): Promise<AIHealthStatus> {
    const res = await fetch(`${CONFIG_URL}/ai/health`);
    const data = await res.json();
    return data;
}
