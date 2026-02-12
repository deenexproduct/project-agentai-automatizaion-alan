import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setSettings: (settings: Record<string, any>) => ipcRenderer.invoke('set-settings', settings),

    // Clipboard
    copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),

    // Recording events from main process
    onToggleRecording: (callback: (isRecording: boolean) => void) => {
        ipcRenderer.on('toggle-recording', (_event, isRecording) => callback(isRecording));
    },

    // Send transcription result to main process
    sendTranscriptionComplete: (text: string) => {
        ipcRenderer.send('transcription-complete', text);
    },

    // Send transcription error to main process
    sendTranscriptionError: (error: string) => {
        ipcRenderer.send('transcription-error', error);
    },

    // Legacy support (keep for backwards compatibility)
    sendRecordingComplete: (text: string) => {
        ipcRenderer.send('transcription-complete', text);
    },

    // Cleanup listeners
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('toggle-recording');
    },
});

// Type declarations for the exposed API
declare global {
    interface Window {
        electronAPI: {
            getSettings: () => Promise<Record<string, any>>;
            setSettings: (settings: Record<string, any>) => Promise<Record<string, any>>;
            copyToClipboard: (text: string) => Promise<void>;
            onToggleRecording: (callback: (isRecording: boolean) => void) => void;
            sendTranscriptionComplete: (text: string) => void;
            sendTranscriptionError: (error: string) => void;
            sendRecordingComplete: (text: string) => void;
            removeAllListeners: () => void;
        };
    }
}
