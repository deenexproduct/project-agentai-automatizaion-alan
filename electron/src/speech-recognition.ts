import { BrowserWindow } from 'electron';
import * as path from 'path';

let speechWindow: BrowserWindow | null = null;
let currentCallback: ((text: string) => void) | null = null;
let errorCallback: ((error: string) => void) | null = null;

export function createSpeechWindow(): BrowserWindow {
    if (speechWindow && !speechWindow.isDestroyed()) {
        return speechWindow;
    }

    speechWindow = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    // Load speech recognition HTML
    if (process.argv.includes('--dev')) {
        speechWindow.loadFile(path.join(__dirname, '../src/speech.html'));
    } else {
        speechWindow.loadFile(path.join(__dirname, 'speech.html'));
    }

    speechWindow.on('closed', () => {
        speechWindow = null;
    });

    return speechWindow;
}

export function startSpeechRecognition(
    onResult: (text: string) => void,
    onError: (error: string) => void
): void {
    currentCallback = onResult;
    errorCallback = onError;

    const window = createSpeechWindow();

    window.webContents.once('did-finish-load', () => {
        window.webContents.send('start-recognition');
    });

    if (window.webContents.isLoading()) {
        // Wait for load
    } else {
        window.webContents.send('start-recognition');
    }
}

export function stopSpeechRecognition(): void {
    if (speechWindow && !speechWindow.isDestroyed()) {
        speechWindow.webContents.send('stop-recognition');
    }
}

export function handleSpeechResult(text: string): void {
    if (currentCallback) {
        currentCallback(text);
    }
}

export function handleSpeechError(error: string): void {
    if (errorCallback) {
        errorCallback(error);
    }
}

export function destroySpeechWindow(): void {
    if (speechWindow && !speechWindow.isDestroyed()) {
        speechWindow.destroy();
        speechWindow = null;
    }
}
