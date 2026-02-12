/**
 * Message Optimizer ✨ — Content Script for WhatsApp Web
 * Injects an optimize button into the WhatsApp Web message input.
 */

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────
    const DEFAULT_API_URL = 'http://localhost:3001';
    let API_URL = DEFAULT_API_URL;

    // Load saved API URL from storage
    chrome.storage.sync.get(['apiUrl'], (result) => {
        if (result.apiUrl) API_URL = result.apiUrl;
    });

    // Listen for config updates from popup
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.apiUrl) API_URL = changes.apiUrl.newValue;
    });

    // ── Selectors (with fallbacks for WhatsApp DOM changes) ────
    const INPUT_SELECTORS = [
        'div[contenteditable="true"][data-tab="10"]',
        'footer div[contenteditable="true"]',
        'div[contenteditable="true"][title="Escribí un mensaje"]',
        'div[contenteditable="true"][title="Type a message"]',
    ];

    const SEND_BUTTON_SELECTORS = [
        'button[data-tab="11"]',
        'footer button[aria-label="Enviar"]',
        'footer button[aria-label="Send"]',
        'footer span[data-icon="send"]',
    ];

    // ── State ──────────────────────────────────────────────────
    let isOptimizing = false;
    let originalText = null;
    let currentBtn = null;

    // ── Find the message input ─────────────────────────────────
    function findMessageInput() {
        for (const selector of INPUT_SELECTORS) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    // ── Find the send button area (to inject next to it) ───────
    function findSendButtonArea() {
        // Find the container that holds the send/voice button
        const footer = document.querySelector('footer');
        if (!footer) return null;

        // Look for the button row in the footer
        const sendContainer = footer.querySelector('div[class] > div > span:last-child');
        if (sendContainer) return sendContainer;

        // Fallback: find send button's parent
        for (const selector of SEND_BUTTON_SELECTORS) {
            const btn = document.querySelector(selector);
            if (btn) {
                // Walk up to find a good injection point
                return btn.closest('div') || btn.parentElement;
            }
        }

        return null;
    }

    // ── Get text from contenteditable ──────────────────────────
    function getInputText(input) {
        return input.innerText.trim();
    }

    // ── Set text in contenteditable (triggers WhatsApp React state) ─
    function setInputText(input, newText) {
        input.focus();

        try {
            // 1. FORCEFULLY clear the input content
            // WhatsApp uses <span> elements inside the contenteditable
            // We need to remove everything first
            while (input.firstChild) {
                input.removeChild(input.firstChild);
            }

            // 2. Dispatch paste event with new text — WhatsApp listens for this
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', newText);

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dataTransfer,
            });

            input.dispatchEvent(pasteEvent);

            // 3. Check if paste was handled — if not, insert manually
            setTimeout(() => {
                const currentText = getInputText(input);
                if (!currentText || currentText.length === 0) {
                    // Paste was blocked, insert directly as WhatsApp's span structure
                    input.innerHTML = '';
                    const p = document.createElement('p');
                    const span = document.createElement('span');
                    span.setAttribute('data-lexical-text', 'true');
                    span.textContent = newText;
                    p.appendChild(span);
                    input.appendChild(p);

                    // Dispatch input event for React
                    input.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertText',
                        data: newText,
                    }));
                }
            }, 100);

        } catch (err) {
            console.error('[Optimizer] setInputText error:', err);
            input.textContent = newText;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // ── Create the ✨ button ───────────────────────────────────
    function createOptimizeButton() {
        const btn = document.createElement('button');
        btn.className = 'msg-optimizer-btn';
        btn.title = 'Optimizar mensaje ✨';
        btn.innerHTML = '✨';

        btn.addEventListener('click', handleOptimize);

        return btn;
    }

    // ── Create undo button ────────────────────────────────────
    function createUndoButton() {
        const btn = document.createElement('button');
        btn.className = 'msg-optimizer-undo-btn';
        btn.title = 'Deshacer optimización';
        btn.innerHTML = '↩️';

        btn.addEventListener('click', handleUndo);

        return btn;
    }

    // ── Handle optimize click ─────────────────────────────────
    async function handleOptimize(e) {
        e.preventDefault();
        e.stopPropagation();

        if (isOptimizing) return;

        const input = findMessageInput();
        if (!input) return;

        const text = getInputText(input);
        if (!text) return;

        // Save original for undo
        originalText = text;
        isOptimizing = true;

        // Update button to loading
        if (currentBtn) {
            currentBtn.innerHTML = '<span class="msg-optimizer-spinner"></span>';
            currentBtn.classList.add('loading');
        }

        try {
            const response = await fetch(`${API_URL}/api/optimizer/optimize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.optimized && data.optimized !== text) {
                setInputText(input, data.optimized);
                showUndoButton();
                showToast('✨ Mensaje optimizado');
            } else {
                showToast('✅ El mensaje ya estaba bien escrito');
            }
        } catch (error) {
            console.error('[Optimizer] Error:', error);
            showToast('❌ Error al optimizar. ¿Está el servidor corriendo?', true);
        } finally {
            isOptimizing = false;
            if (currentBtn) {
                currentBtn.innerHTML = '✨';
                currentBtn.classList.remove('loading');
            }
        }
    }

    // ── Handle undo ───────────────────────────────────────────
    function handleUndo(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!originalText) return;

        const input = findMessageInput();
        if (!input) return;

        setInputText(input, originalText);
        originalText = null;
        hideUndoButton();
        showToast('↩️ Texto original restaurado');
    }

    // ── Show/hide undo button ─────────────────────────────────
    function showUndoButton() {
        let undoBtn = document.querySelector('.msg-optimizer-undo-btn');
        if (!undoBtn) {
            undoBtn = createUndoButton();
            const optimizeBtn = document.querySelector('.msg-optimizer-btn');
            if (optimizeBtn && optimizeBtn.parentElement) {
                optimizeBtn.parentElement.insertBefore(undoBtn, optimizeBtn);
            }
        }
        undoBtn.style.display = 'flex';
    }

    function hideUndoButton() {
        const undoBtn = document.querySelector('.msg-optimizer-undo-btn');
        if (undoBtn) undoBtn.style.display = 'none';
    }

    // ── Toast notification ────────────────────────────────────
    function showToast(message, isError = false) {
        // Remove existing toast
        const existing = document.querySelector('.msg-optimizer-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `msg-optimizer-toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => toast.classList.add('visible'));

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ── Inject button into WhatsApp UI ────────────────────────
    function injectButton() {
        // Don't inject if already there
        if (document.querySelector('.msg-optimizer-btn')) return;

        const input = findMessageInput();
        if (!input) return;

        // Find the footer row where the send button lives
        const footer = input.closest('footer') || input.closest('[class*="footer"]');
        if (!footer) return;

        // Find the row containing the input — we'll inject our button into this row
        const inputRow = input.closest('div[class]');
        if (!inputRow) return;

        // Create a wrapper for our buttons
        const wrapper = document.createElement('div');
        wrapper.className = 'msg-optimizer-wrapper';

        const btn = createOptimizeButton();
        currentBtn = btn;
        wrapper.appendChild(btn);

        // Insert after the input's parent container
        const inputContainer = input.parentElement;
        if (inputContainer && inputContainer.parentElement) {
            inputContainer.parentElement.insertBefore(wrapper, inputContainer.nextSibling);
        }
    }

    // ── Watch for DOM changes (chat switches, etc.) ───────────
    function startObserver() {
        const observer = new MutationObserver(() => {
            const input = findMessageInput();
            const btnExists = document.querySelector('.msg-optimizer-btn');

            if (input && !btnExists) {
                // New chat opened or page loaded — inject button
                setTimeout(injectButton, 300);
            } else if (!input && btnExists) {
                // Chat closed — clean up
                const wrapper = document.querySelector('.msg-optimizer-wrapper');
                if (wrapper) wrapper.remove();
                currentBtn = null;
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    // ── Keyboard shortcut ─────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+O or Cmd+Shift+O to optimize
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            handleOptimize(e);
        }
    });

    // ── Initialize ────────────────────────────────────────────
    function init() {
        console.log('[Message Optimizer ✨] Loaded on WhatsApp Web');
        startObserver();
        // Try initial injection after a delay (page might still be loading)
        setTimeout(injectButton, 2000);
        setTimeout(injectButton, 5000);
    }

    // Wait for page to be ready
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
