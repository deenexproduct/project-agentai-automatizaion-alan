/**
 * LinkedIn Posts API Service
 *
 * Client-side service for the LinkedIn Publishing Engine.
 * Manages post generation, approval, rejection, and metrics.
 */

import api from '../lib/axios';

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
    try {
        const res = await api.post(`/linkedin/posts/generate?workspaceId=${workspaceId}`, {
            idea,
            accountId,
            ...options,
        });
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || err.response?.data?.details || 'Failed to generate post');
    }
}

export async function getDrafts(workspaceId = 'default'): Promise<ScheduledPost[]> {
    try {
        const res = await api.get(`/linkedin/posts/drafts?workspaceId=${workspaceId}`);
        return res.data.drafts ?? [];
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get drafts');
    }
}

export async function getScheduledPosts(workspaceId = 'default'): Promise<ScheduledPost[]> {
    try {
        const res = await api.get(`/linkedin/posts/scheduled?workspaceId=${workspaceId}`);
        return res.data.posts ?? [];
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get scheduled posts');
    }
}

export async function getPublishedPosts(workspaceId = 'default', limit = 20): Promise<ScheduledPost[]> {
    try {
        const res = await api.get(`/linkedin/posts/published?workspaceId=${workspaceId}&limit=${limit}`);
        return res.data.posts ?? [];
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get published posts');
    }
}

export async function approvePost(id: string, scheduledAt?: string): Promise<ScheduledPost> {
    try {
        const res = await api.post(`/linkedin/posts/${id}/approve`, { scheduledAt });
        return res.data.post;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to approve post');
    }
}

export async function rejectPost(id: string, reason?: string): Promise<ScheduledPost> {
    try {
        const res = await api.post(`/linkedin/posts/${id}/reject`, { reason });
        return res.data.post;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to reject post');
    }
}

export async function regeneratePost(id: string, feedback: string): Promise<{ post: ScheduledPost; draft: PostDraft; validation: ValidationResult }> {
    try {
        const res = await api.post(`/linkedin/posts/${id}/regenerate`, { feedback });
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || err.response?.data?.details || 'Failed to regenerate post');
    }
}

export async function editPost(id: string, updates: { content?: string; hashtags?: string[]; scheduledAt?: string }): Promise<ScheduledPost> {
    try {
        const res = await api.put(`/linkedin/posts/${id}`, updates);
        return res.data.post;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to edit post');
    }
}

export async function deletePost(id: string): Promise<void> {
    try {
        await api.delete(`/linkedin/posts/${id}`);
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to delete post');
    }
}

// ── Config API ────────────────────────────────────────────────

export async function getPilares(workspaceId = 'default'): Promise<ContentPilar[]> {
    try {
        const res = await api.get(`/linkedin/publishing/pilares?workspaceId=${workspaceId}`);
        return res.data.pilares ?? [];
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get pilares');
    }
}

export async function getAIHealth(): Promise<AIHealthStatus> {
    try {
        const res = await api.get(`/linkedin/publishing/ai/health`);
        return res.data;
    } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to get AI health');
    }
}
