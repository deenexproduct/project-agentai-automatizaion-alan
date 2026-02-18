/**
 * State Persistence Service
 * Guarda y recupera el estado de prospecting para continuidad ante fallos
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProfileProgress {
    url: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
    attempts: number;
    lastError?: string;
    result?: {
        success: boolean;
        connectionSent?: boolean;
        verified?: boolean;
        error?: string;
    };
}

export interface ProspectingState {
    batchId: string;
    accountEmail: string;
    profiles: ProfileProgress[];
    currentIndex: number;
    startTime: string;
    lastUpdate: string;
    options: {
        totalLimit: number;
        dailyLimit: number;
        connectionNote?: string;
    };
    stats: {
        processed: number;
        successful: number;
        failed: number;
        pending: number;
    };
    isPaused: boolean;
    pauseReason?: string;
    version: number;
}

const STATE_FILE = path.join(process.cwd(), 'data', 'prospecting-state.json');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'state-backups');

export class StatePersistenceService {
    private readonly CURRENT_VERSION = 1;

    constructor() {
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        const dataDir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
    }

    /**
     * Guarda el estado actual de prospecting
     */
    async save(state: Omit<ProspectingState, 'lastUpdate' | 'version'>): Promise<void> {
        const fullState: ProspectingState = {
            ...state,
            lastUpdate: new Date().toISOString(),
            version: this.CURRENT_VERSION
        };

        // Backup del estado anterior si existe
        await this.createBackup();

        // Guardar nuevo estado
        await fs.promises.writeFile(
            STATE_FILE,
            JSON.stringify(fullState, null, 2),
            'utf-8'
        );

        console.log(`[StatePersistence] 💾 State saved: ${state.currentIndex}/${state.profiles.length} profiles`);
    }

    /**
     * Carga el estado guardado
     */
    async load(): Promise<ProspectingState | null> {
        try {
            if (!fs.existsSync(STATE_FILE)) {
                return null;
            }

            const raw = await fs.promises.readFile(STATE_FILE, 'utf-8');
            const state: ProspectingState = JSON.parse(raw);

            // Validar versión
            if (state.version !== this.CURRENT_VERSION) {
                console.warn(`[StatePersistence] ⚠️ State version mismatch: ${state.version} vs ${this.CURRENT_VERSION}`);
                // Migrar si es necesario
                return this.migrateState(state);
            }

            console.log(`[StatePersistence] 📂 State loaded: ${state.currentIndex}/${state.profiles.length} profiles`);
            return state;
        } catch (error) {
            console.error('[StatePersistence] ❌ Error loading state:', error);
            return null;
        }
    }

    /**
     * Limpia el estado guardado
     */
    async clear(): Promise<void> {
        try {
            if (fs.existsSync(STATE_FILE)) {
                // Backup antes de borrar
                await this.createBackup();
                await fs.promises.unlink(STATE_FILE);
                console.log('[StatePersistence] 🗑️ State cleared');
            }
        } catch (error) {
            console.error('[StatePersistence] ❌ Error clearing state:', error);
        }
    }

    /**
     * Verifica si existe estado guardado
     */
    hasState(): boolean {
        return fs.existsSync(STATE_FILE);
    }

    /**
     * Obtiene resumen del estado actual
     */
    async getSummary(): Promise<{ hasState: boolean; summary?: string }> {
        const state = await this.load();
        if (!state) {
            return { hasState: false };
        }

        const pending = state.profiles.filter(p => p.status === 'pending').length;
        const completed = state.profiles.filter(p => p.status === 'completed').length;
        const failed = state.profiles.filter(p => p.status === 'failed').length;

        return {
            hasState: true,
            summary: `${completed} completed, ${failed} failed, ${pending} pending (${state.currentIndex}/${state.profiles.length})`
        };
    }

    /**
     * Auto-guardado cada N perfiles procesados
     */
    shouldAutoSave(processedCount: number, interval: number = 5): boolean {
        return processedCount > 0 && processedCount % interval === 0;
    }

    /**
     * Marca el estado como pausado
     */
    async pause(reason: string): Promise<void> {
        const state = await this.load();
        if (state) {
            state.isPaused = true;
            state.pauseReason = reason;
            state.lastUpdate = new Date().toISOString();
            await fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
            console.log(`[StatePersistence] ⏸️ State paused: ${reason}`);
        }
    }

    /**
     * Reanuda desde estado pausado
     */
    async resume(): Promise<ProspectingState | null> {
        const state = await this.load();
        if (state && state.isPaused) {
            state.isPaused = false;
            delete state.pauseReason;
            await fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
            console.log('[StatePersistence] ▶️ State resumed');
        }
        return state;
    }

    /**
     * Lista backups disponibles
     */
    listBackups(): string[] {
        if (!fs.existsSync(BACKUP_DIR)) return [];
        return fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('state-') && f.endsWith('.json'))
            .sort()
        .reverse();
    }

    /**
     * Restaura desde un backup
     */
    async restoreFromBackup(backupFile: string): Promise<ProspectingState | null> {
        const backupPath = path.join(BACKUP_DIR, backupFile);
        try {
            const raw = await fs.promises.readFile(backupPath, 'utf-8');
            const state: ProspectingState = JSON.parse(raw);
            
            // Guardar como estado actual
            await fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
            console.log(`[StatePersistence] 🔄 Restored from backup: ${backupFile}`);
            return state;
        } catch (error) {
            console.error('[StatePersistence] ❌ Error restoring backup:', error);
            return null;
        }
    }

    private async createBackup(): Promise<void> {
        try {
            if (!fs.existsSync(STATE_FILE)) return;

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(BACKUP_DIR, `state-${timestamp}.json`);
            
            await fs.promises.copyFile(STATE_FILE, backupPath);
            
            // Mantener solo últimos 10 backups
            const backups = this.listBackups();
            if (backups.length > 10) {
                for (const old of backups.slice(10)) {
                    await fs.promises.unlink(path.join(BACKUP_DIR, old));
                }
            }
        } catch (error) {
            console.error('[StatePersistence] ❌ Error creating backup:', error);
        }
    }

    private migrateState(oldState: any): ProspectingState {
        // Migración simple - agregar campos faltantes
        return {
            ...oldState,
            version: this.CURRENT_VERSION,
            isPaused: oldState.isPaused || false,
            stats: oldState.stats || {
                processed: oldState.currentIndex || 0,
                successful: 0,
                failed: 0,
                pending: oldState.profiles?.length || 0
            }
        };
    }
}

// Singleton instance
export const statePersistence = new StatePersistenceService();
