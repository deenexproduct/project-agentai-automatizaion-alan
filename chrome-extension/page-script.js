/**
 * Message Optimizer ✨ — Page Script (MAIN World)
 * 
 * Runs in the PAGE's JavaScript context via Manifest V3 "world": "MAIN".
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  content.js (ISOLATED)  ◄──postMessage──▶  page-script.js  │
 * │                                           (MAIN world)     │
 * │  • Chrome APIs                            • execCommand    │
 * │  • UI / buttons                           • Lexical access │
 * │  • Backend API calls                      • DOM selection  │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHY postMessage instead of CustomEvent?
 * CustomEvent.detail is an opaque Object across ISOLATED/MAIN worlds.
 * postMessage uses Structured Clone Algorithm — works correctly.
 * 
 * WHY setTimeout between selectAll and insertText?
 * Lexical syncs its internal selection via the 'selectionchange' event,
 * which fires ASYNCHRONOUSLY. Without a delay, execCommand('insertText')
 * succeeds but Lexical processes it at the OLD cursor position.
 */

(function () {
    'use strict';

    const SELECTORS = [
        'div[contenteditable="true"][data-tab="10"]',
        'footer div[contenteditable="true"]',
        'div[contenteditable="true"][title="Escribí un mensaje"]',
        'div[contenteditable="true"][title="Type a message"]',
    ];

    function findInput() {
        for (const selector of SELECTORS) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    /**
     * Replace ALL text in the WhatsApp input with newText.
     * Returns a Promise because we need async delays for Lexical selection sync.
     */
    function replaceText(newText) {
        return new Promise((resolve) => {
            const input = findInput();

            if (!input) {
                console.error('[Optimizer/PAGE] Input element not found');
                resolve({ success: false, error: 'input_not_found' });
                return;
            }

            // ── Step 1: Focus the input ──
            input.focus();
            console.log('[Optimizer/PAGE] Input focused');

            // ── Step 2: Select all content using execCommand ──
            // execCommand('selectAll') changes the DOM selection and triggers
            // a native 'selectionchange' event that Lexical listens for
            document.execCommand('selectAll', false, null);
            console.log('[Optimizer/PAGE] selectAll executed');

            // ── Step 3: Wait for Lexical to process 'selectionchange' ──
            // This is CRITICAL. The selectionchange event fires asynchronously.
            // Lexical's handler reads the DOM selection and updates its internal
            // selection model. Without this delay, Lexical's selection is stale.
            setTimeout(() => {
                console.log('[Optimizer/PAGE] After selection sync delay');

                // ── Step 4: Delete selected content ──
                // This fires a trusted 'beforeinput' with inputType='deleteContent*'
                // Lexical processes this and clears its internal text state
                document.execCommand('delete', false, null);
                console.log('[Optimizer/PAGE] delete executed');

                // ── Step 5: Insert new text ──
                // Now Lexical's internal state is empty and selection is at position 0.
                // insertText fires a trusted 'beforeinput' with inputType='insertText'
                // Lexical inserts the text into its empty state.
                const result = document.execCommand('insertText', false, newText);
                console.log('[Optimizer/PAGE] insertText result:', result);

                if (result) {
                    resolve({ success: true, method: 'selectAll_delete_insert' });
                    return;
                }

                // ── Fallback: Direct DOM manipulation ──
                console.warn('[Optimizer/PAGE] execCommand chain failed, trying DOM fallback');
                try {
                    // Re-focus
                    input.focus();

                    // Build Lexical-compatible DOM structure
                    const p = document.createElement('p');
                    p.setAttribute('dir', 'ltr');
                    const span = document.createElement('span');
                    span.setAttribute('data-lexical-text', 'true');
                    span.textContent = newText;
                    p.appendChild(span);

                    // Replace content
                    input.innerHTML = '';
                    input.appendChild(p);

                    // Place cursor at end
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(span);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);

                    // Trigger Lexical reconciliation via input event
                    input.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        cancelable: false,
                        inputType: 'insertText',
                        data: newText,
                    }));

                    resolve({ success: true, method: 'dom_fallback' });
                } catch (err) {
                    console.error('[Optimizer/PAGE] DOM fallback error:', err);
                    resolve({ success: false, error: 'all_methods_failed' });
                }
            }, 50); // 50ms — enough for Lexical's selectionchange handler
        });
    }

    // ── Listen for commands via postMessage ──────────────────
    // postMessage works reliably across ISOLATED ↔ MAIN worlds
    // (unlike CustomEvent.detail which is opaque across worlds)
    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        if (!e.data || e.data.type !== '__optimizer_setText') return;

        const newText = e.data.text;
        if (!newText) {
            console.error('[Optimizer/PAGE] No text provided');
            return;
        }

        console.log('[Optimizer/PAGE] Received setText via postMessage, length:', newText.length);

        replaceText(newText).then((result) => {
            console.log('[Optimizer/PAGE] Sending result:', result);
            // Send result back via postMessage
            window.postMessage({ type: '__optimizer_result', ...result }, '*');
        });
    });

    // Signal readiness
    window.__optimizerPageScriptReady = true;
    console.log('[Message Optimizer ✨] Page script loaded (MAIN world)');
})();
