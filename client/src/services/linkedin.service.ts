import { API_BASE } from '../config';

const API_URL = `${API_BASE}/api/linkedin`;

export interface LinkedInStatus {
    status: 'disconnected' | 'browser-open' | 'logged-in';
    isRunning: boolean;
    isPaused: boolean;
    profilesTotal: number;
    profilesDone: number;
}

export interface ProfileSteps {
    visit: 'pending' | 'done' | 'error';
    connect: 'pending' | 'done' | 'skipped' | 'error';
    like: 'pending' | 'done' | 'skipped' | 'error';
}

export interface ProfileProgress {
    index: number;
    url: string;
    name?: string;
    status: 'pending' | 'visiting' | 'connected' | 'liked' | 'done' | 'error' | 'paused';
    steps: ProfileSteps;
    error?: string;
    startedAt?: string;
    completedAt?: string;
}

export interface ProgressData {
    profiles: ProfileProgress[];
    current: number;
    total: number;
    status: string;
    type?: string;
    message?: string;
}

import api from '../lib/axios';

export async function getStatus(): Promise<LinkedInStatus> {
    const res = await api.get('/linkedin/status');
    return res.data;
}

export async function launchBrowser(): Promise<{ success: boolean; status: LinkedInStatus }> {
    const res = await api.post('/linkedin/launch');
    return res.data;
}

export async function startProspecting(
    urls: string[],
    sendNote: boolean,
    noteText?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await api.post('/linkedin/start-prospecting', { urls, sendNote, noteText });
    return res.data;
}

export async function pauseProspecting(): Promise<void> {
    await api.post('/linkedin/pause');
}

export async function resumeProspecting(): Promise<void> {
    await api.post('/linkedin/resume');
}

export async function stopProspecting(): Promise<{ success: boolean; message: string; deletedCount: number }> {
    const res = await api.post('/linkedin/stop');
    return res.data;
}

export async function getProgress(): Promise<ProgressData> {
    const res = await api.get('/linkedin/progress');
    return res.data;
}

export function createProgressStream(
    onData: (data: ProgressData) => void,
    onError?: () => void
): EventSource {
    const token = localStorage.getItem('token');
    const es = new EventSource(`${API_URL}/progress/stream?token=${token || ''}`);

    es.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            onData(data);
        } catch {
            // Ignore parse errors
        }
    };

    es.onerror = () => {
        if (onError) onError();
    };

    return es;
}
