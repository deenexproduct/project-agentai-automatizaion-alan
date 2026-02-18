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

export async function getStatus(): Promise<LinkedInStatus> {
    const res = await fetch(`${API_URL}/status`);
    return res.json();
}

export async function launchBrowser(): Promise<{ success: boolean; status: LinkedInStatus }> {
    const res = await fetch(`${API_URL}/launch`, { method: 'POST' });
    return res.json();
}

export async function startProspecting(
    urls: string[],
    sendNote: boolean,
    noteText?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch(`${API_URL}/start-prospecting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, sendNote, noteText }),
    });
    return res.json();
}

export async function pauseProspecting(): Promise<void> {
    await fetch(`${API_URL}/pause`, { method: 'POST' });
}

export async function resumeProspecting(): Promise<void> {
    await fetch(`${API_URL}/resume`, { method: 'POST' });
}

export async function stopProspecting(): Promise<{ success: boolean; message: string; deletedCount: number }> {
    const res = await fetch(`${API_URL}/stop`, { method: 'POST' });
    return res.json();
}

export async function getProgress(): Promise<ProgressData> {
    const res = await fetch(`${API_URL}/progress`);
    return res.json();
}

export function createProgressStream(
    onData: (data: ProgressData) => void,
    onError?: () => void
): EventSource {
    const es = new EventSource(`${API_URL}/progress/stream`);

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
