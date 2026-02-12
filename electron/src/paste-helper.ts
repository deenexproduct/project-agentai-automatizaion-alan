import { clipboard, systemPreferences } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if the app has accessibility permissions
 */
export function hasAccessibilityPermissions(): boolean {
    return systemPreferences.isTrustedAccessibilityClient(false);
}

/**
 * Request accessibility permissions (opens system preferences)
 */
export function requestAccessibilityPermissions(): boolean {
    return systemPreferences.isTrustedAccessibilityClient(true);
}

/**
 * Check if there's a focused text input in the current application
 */
export async function hasFocusedTextInput(): Promise<boolean> {
    try {
        const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        try
          set focusedElement to focused UI element of frontApp
          set elementRole to role of focusedElement
          return elementRole is in {"AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"}
        on error
          return false
        end try
      end tell
    `;

        const { stdout } = await execAsync(`osascript -e '${script}'`);
        return stdout.trim() === 'true';
    } catch (error) {
        console.error('Error checking focused input:', error);
        return false;
    }
}

/**
 * Paste text to the currently focused input using Cmd+V simulation
 * @param text The text to paste
 * @returns true if paste was successful, false otherwise
 */
export async function pasteToFocusedInput(text: string): Promise<boolean> {
    // Check permissions first
    if (!hasAccessibilityPermissions()) {
        console.warn('Accessibility permissions not granted. Requesting...');
        requestAccessibilityPermissions();
        return false;
    }

    try {
        // Save current clipboard content
        const previousClipboard = clipboard.readText();

        // Write new text to clipboard
        clipboard.writeText(text);

        // Small delay to ensure clipboard is ready
        await new Promise(resolve => setTimeout(resolve, 50));

        // Simulate Cmd+V using AppleScript
        const script = `
      tell application "System Events"
        keystroke "v" using command down
      end tell
    `;

        await execAsync(`osascript -e '${script}'`);

        // Optional: Restore previous clipboard after a delay
        // setTimeout(() => clipboard.writeText(previousClipboard), 500);

        return true;
    } catch (error) {
        console.error('Error pasting to focused input:', error);
        return false;
    }
}

/**
 * Smart paste: pastes to input if available, otherwise just copies to clipboard
 * @param text The text to paste/copy
 * @returns 'pasted' if text was pasted, 'copied' if just copied to clipboard
 */
export async function smartPaste(text: string): Promise<'pasted' | 'copied' | 'error'> {
    try {
        // Always copy to clipboard first
        clipboard.writeText(text);

        // Check if there's a focused text input
        const hasInput = await hasFocusedTextInput();

        if (hasInput) {
            const success = await pasteToFocusedInput(text);
            return success ? 'pasted' : 'copied';
        }

        return 'copied';
    } catch (error) {
        console.error('Smart paste error:', error);
        return 'error';
    }
}

/**
 * Just copy text to clipboard without pasting
 */
export function copyToClipboard(text: string): void {
    clipboard.writeText(text);
}
