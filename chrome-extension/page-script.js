/**
 * Message Optimizer ✨ — Page Script (MAIN World)
 * 
 * This script runs in the PAGE's JavaScript context (not the extension's
 * isolated world). This is critical because:
 * 
 * 1. document.execCommand('insertText') needs to run in the same world
 *    as WhatsApp's Lexical editor to trigger its event handlers.
 * 2. WhatsApp's CSP blocks inline <script> injection, so we use
 *    Manifest V3's "world": "MAIN" to inject this file at the browser level.
 * 3. Communication with the content script happens via CustomEvents on window.
 * 
 * FLOW:
 *   Content Script (ISOLATED) ──CustomEvent──▶ Page Script (MAIN)
 *                                                  │
 *                                                  ├── focus input
 *                                                  ├── select all text
 *                                                  └── execCommand('insertText')
 *                                                  │
 *   Content Script (ISOLATED) ◀──CustomEvent── Page Script (MAIN)
 */

(function () {
    'use strict';

    const SELECTORS = [
        'div[contenteditable="true"][data-tab="10"]',
        'footer div[contenteditable="true"]',
        'div[contenteditable="true"][title="Escribí un mensaje"]',
        'div[contenteditable="true"][title="Type a message"]',
    ];

    /**
     * Finds the WhatsApp message input element.
     */
    function findInput() {
        for (const selector of SELECTORS) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    /**
     * Replaces ALL text in the contenteditable input with newText.
     * Uses execCommand which triggers Lexical's native event pipeline.
     */
    function replaceText(newText) {
        const input = findInput();

        if (!input) {
            console.error('[Optimizer/PAGE] Input element not found');
            return { success: false, error: 'input_not_found' };
        }

        // Step 1: Ensure focus is on the input
        input.focus();

        // Step 2: Select ALL content inside the input
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);

        // Step 3: Replace selected text via execCommand
        // This is the key — execCommand('insertText') in the MAIN world
        // triggers Lexical's beforeinput/input handlers natively
        const result = document.execCommand('insertText', false, newText);

        console.log('[Optimizer/PAGE] execCommand insertText result:', result);

        // Step 4: If execCommand returned false, try alternative approaches
        if (!result) {
            console.warn('[Optimizer/PAGE] execCommand failed, trying delete + insert');

            // Re-select and try delete first, then insert
            input.focus();
            range.selectNodeContents(input);
            selection.removeAllRanges();
            selection.addRange(range);

            // Delete the selection
            document.execCommand('delete', false, null);

            // Now insert (no selection to fight)
            const insertResult = document.execCommand('insertText', false, newText);
            console.log('[Optimizer/PAGE] delete+insert result:', insertResult);

            if (!insertResult) {
                // Last resort: use InputEvent dispatch
                console.warn('[Optimizer/PAGE] All execCommand failed, trying InputEvent');

                // Create proper Lexical structure
                const p = document.createElement('p');
                const span = document.createElement('span');
                span.setAttribute('data-lexical-text', 'true');
                span.dir = 'ltr';
                span.textContent = newText;
                p.appendChild(span);

                input.innerHTML = '';
                input.appendChild(p);

                // Trigger Lexical reconciliation via InputEvent
                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: false,
                    inputType: 'insertText',
                    data: newText,
                }));

                return { success: true, method: 'dom_manipulation' };
            }

            return { success: true, method: 'delete_then_insert' };
        }

        return { success: true, method: 'insertText' };
    }

    // ── Listen for setText commands from content script ──────
    window.addEventListener('__optimizer_setText', function (e) {
        const newText = e.detail && e.detail.text;
        if (!newText) {
            console.error('[Optimizer/PAGE] No text provided');
            return;
        }

        console.log('[Optimizer/PAGE] Received setText request, length:', newText.length);

        const result = replaceText(newText);

        // Send result back to content script
        window.dispatchEvent(new CustomEvent('__optimizer_result', {
            detail: result
        }));
    });

    // Signal that the page script is ready
    window.__optimizerPageScriptReady = true;
    window.dispatchEvent(new CustomEvent('__optimizer_ready'));
    console.log('[Message Optimizer ✨] Page script loaded (MAIN world)');
})();
