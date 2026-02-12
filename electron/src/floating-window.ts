import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

let floatingWindow: BrowserWindow | null = null;

export type FloatingState = 'listening' | 'processing' | 'success' | 'error';

export function createFloatingWindow(): BrowserWindow {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
        return floatingWindow;
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

    floatingWindow = new BrowserWindow({
        width: 90,
        height: 36,
        x: screenWidth - 110,
        y: screenHeight - 56,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    // Set to highest level to appear above all windows including fullscreen apps
    floatingWindow.setAlwaysOnTop(true, 'screen-saver');
    floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Load the floating window HTML
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
        floatingWindow.loadFile(path.join(__dirname, '../src/floating.html'));
    } else {
        floatingWindow.loadFile(path.join(__dirname, 'floating.html'));
    }

    floatingWindow.on('closed', () => {
        floatingWindow = null;
    });

    return floatingWindow;
}

export function showFloatingWindow(state: FloatingState = 'listening'): void {
    const window = createFloatingWindow();

    window.webContents.once('did-finish-load', () => {
        window.webContents.send('set-state', state);
    });

    if (window.isVisible()) {
        window.webContents.send('set-state', state);
    } else {
        window.show();
    }
}

export function setFloatingState(state: FloatingState): void {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send('set-state', state);
    }
}

export function hideFloatingWindow(): void {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
    }
}

export function destroyFloatingWindow(): void {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.destroy();
        floatingWindow = null;
    }
}

export function showSuccessAndHide(delayMs: number = 1000): void {
    setFloatingState('success');
    setTimeout(() => {
        hideFloatingWindow();
    }, delayMs);
}

export function showErrorAndHide(delayMs: number = 1500): void {
    setFloatingState('error');
    setTimeout(() => {
        hideFloatingWindow();
    }, delayMs);
}
