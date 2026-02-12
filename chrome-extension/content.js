/**
 * Message Optimizer ✨ — Content Script for WhatsApp Web (ISOLATED World)
 * 
 * ARCHITECTURE:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ Chrome Extension                                                 │
 * │                                                                  │
 * │  content.js (ISOLATED World)          page-script.js (MAIN World)│
 * │  ├── Chrome APIs (storage, etc.)      ├── execCommand access     │
 * │  ├── UI injection (✨ button)          ├── Lexical interaction    │
 * │  ├── API calls to backend             └── Text replacement       │
 * │  └── Communication via CustomEvent ◄──────────────────────────►  │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * WHY TWO SCRIPTS?
 * - Content scripts run in an ISOLATED world: execCommand can't trigger
 *   Lexical's event handlers from here.
 * - WhatsApp's CSP blocks inline <script> injection.
 * - Manifest V3 "world": "MAIN" injects page-script.js at browser level,
 *   bypassing CSP entirely.
 */

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────
    const DEFAULT_API_URL = 'http://localhost:3001';
    let API_URL = DEFAULT_API_URL;

    chrome.storage.sync.get(['apiUrl'], (result) => {
        if (result.apiUrl) API_URL = result.apiUrl;
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.apiUrl) API_URL = changes.apiUrl.newValue;
    });

    // ── Selectors ────────────────────────────────────────────
    const INPUT_SELECTORS = [
        'div[contenteditable="true"][data-tab="10"]',
        'footer div[contenteditable="true"]',
        'div[contenteditable="true"][title="Escribí un mensaje"]',
        'div[contenteditable="true"][title="Type a message"]',
    ];

    // ── State ────────────────────────────────────────────────
    let isOptimizing = false;
    let originalText = null;
    let currentBtn = null;

    // ── Find the message input ───────────────────────────────
    function findMessageInput() {
        for (const selector of INPUT_SELECTORS) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    // ── Get text from contenteditable ────────────────────────
    function getInputText(input) {
        return input.innerText.trim();
    }

    // ══════════════════════════════════════════════════════════
    // TEXT REPLACEMENT — Communicates with page-script.js (MAIN world)
    // via CustomEvent bridge
    // ══════════════════════════════════════════════════════════
    function setInputText(input, newText) {
        return new Promise((resolve) => {
            // Listen for result from page-script.js
            const handler = (e) => {
                window.removeEventListener('__optimizer_result', handler);
                console.log('[Optimizer/CONTENT] setText result:', e.detail);
                resolve(e.detail && e.detail.success);
            };
            window.addEventListener('__optimizer_result', handler);

            // Dispatch command to page-script.js (MAIN world)
            window.dispatchEvent(new CustomEvent('__optimizer_setText', {
                detail: { text: newText }
            }));

            // Timeout fallback (2 seconds)
            setTimeout(() => {
                window.removeEventListener('__optimizer_result', handler);
                console.warn('[Optimizer/CONTENT] setText timeout — page script may not be loaded');
                resolve(false);
            }, 2000);
        });
    }

    // ── Create the ✨ button ─────────────────────────────────
    function createOptimizeButton() {
        const btn = document.createElement('button');
        btn.className = 'msg-optimizer-btn';
        btn.title = 'Optimizar mensaje ✨';
        btn.innerHTML = '✨';
        btn.setAttribute('tabindex', '-1');

        // mousedown + preventDefault keeps focus on the input
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOptimize(e);
        });

        return btn;
    }

    // ── Create undo button ──────────────────────────────────
    function createUndoButton() {
        const btn = document.createElement('button');
        btn.className = 'msg-optimizer-undo-btn';
        btn.title = 'Deshacer optimización';
        btn.innerHTML = '↩️';
        btn.setAttribute('tabindex', '-1');

        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleUndo(e);
        });

        return btn;
    }

    // ── Handle optimize click ───────────────────────────────
    async function handleOptimize(e) {
        if (isOptimizing) return;

        const input = findMessageInput();
        if (!input) {
            showToast('⚠️ No se encontró el campo de texto', true);
            return;
        }

        const text = getInputText(input);
        if (!text) {
            showToast('⚠️ Escribí un mensaje primero', true);
            return;
        }

        // Save original for undo
        originalText = text;
        isOptimizing = true;

        // Update button to loading state
        if (currentBtn) {
            currentBtn.innerHTML = '<span class="msg-optimizer-spinner"></span>';
            currentBtn.classList.add('loading');
        }

        try {
            // Call backend API
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
                // Replace text via page-script.js (MAIN world)
                const success = await setInputText(input, data.optimized);

                if (success) {
                    showUndoButton();
                    showToast('✨ Mensaje optimizado');
                } else {
                    // Fallback: copy to clipboard and notify user
                    try {
                        await navigator.clipboard.writeText(data.optimized);
                        showToast('📋 Texto optimizado copiado. Pegalo con Ctrl+V', true);
                    } catch (_) {
                        showToast('⚠️ No se pudo reemplazar. Texto: ' + data.optimized, true);
                    }
                }
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

    // ── Handle undo ─────────────────────────────────────────
    async function handleUndo(e) {
        if (!originalText) return;

        const input = findMessageInput();
        if (!input) return;

        await setInputText(input, originalText);
        originalText = null;
        hideUndoButton();
        showToast('↩️ Texto original restaurado');
    }

    // ── Show/hide undo button ───────────────────────────────
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

    // ── Toast notification ──────────────────────────────────
    function showToast(message, isError = false) {
        const existing = document.querySelector('.msg-optimizer-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `msg-optimizer-toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('visible'));

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ── Inject button into WhatsApp UI ──────────────────────
    function injectButton() {
        if (document.querySelector('.msg-optimizer-btn')) return;

        const input = findMessageInput();
        if (!input) return;

        const footer = input.closest('footer') || input.closest('[class*="footer"]');
        if (!footer) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'msg-optimizer-wrapper';

        const btn = createOptimizeButton();
        currentBtn = btn;
        wrapper.appendChild(btn);

        const inputContainer = input.parentElement;
        if (inputContainer && inputContainer.parentElement) {
            inputContainer.parentElement.insertBefore(wrapper, inputContainer.nextSibling);
        }
    }

    // ── Watch for DOM changes ───────────────────────────────
    function startObserver() {
        const observer = new MutationObserver(() => {
            const input = findMessageInput();
            const btnExists = document.querySelector('.msg-optimizer-btn');

            if (input && !btnExists) {
                setTimeout(injectButton, 300);
            } else if (!input && btnExists) {
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

    // ── Keyboard shortcut ───────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            handleOptimize(e);
        }
    });

    // ── Initialize ──────────────────────────────────────────
    function init() {
        console.log('[Message Optimizer ✨] Content script loaded (ISOLATED world)');
        startObserver();
        setTimeout(injectButton, 2000);
        setTimeout(injectButton, 5000);
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
