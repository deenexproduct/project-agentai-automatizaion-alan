/**
 * Message Optimizer ✨ — Popup Script
 * Handles configuration of API URL and connection status.
 */

const apiUrlInput = document.getElementById('apiUrl');
const saveBtn = document.getElementById('saveBtn');
const statusDot = document.querySelector('.dot');
const statusText = document.getElementById('statusText');

// Load saved URL
chrome.storage.sync.get(['apiUrl'], (result) => {
    if (result.apiUrl) {
        apiUrlInput.value = result.apiUrl;
    }
    checkConnection(result.apiUrl || '');
});

// Save URL
saveBtn.addEventListener('click', async () => {
    let url = apiUrlInput.value.trim();

    // Remove trailing slash
    if (url.endsWith('/')) url = url.slice(0, -1);

    chrome.storage.sync.set({ apiUrl: url }, () => {
        saveBtn.textContent = '✅ Guardado';
        saveBtn.classList.add('saved');
        setTimeout(() => {
            saveBtn.textContent = 'Guardar';
            saveBtn.classList.remove('saved');
        }, 1500);
    });

    checkConnection(url);
});

// Check backend connection
async function checkConnection(url) {
    if (!url) {
        statusDot.className = 'dot error';
        statusText.textContent = 'URL no configurada';
        return;
    }

    statusDot.className = 'dot';
    statusText.textContent = 'Verificando...';

    try {
        const res = await fetch(`${url}/api/optimizer/personality`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
            statusDot.className = 'dot connected';
            statusText.textContent = 'Conectado ✓';
        } else {
            statusDot.className = 'dot error';
            statusText.textContent = `Error: ${res.status}`;
        }
    } catch (err) {
        statusDot.className = 'dot error';
        statusText.textContent = 'Sin conexión al servidor';
    }
}
