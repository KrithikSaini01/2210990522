const { ipcRenderer } = require('electron');
const crypto = require('crypto');

// ===== STATE =====
const state = {
    authenticated: false,
    currentSection: 'dashboard',
    profile: 'PERSONAL',
    sessionStart: null,
    autoLockMinutes: 10,
    autoLockTimer: null,
    countdownTimer: null,
    vaultItems: [],
    activityLog: []
};

// ===== DOM ELEMENTS =====
const screens = {
    login: document.getElementById('login-screen'),
    app: document.getElementById('app-screen')
};

const loginEl = {
    password: document.getElementById('master-password'),
    btn: document.getElementById('authenticate-btn'),
    status: document.getElementById('login-status'),
    mode: document.getElementById('security-mode')
};

const appEl = {
    sessionTimer: document.getElementById('session-timer'),
    profile: document.getElementById('active-profile'),
    vaultStatus: document.getElementById('vault-status'),
    lockBtn: document.getElementById('lock-btn'),
    vaultList: document.getElementById('vault-list'),
    vaultCount: document.getElementById('vault-count-label'),
    dashboardVaultCount: document.getElementById('dashboard-vault-count'),
    dashboardAutoLock: document.getElementById('dashboard-autolock'),
    activityLog: document.getElementById('activity-log')
};

// ===== INITIALIZATION =====
function init() {
    console.log('[OBSIDYN] System initializing...');
    setupAllEventListeners();
    console.log('[OBSIDYN] ✓ All listeners attached');
}

// ===== ALL EVENT LISTENERS =====
function setupAllEventListeners() {
    // Login
    if (loginEl.btn) {
        loginEl.btn.addEventListener('click', handleAuthenticate);
    }
    if (loginEl.password) {
        loginEl.password.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAuthenticate();
        });
    }

    // System Lock
    if (appEl.lockBtn) {
        appEl.lockBtn.addEventListener('click', lockSystem);
    }

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            navigateTo(section);
        });
    });

    // Tab switching (Steganography)
    document.querySelectorAll('.steg-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchStegTab(tabName);
        });
    });

    // === STEGANOGRAPHY BUTTONS ===
    
    // Hide Data buttons
    const btnSelectData = document.getElementById('btn-select-data-file');
    if (btnSelectData) {
        btnSelectData.addEventListener('click', () => selectFile('hide-data-file'));
        console.log('[STEG] ✓ Hide data file button ready');
    }

    const btnSelectCarrier = document.getElementById('btn-select-carrier');
    if (btnSelectCarrier) {
        btnSelectCarrier.addEventListener('click', () => selectImage('hide-carrier-image'));
        console.log('[STEG] ✓ Select carrier button ready');
    }

    const btnSelectOutput = document.getElementById('btn-select-output');
    if (btnSelectOutput) {
        btnSelectOutput.addEventListener('click', () => selectSavePath('hide-output-path'));
        console.log('[STEG] ✓ Select output button ready');
    }

    const btnExecuteHide = document.getElementById('btn-execute-hide');
    if (btnExecuteHide) {
        btnExecuteHide.addEventListener('click', executeHide);
        console.log('[STEG] ✓ Execute hide button ready');
    }

    // Extract Data buttons
    const btnSelectExtractImage = document.getElementById('btn-select-extract-image');
    if (btnSelectExtractImage) {
        btnSelectExtractImage.addEventListener('click', () => selectImage('extract-image'));
        console.log('[STEG] ✓ Select extract image button ready');
    }

    const btnSelectExtractOutput = document.getElementById('btn-select-extract-output');
    if (btnSelectExtractOutput) {
        btnSelectExtractOutput.addEventListener('click', () => selectSavePath('extract-output-path'));
        console.log('[STEG] ✓ Select extract output button ready');
    }

    const btnExecuteExtract = document.getElementById('btn-execute-extract');
    if (btnExecuteExtract) {
        btnExecuteExtract.addEventListener('click', executeExtract);
        console.log('[STEG] ✓ Execute extract button ready');
    }

    // Scan buttons
    const btnSelectScanImage = document.getElementById('btn-select-scan-image');
    if (btnSelectScanImage) {
        btnSelectScanImage.addEventListener('click', () => selectImage('scan-image'));
        console.log('[STEG] ✓ Select scan image button ready');
    }

    const btnExecuteScan = document.getElementById('btn-execute-scan');
    if (btnExecuteScan) {
        btnExecuteScan.addEventListener('click', executeScan);
        console.log('[STEG] ✓ Execute scan button ready');
    }

    // Vault buttons
    const btnLockFile = document.getElementById('btn-lock-file');
    if (btnLockFile) btnLockFile.addEventListener('click', () => handleVaultOp('lockFile'));
    
    const btnLockFolder = document.getElementById('btn-lock-folder');
    if (btnLockFolder) btnLockFolder.addEventListener('click', () => handleVaultOp('lockFolder'));
    
    const btnRefreshVault = document.getElementById('btn-refresh-vault');
    if (btnRefreshVault) btnRefreshVault.addEventListener('click', loadVaultList);

    // Shred button
    const btnShred = document.getElementById('btn-shred-file');
    if (btnShred) btnShred.addEventListener('click', handleShred);

    // Settings
    const autoLockInput = document.getElementById('autolock-minutes');
    if (autoLockInput) {
        autoLockInput.addEventListener('change', (e) => {
            state.autoLockMinutes = parseInt(e.target.value);
        });
    }

    const profileSelect = document.getElementById('settings-profile');
    if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
            state.profile = e.target.value;
            if (appEl.profile) appEl.profile.textContent = state.profile;
        });
    }

    console.log('[OBSIDYN] All event listeners setup complete');
}

// ===== NAVIGATION =====
function navigateTo(section) {
    console.log(`[OBSIDYN] Navigate to: ${section}`);
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === section);
    });

    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `${section}-section`);
    });

    state.currentSection = section;

    if (section === 'vault') {
        loadVaultList();
    }
}

// ===== STEGANOGRAPHY TAB SWITCHING =====
function switchStegTab(tabName) {
    console.log(`[STEG] Switch tab: ${tabName}`);
    
    document.querySelectorAll('.steg-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    
    document.querySelectorAll('.steg-panel').forEach(p => {
        p.classList.remove('active');
    });
    
    const targetPanel = document.getElementById(`steg-${tabName}-panel`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
}

// ===== FILE SELECTION HELPERS =====
async function selectFile(inputId) {
    console.log(`[STEG] Select file: ${inputId}`);
    try {
        const files = await ipcRenderer.invoke('select-file');
        if (files && files[0]) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = files[0].split('\\').pop();
                input.dataset.path = files[0];
                console.log(`[STEG] File selected: ${files[0]}`);
                showNotification('File selected', 'success');
            }
        }
    } catch (error) {
        console.error('[STEG] File select error:', error);
        showNotification('Failed to select file', 'error');
    }
}

async function selectImage(inputId) {
    console.log(`[STEG] Select image: ${inputId}`);
    try {
        const files = await ipcRenderer.invoke('select-image');
        if (files && files[0]) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = files[0].split('\\').pop();
                input.dataset.path = files[0];
                console.log(`[STEG] Image selected: ${files[0]}`);
                showNotification('Image selected', 'success');
            }
        }
    } catch (error) {
        console.error('[STEG] Image select error:', error);
        showNotification('Failed to select image', 'error');
    }
}

async function selectSavePath(inputId) {
    console.log(`[STEG] Select save path: ${inputId}`);
    try {
        const defaultName = inputId.includes('hide') ? 'hidden_image.png' : 'extracted_file.bin';
        const path = await ipcRenderer.invoke('select-restore-path', defaultName);
        if (path) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = path.split('\\').pop();
                input.dataset.path = path;
                console.log(`[STEG] Save path: ${path}`);
            }
        }
    } catch (error) {
        console.error('[STEG] Save path error:', error);
    }
}

// ===== STEGANOGRAPHY OPERATIONS =====
async function executeHide() {
    console.log('[STEG] Execute hide');
    
    const dataFile = document.getElementById('hide-data-file')?.dataset.path;
    const carrierImage = document.getElementById('hide-carrier-image')?.dataset.path;
    const outputPath = document.getElementById('hide-output-path')?.dataset.path || null;
    const password = document.getElementById('hide-password')?.value || null;
    
    if (!dataFile) {
        showNotification('Please select a file to hide', 'error');
        return;
    }
    if (!carrierImage) {
        showNotification('Please select a carrier image', 'error');
        return;
    }
    
    startLoadingAnimation('Encoding data...');
    
    sendCommand('HIDE_DATA', {
        data_file: dataFile,
        image_file: carrierImage,
        output_path: outputPath,
        password: password
    });
}

async function executeExtract() {
    console.log('[STEG] Execute extract');
    
    const imageFile = document.getElementById('extract-image')?.dataset.path;
    const outputPath = document.getElementById('extract-output-path')?.dataset.path || null;
    const password = document.getElementById('extract-password')?.value || null;
    
    if (!imageFile) {
        showNotification('Please select an image with hidden data', 'error');
        return;
    }
    
    startLoadingAnimation('Decoding image...');
    
    sendCommand('EXTRACT_DATA', {
        image_file: imageFile,
        output_path: outputPath,
        password: password
    });
}

async function executeScan() {
    console.log('[STEG] Execute scan');
    
    const imageFile = document.getElementById('scan-image')?.dataset.path;
    
    if (!imageFile) {
        showNotification('Please select an image to scan', 'error');
        return;
    }
    
    showNotification('Analyzing image...', 'info');
    
    sendCommand('SCAN_IMAGE', {
        image_file: imageFile
    });
}

// ===== LOADING ANIMATION =====
function startLoadingAnimation(status = 'Processing...') {
    const loading = document.getElementById('steg-loading');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('loading-status');
    const pixels = document.querySelectorAll('.pixel');
    
    if (!loading) {
        console.warn('[STEG] Loading overlay not found');
        return;
    }
    
    loading.classList.remove('hidden');
    statusText.textContent = status;
    progressBar.style.width = '0%';
    
    pixels.forEach(p => p.classList.remove('active', 'processed'));
    
    const totalPixels = pixels.length;
    const duration = 1500;
    const interval = duration / totalPixels;
    let processed = 0;
    
    const animateNext = (index) => {
        if (index >= totalPixels) {
            setTimeout(() => {
                progressBar.style.width = '100%';
                statusText.textContent = 'Finalizing...';
            }, 100);
            return;
        }
        
        const pixel = pixels[index];
        pixel.classList.add('active');
        
        setTimeout(() => {
            pixel.classList.remove('active');
            pixel.classList.add('processed');
            processed++;
            
            const progress = Math.round((processed / totalPixels) * 100);
            progressBar.style.width = `${progress}%`;
            
            if (progress === 25) statusText.textContent = 'Compressing...';
            else if (progress === 50) statusText.textContent = 'Encrypting...';
            else if (progress === 75) statusText.textContent = 'Embedding...';
            
            const nextDelay = interval * (0.8 + Math.random() * 0.4);
            setTimeout(() => animateNext(index + 1), nextDelay);
        }, 30);
    };
    
    setTimeout(() => animateNext(0), 100);
}

function stopLoadingAnimation() {
    const loading = document.getElementById('steg-loading');
    if (loading) {
        loading.classList.add('hidden');
    }
}

// ===== VAULT OPERATIONS =====
async function handleVaultOp(operation) {
    try {
        let result;

        if (operation === 'lockFile') {
            result = await ipcRenderer.invoke('select-file');
            if (result && result.length > 0) {
                const fileName = result[0].split('\\').pop();
                sendCommand('LOCK_FILE', { path: result[0] });
                addActivity(`Locked file: ${fileName}`);
                showNotification('File locked', 'success');
            }
        } else if (operation === 'lockFolder') {
            result = await ipcRenderer.invoke('select-folder');
            if (result && result.length > 0) {
                const folderName = result[0].split('\\').pop();
                sendCommand('LOCK_FOLDER', { path: result[0] });
                addActivity(`Locked folder: ${folderName}`);
                showNotification('Folder locked', 'success');
            }
        }
    } catch (error) {
        showNotification('Operation failed', 'error');
    }
}

async function unlockFile(containerName) {
    const item = state.vaultItems.find(i => i.container === containerName);
    if (!item) {
        showNotification('Item not found', 'error');
        return;
    }

    const defaultName = item.original_name || 'restored_file';
    const restorePath = await ipcRenderer.invoke('select-restore-path', defaultName);
    
    if (restorePath) {
        sendCommand('UNLOCK_FILE', { container: containerName, restore_path: restorePath });
        addActivity(`Unlocked: ${item.original_name}`);
        showNotification('File unlocked', 'success');
    }
}

function deleteVaultItem(containerName) {
    const item = state.vaultItems.find(i => i.container === containerName);
    if (!item) return;

    const confirmed = confirm(`WARNING: Permanently delete:\n\n${item.original_name}\n\nThis cannot be undone!`);

    if (confirmed) {
        sendCommand('DELETE_VAULT_ITEM', { container: containerName });
        addActivity(`Deleted: ${item.original_name}`);
        showNotification('Item deleted', 'success');
    }
}

function loadVaultList() {
    sendCommand('GET_VAULT_LIST', {});
}

function renderVaultList(response) {
    if (!appEl.vaultList) return;

    state.vaultItems = response.data || [];

    if (state.vaultItems.length === 0) {
        appEl.vaultList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔒</div>
                <p>No encrypted files yet</p>
                <span>Lock a file to get started</span>
            </div>
        `;
    } else {
        appEl.vaultList.innerHTML = state.vaultItems.map(item => `
            <div class="vault-item">
                <div class="vault-item-icon">${item.type === 'folder' ? '📁' : '📄'}</div>
                <div class="vault-item-info">
                    <div class="vault-item-name">${item.original_name || 'Unknown'}</div>
                    <div class="vault-item-meta">
                        ${formatBytes(item.original_size || 0)} • Locked: ${item.locked_at ? new Date(item.locked_at).toLocaleString() : 'Unknown'}
                    </div>
                </div>
                <div class="vault-item-actions">
                    <button class="btn-sm btn-unlock" onclick="unlockFile('${item.container}')">Unlock</button>
                    <button class="btn-sm btn-delete" onclick="deleteVaultItem('${item.container}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    const count = state.vaultItems.length;
    if (appEl.vaultCount) appEl.vaultCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    if (appEl.vaultStatus) appEl.vaultStatus.textContent = `${count} Items`;
    if (appEl.dashboardVaultCount) appEl.dashboardVaultCount.textContent = count;
}

// ===== SHRED =====
async function handleShred() {
    try {
        const result = await ipcRenderer.invoke('select-file');
        if (result && result.length > 0) {
            const fileName = result[0].split('\\').pop();
            const confirmed = confirm(`⚠️ SECURE SHRED\n\nFile: ${fileName}\n\nThis will PERMANENTLY destroy the file. Continue?`);

            if (confirmed) {
                sendCommand('SHRED_FILE', { path: result[0] });
                addActivity(`Shredded: ${fileName}`);
                showNotification('File destroyed', 'success');
            }
        }
    } catch (error) {
        showNotification('Shred failed', 'error');
    }
}

// ===== ACTIVITY LOG =====
function addActivity(message) {
    const time = new Date().toLocaleTimeString();
    state.activityLog.unshift({ time, message });
    if (state.activityLog.length > 20) state.activityLog.pop();
    renderActivityLog();
}

function renderActivityLog() {
    if (!appEl.activityLog) return;
    
    if (state.activityLog.length === 0) {
        appEl.activityLog.innerHTML = '<div class="activity-empty">No recent activity</div>';
        return;
    }

    appEl.activityLog.innerHTML = state.activityLog.map(item => `
        <div class="activity-item">
            <span>${item.message}</span>
            <span class="activity-time">${item.time}</span>
        </div>
    `).join('');
}

// ===== AUTHENTICATION =====
function handleAuthenticate() {
    const password = loginEl.password.value.trim();
    if (!password) {
        showLoginStatus('Please enter your master key', 'error');
        return;
    }

    state.profile = loginEl.mode.value.split(' ')[0];
    const hash = hashPassword(password);

    showLoginStatus('Authenticating...', 'info');
    sendCommand('AUTH', { password_hash: hash, mode: state.profile });
}

function handleAuthSuccess() {
    state.authenticated = true;
    state.sessionStart = Date.now();

    if (screens.login) screens.login.classList.remove('active');
    if (screens.app) screens.app.classList.add('active');

    if (appEl.profile) appEl.profile.textContent = state.profile;

    startTimers();
    loadVaultList();

    showLoginStatus('Access granted', 'success');
}

function lockSystem() {
    sendCommand('LOGOUT', {});

    setTimeout(() => {
        state.authenticated = false;
        clearTimers();
        if (loginEl.password) loginEl.password.value = '';

        if (screens.app) screens.app.classList.remove('active');
        if (screens.login) screens.login.classList.add('active');

        showLoginStatus('System locked', 'success');
    }, 100);
}

// ===== TIMERS =====
function startTimers() {
    clearTimers();
    const autoLockMs = state.autoLockMinutes * 60 * 1000;

    state.autoLockTimer = setTimeout(() => {
        lockSystem();
    }, autoLockMs);

    state.countdownTimer = setInterval(() => {
        const elapsed = Date.now() - state.sessionStart;
        const remaining = Math.max(0, autoLockMs - elapsed);
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (appEl.sessionTimer) appEl.sessionTimer.textContent = display;
        if (appEl.dashboardAutoLock) appEl.dashboardAutoLock.textContent = display;
    }, 1000);
}

function clearTimers() {
    if (state.autoLockTimer) clearTimeout(state.autoLockTimer);
    if (state.countdownTimer) clearInterval(state.countdownTimer);
}

// ===== UTILITY =====
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function sendCommand(action, payload) {
    const cmd = JSON.stringify({ action, payload });
    ipcRenderer.send('secure-command', cmd);
    console.log(`[OBSIDYN] Command sent: ${action}`);
}

function showLoginStatus(message, type) {
    if (!loginEl.status) return;
    loginEl.status.textContent = message;
    loginEl.status.className = `status-message ${type}`;
    setTimeout(() => { loginEl.status.textContent = ''; }, 3000);
}

function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.textContent = message;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notif);
    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// ===== IPC HANDLER =====
ipcRenderer.on('engine-message', (event, message) => {
    console.log(`[OBSIDYN] Received: ${message.substring(0, 100)}`);
    
    try {
        const data = JSON.parse(message);

        switch (data.status) {
            case 'AUTH_SUCCESS':
                handleAuthSuccess();
                break;
            case 'AUTH_FAIL':
                showLoginStatus('Authentication failed', 'error');
                showNotification('Authentication failed', 'error');
                break;
            case 'SUCCESS':
                showNotification(data.data, 'success');
                if (data.data && (data.data.includes('Locked') || data.data.includes('Unlocked') || data.data.includes('Deleted') || data.data.includes('hidden') || data.data.includes('extracted'))) {
                    setTimeout(() => loadVaultList(), 500);
                }
                stopLoadingAnimation();
                break;
            case 'OK':
                if (data.action === 'GET_VAULT_LIST' || data.data !== undefined) {
                    const items = Array.isArray(data.data) ? data.data : [];
                    renderVaultList({ data: items });
                }
                if (data.data && data.data.image_info) {
                    renderScanResult(data);
                }
                stopLoadingAnimation();
                break;
            case 'ERROR':
                showNotification(data.data, 'error');
                stopLoadingAnimation();
                break;
        }
    } catch (e) {
        console.error('[OBSIDYN] Parse error:', e);
    }
});

// ===== SCAN RESULT RENDERER =====
function renderScanResult(data) {
    const resultContainer = document.getElementById('scan-result');
    const content = document.getElementById('scan-result-content');
    
    if (!resultContainer || !content) return;
    
    const info = data.data?.image_info || {};
    const scanData = data.data || {};
    
    content.innerHTML = `
        <div class="scan-result-item">
            <span class="scan-result-label">Hidden Data</span>
            <span class="scan-result-value ${scanData.has_hidden_data ? 'success' : ''}">
                ${scanData.has_hidden_data ? '✓ Detected' : '✗ None'}
            </span>
        </div>
        ${scanData.is_obsidyn ? `
        <div class="scan-result-item">
            <span class="scan-result-label">OBSIDYN Format</span>
            <span class="scan-result-value success">✓ Yes</span>
        </div>
        <div class="scan-result-item">
            <span class="scan-result-label">Hidden Size</span>
            <span class="scan-result-value">${formatBytes(scanData.hidden_data_size || 0)}</span>
        </div>
        ` : ''}
        <div class="scan-result-item">
            <span class="scan-result-label">Status</span>
            <span class="scan-result-value">${scanData.message}</span>
        </div>
    `;
    
    resultContainer.classList.remove('hidden');
}

// Make functions global for HTML onclick
window.unlockFile = unlockFile;
window.deleteVaultItem = deleteVaultItem;

// Start
init();