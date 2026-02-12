import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, Notification, nativeImage, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';
import { spawn, ChildProcess } from 'child_process';
import {
    showFloatingWindow,
    setFloatingState,
    hideFloatingWindow,
    showSuccessAndHide,
    showErrorAndHide,
    destroyFloatingWindow
} from './floating-window';
import {
    smartPaste,
    copyToClipboard as copyText,
    hasAccessibilityPermissions,
    requestAccessibilityPermissions
} from './paste-helper';

const isDev = process.argv.includes('--dev');

console.log('--- VoiceCommand Main Process Starting ---');
console.log('Environment:', isDev ? 'Development' : 'Production');

// Store for settings
let store: any;
try {
    store = new Store({
        defaults: {
            hotkey: 'Option+Space',
            autoPaste: true,
            showNotifications: true,
            language: 'es-AR',
        },
    });
    console.log('✅ Store initialized successfully');
} catch (error) {
    store = {
        get: (key: string) => ({ hotkey: 'Option+Space', autoPaste: true, showNotifications: true }[key]),
        set: () => { },
        store: {}
    };
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isRecording = false;
let recordProcess: ChildProcess | null = null;
let audioPath = '';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        show: false, // Don't show on start
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.on('close', (event) => {
        if ((app as any).isQuitting !== true) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
}

function createTray() {
    const icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA7UlEQVQ4jZ2TMQ6CQBBF34cxMRE7a+MNLDyBJ/A6eoWtOIE3sLO10cZYEAsLEtktRhdZF9b4m+nefDIz289Q8ieFAkbABDgDhxDCM/M2AS6ADXAJIR4q3AYxSBPgCuwl3YqCJOBkZj+BDlAH3HttUmBr+A+gA7QBr/k9cA8hbEvB0pLNcSz+FfAjIYQnMA6+YPb2oAMkrS+wnUAF6IUQ8v4nwbQl3YdBOEq6ewLmwDGkwPq1haNjq/dC0N4N86e8A1FmpK8Nsk6sFWz8cM5WB+VGRNpK2kh6FDTaSDpLOsfDNGvlLekqw/oEEgR8AfJ0dFSyS5TBAAAAAElFTkSuQmCC'
    );
    tray = new Tray(icon);
    updateTrayMenu();
    tray.setToolTip('VoiceCommand - Option+Space para grabar');
    tray.on('click', () => mainWindow?.show());
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir VoiceCommand', click: () => mainWindow?.show() },
        { label: isRecording ? '🔴 Detener Grabación' : '🎙️ Grabar (Option+Space)', click: () => toggleRecording() },
        { type: 'separator' },
        { label: 'Salir', click: () => { (app as any).isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(contextMenu);
}

async function startRecording() {
    const uploadDir = path.join(app.getPath('temp'), 'voicecommand');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    audioPath = path.join(uploadDir, `recording-${Date.now()}.wav`);

    // Use sox/rec for recording (don't specify sample rate, let it use default)
    // -c 1 = mono, -q = quiet
    recordProcess = spawn('rec', ['-c', '1', audioPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    recordProcess.stderr?.on('data', (data) => {
        console.log('rec stderr:', data.toString());
    });

    recordProcess.on('error', (err) => {
        console.error('❌ Sox rec error:', err.message);
    });

    recordProcess.on('spawn', () => {
        console.log('🎙️ Recording started:', audioPath);
    });
}

async function stopRecording(): Promise<string> {
    return new Promise((resolve) => {
        if (recordProcess && !recordProcess.killed) {
            console.log('⏹️ Stopping recording...');

            // Use SIGTERM then SIGINT for graceful shutdown
            recordProcess.kill('SIGTERM');

            const timeout = setTimeout(() => {
                console.log('⏹️ Recording timeout, resolving...');
                recordProcess = null;
                resolve(audioPath);
            }, 2000);

            recordProcess.on('close', (code) => {
                clearTimeout(timeout);
                console.log('⏹️ Recording stopped with code:', code);
                recordProcess = null;
                resolve(audioPath);
            });
        } else {
            console.log('⚠️ No active recording process');
            resolve(audioPath);
        }
    });
}

async function transcribeAudio(filePath: string): Promise<string> {
    try {
        const FormData = require('form-data');
        const fetch = require('node-fetch');

        if (!fs.existsSync(filePath)) {
            console.error('Audio file not found:', filePath);
            return '';
        }

        const formData = new FormData();
        formData.append('audio', fs.createReadStream(filePath));

        const response = await fetch('http://localhost:3000/api/transcribe/blob', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Transcription failed');
        }

        const data = await response.json();
        return data.text || '';
    } catch (error: any) {
        console.error('Transcription error:', error.message);
        return '';
    }
}

async function toggleRecording() {
    if (!isRecording) {
        // START RECORDING
        isRecording = true;
        updateTrayMenu();
        showFloatingWindow('listening');
        await startRecording();
        console.log('🎙️ Listening...');
    } else {
        // STOP RECORDING
        isRecording = false;
        updateTrayMenu();
        setFloatingState('processing');

        const recordedPath = await stopRecording();
        console.log('⏳ Processing:', recordedPath);

        // Wait for file to be written
        await new Promise(r => setTimeout(r, 800));

        if (fs.existsSync(recordedPath) && fs.statSync(recordedPath).size > 0) {
            const text = await transcribeAudio(recordedPath);

            if (text && text.trim() && !text.includes('[')) {
                console.log('✅ Transcription:', text);

                // Copy to clipboard
                clipboard.writeText(text);

                // Always paste directly using Cmd+V
                if (hasAccessibilityPermissions()) {
                    const { exec } = require('child_process');
                    exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`, (err: any) => {
                        if (err) {
                            console.error('Paste error:', err);
                        } else {
                            console.log('📋 Text pasted to active input');
                        }
                    });
                } else {
                    console.log('⚠️ No accessibility permissions - text copied to clipboard');
                }

                // Show success indicator
                showSuccessAndHide(1200);

                if (store.get('showNotifications')) {
                    new Notification({
                        title: '✅ Transcripción lista',
                        body: text.length > 80 ? text.substring(0, 80) + '...' : text
                    }).show();
                }
            } else {
                console.log('❌ No valid transcription');
                showErrorAndHide(1000);
            }

            // Cleanup
            try { fs.unlinkSync(recordedPath); } catch { }
        } else {
            console.log('❌ No audio file');
            showErrorAndHide(1000);
        }
    }
}

function registerGlobalShortcut() {
    const hotkey = store.get('hotkey') as string;
    globalShortcut.unregisterAll();

    try {
        const registered = globalShortcut.register(hotkey, () => {
            console.log('⚡️ Hotkey triggered:', hotkey);
            toggleRecording();
        });
        if (registered) {
            console.log(`✅ Hotkey registered: ${hotkey}`);
        } else {
            console.error('❌ Failed to register hotkey');
        }
    } catch (error) {
        console.error('Error registering hotkey:', error);
    }
}

function checkAccessibility() {
    if (!hasAccessibilityPermissions()) {
        console.warn('⚠️ Accessibility permissions required for auto-paste');
        requestAccessibilityPermissions();
    } else {
        console.log('✅ Accessibility permissions granted');
    }
}

// IPC handlers
ipcMain.handle('get-settings', () => store.store);
ipcMain.handle('set-settings', (_event, settings) => {
    Object.keys(settings).forEach((key) => store.set(key, settings[key]));
    if (settings.hotkey) {
        globalShortcut.unregisterAll();
        registerGlobalShortcut();
    }
    return store.store;
});

ipcMain.handle('copy-to-clipboard', (_event, text) => {
    clipboard.writeText(text);
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    createTray();
    registerGlobalShortcut();
    checkAccessibility();

    console.log('🚀 VoiceCommand ready! Press Option+Space to record.');

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow?.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    destroyFloatingWindow();
    if (recordProcess) {
        recordProcess.kill();
    }
});
