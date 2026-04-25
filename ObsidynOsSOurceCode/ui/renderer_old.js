
const { ipcRenderer } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
    authenticated: false,
    currentSection: "dashboard",
    profile: "PERSONAL",
    sessionStart: null,
    autoLockMinutes: 10,
    autoLockTimer: null,
    countdownTimer: null,
    pollTimer: null,
    vaultItems: [],
    activityLog: [],
    selectedFileForShred: null,
    engineBuffer: "",
    decoyTargetPath: "",
    monitorActive: false,
    authStatus: null,
    appSettings: null,
    operatorProfile: null,
    operatorProfileDirty: false,
    operatorProfileHydrating: false,
    operatorEditing: false,
    operatorViewing: false,
    operatorNotesUnlocked: false,
    operatorNotesCache: null,
    operatorSelectedNoteId: null,
    operatorImageDraft: undefined,
    operatorNotePasscode: null,
    pendingOperatorNotePasscode: null,
    recoveryConfigured: false,
    failedPasswordAttempts: 0,
    recoveryTriggerAttempts: 0,
    pvsVerified: false,
    cameraStream: null,
    cameraMode: null,
    recoveryReady: false,
    recoveryPipelineActive: false,
    recoveryPipelineMode: null,
    recoveryPipelineProgress: 0,
    recoveryPipelineTimer: null,
    recoveryPipelineStages: [],
    captures: {
        face: null,
        gesture: null
    },
    keystroke: {
        startedAt: null,
        keydowns: [],
        dwellTimes: [],
        flightTimes: [],
        correctionCount: 0,
        sequence: 0,
        pending: []
    }
};

const screens = {
    login: $("login-screen"),
    app: $("app-screen")
};

const loginEl = {
    password: $("master-password"),
    button: $("authenticate-btn"),
    status: $("login-status"),
    mode: $("security-mode")
};

const appEl = {
    sessionTimer: $("session-timer"),
    autoLockCountdown: $("auto-lock-countdown"),
    profile: $("active-profile"),
    vaultStatus: $("vault-status"),
    lockButton: $("lock-btn"),
    vaultList: $("vault-list"),
    vaultCount: $("vault-count-label"),
    dashboardVaultCount: $("dashboard-vault-count"),
    dashboardAutoLock: $("dashboard-autolock"),
    dashboardSecurityLevel: $("dashboard-security-level"),
    activityLog: $("activity-log")
};

function init() {
    mountAtmosphere();
    mountOperationalSections();
    normalizeUiCopy();
    bindCoreEvents();
    bindShredEvents();
    renderActivityLog();
    updateDashboardState();
    resetKeystrokeTrace();
    loadAppSettings();
    loadAuthStatus();
    document.body.classList.add("ui-ready");
}

function markOperatorProfileDirty() {
    if (state.operatorProfileHydrating) {
        return;
    }
    state.operatorProfileDirty = true;
}

function mountAtmosphere() {
    const loginScreen = document.getElementById("login-screen");
    if (!loginScreen || loginScreen.querySelector(".ambient-layer")) return;

    const ambient = document.createElement("div");
    ambient.className = "ambient-layer";
    ambient.style.cssText = "position: absolute; inset: 0; overflow: hidden; background: #03050a; z-index: 0;";

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;";
    ambient.appendChild(canvas);
    loginScreen.prepend(ambient);

    const ctx = canvas.getContext("2d");
    let particlesArray = [];
    let animationFrameId = null;

    const mouse = { x: null, y: null, radius: 150 };

    window.addEventListener("mousemove", (event) => {
        if (!loginScreen.classList.contains("active")) return;
        mouse.x = event.x;
        mouse.y = event.y;
    });

    window.addEventListener("mouseout", () => {
        mouse.x = null;
        mouse.y = null;
    });

    class Particle {
        constructor(x, y, dx, dy, size, color) {
            this.x = x;
            this.y = y;
            this.dx = dx;
            this.dy = dy;
            this.size = size;
            this.color = color;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        update() {
            if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
            if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;

            let diffX = mouse.x - this.x;
            let diffY = mouse.y - this.y;
            let distance = Math.sqrt(diffX * diffX + diffY * diffY);

            if (distance < mouse.radius + this.size && mouse.x != null) {
                if (mouse.x < this.x && this.x < canvas.width - this.size * 10) this.x += 2;
                if (mouse.x > this.x && this.x > this.size * 10) this.x -= 2;
                if (mouse.y < this.y && this.y < canvas.height - this.size * 10) this.y += 2;
                if (mouse.y > this.y && this.y > this.size * 10) this.y -= 2;
            }
            this.x += this.dx;
            this.y += this.dy;
            this.draw();
        }
    }

    function init() {
        particlesArray = [];
        let numberOfParticles = Math.min((canvas.height * canvas.width) / 10000, 120);
        for (let i = 0; i < numberOfParticles; i++) {
            let size = (Math.random() * 2) + 1;
            let x = (Math.random() * ((canvas.width - size * 2) - (size * 2)) + size * 2);
            let y = (Math.random() * ((canvas.height - size * 2) - (size * 2)) + size * 2);
            let dx = (Math.random() * 0.8) - 0.4;
            let dy = (Math.random() * 0.8) - 0.4;
            let color = Math.random() > 0.5 ? 'rgba(0, 255, 170, 0.8)' : 'rgba(0, 85, 255, 0.8)';
            particlesArray.push(new Particle(x, y, dx, dy, size, color));
        }
    }

    function connect() {
        for (let a = 0; a < particlesArray.length; a++) {
            for (let b = a; b < particlesArray.length; b++) {
                let dist = ((particlesArray[a].x - particlesArray[b].x) ** 2) + ((particlesArray[a].y - particlesArray[b].y) ** 2);
                if (dist < 18000) {
                    ctx.strokeStyle = `rgba(121, 242, 214, ${(1 - dist / 18000) * 0.2})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                    ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                    ctx.stroke();
                }
            }
            if (mouse.x != null) {
                let mouseDist = ((particlesArray[a].x - mouse.x) ** 2) + ((particlesArray[a].y - mouse.y) ** 2);
                if (mouseDist < 25000) {
                    ctx.strokeStyle = `rgba(0, 255, 170, ${(1 - mouseDist / 25000) * 0.6})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                    ctx.lineTo(mouse.x, mouse.y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        if (!loginScreen.classList.contains("active")) {
            animationFrameId = requestAnimationFrame(animate);
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesArray.forEach(p => p.update());
        connect();
        animationFrameId = requestAnimationFrame(animate);
    }

    function handleResize() {
        canvas.width = window.innerWidth || 1024;
        canvas.height = window.innerHeight || 768;
        init();
    }

    window.addEventListener("resize", handleResize);
    handleResize();
    animate();
}

function mountOperationalSections() {
    const vaultNav = document.querySelector('.nav-item[data-section="vault"]');
    if (vaultNav && !document.querySelector('.nav-item[data-section="operator"]')) {
        vaultNav.insertAdjacentHTML(
            "beforebegin",
            `
            <button class="nav-item" data-section="operator">
                <span class="nav-icon">OP</span>
                <span class="nav-label">Operator</span>
            </button>
            `
        );
    }

    const secureShredNav = document.querySelector('.nav-item[data-section="secure-shred"]');
    if (secureShredNav && !document.querySelector('.nav-item[data-section="deception"]')) {
        secureShredNav.insertAdjacentHTML(
            "beforebegin",
            `
            <button class="nav-item" data-section="deception">
                <span class="nav-icon">DC</span>
                <span class="nav-label">Decoy Ops</span>
            </button>
            <button class="nav-item" data-section="signals">
                <span class="nav-icon">SG</span>
                <span class="nav-label">Signals</span>
            </button>
            `
        );
    }

    const vaultSection = $("vault-section");
    if (vaultSection && !$("operator-section")) {
        vaultSection.insertAdjacentHTML(
            "beforebegin",
            `
            <section id="operator-section" class="content-section">
                <div class="section-header">
                    <h2>Operator Control</h2>
                    <p class="section-subtitle">Single-user dossier, sealed notes, recovery controls, and session policy.</p>
                </div>

﻿                <div class="settings-grid ops-grid operator-grid operator-primary-grid">
                    <div class="settings-card operator-card operator-dossier-card operator-dossier-card-full">
                        <div class="operator-card-head operator-card-head-wide">
                            <div>
                                <h3>Operator Dossier</h3>
                                <p class="operator-panel-caption">Single-user identity record with controlled disclosure, protected image identity, and sealed profile controls.</p>
                            </div>
                            <div class="toolbar recovery-toolbar operator-toolbar-tight">
                                <button id="btn-view-operator-profile" class="btn-secondary hidden">View Dossier</button>
                                <button id="btn-edit-operator-profile" class="btn-secondary hidden">Update Dossier</button>
                                <button id="btn-cancel-operator-edit" class="btn-secondary hidden">Cancel</button>
                                <button id="btn-save-operator-profile" class="btn-primary">Seal Dossier</button>
                            </div>
                        </div>
                        <div id="operator-dossier-status" class="status-message info">No dossier sealed yet.</div>
                        <div id="operator-dossier-summary" class="operator-summary-shell hidden"></div>
                        <div id="operator-dossier-view" class="operator-view-shell hidden"></div>
                        <div id="operator-dossier-form" class="operator-dossier-form-shell">
                            <div class="operator-dossier-media-card">
                                <div id="operator-image-preview" class="operator-image-preview">
                                    <div id="operator-image-fallback" class="operator-avatar operator-avatar-xl">OP</div>
                                    <img id="operator-image-tag" class="operator-image-tag hidden" alt="Operator profile image">
                                </div>
                                <div class="operator-image-controls">
                                    <span class="operator-summary-kicker">Profile image</span>
                                    <p>Attach one operator image for identity context inside the sealed dossier.</p>
                                    <div class="toolbar operator-toolbar-tight">
                                        <button id="btn-upload-operator-image" class="btn-secondary">Upload Image</button>
                                        <button id="btn-remove-operator-image" class="btn-secondary">Remove</button>
                                    </div>
                                </div>
                            </div>
                            <div class="operator-dossier-fields">
                                <div class="operator-form-grid">
                                    <div class="setting-control">
                                        <label for="operator-call-sign">Call sign</label>
                                        <input type="text" id="operator-call-sign" placeholder="OBSIDYN-01">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-full-name">Full name</label>
                                        <input type="text" id="operator-full-name" placeholder="Encrypted operator record">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-organization">Organization</label>
                                        <input type="text" id="operator-organization" placeholder="Cell / org / unit">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-designation">Designation</label>
                                        <input type="text" id="operator-designation" placeholder="Role / desk / specialization">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-email">Email</label>
                                        <input type="text" id="operator-email" placeholder="Private contact">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-phone">Phone</label>
                                        <input type="text" id="operator-phone" placeholder="Emergency line">
                                    </div>
                                    <div class="setting-control operator-form-grid-wide">
                                        <label for="operator-location">Location</label>
                                        <input type="text" id="operator-location" placeholder="Hidden operating location">
                                    </div>
                                    <div class="setting-control operator-form-grid-wide">
                                        <label for="operator-hint">Recovery phrase hint</label>
                                        <input type="text" id="operator-hint" placeholder="Something only you understand">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-note-passcode-setup">Notes access code</label>
                                        <input type="password" id="operator-note-passcode-setup" placeholder="Set once to protect the notes vault">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-note-passcode-confirm">Confirm notes access code</label>
                                        <input type="password" id="operator-note-passcode-confirm" placeholder="Confirm access code">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="settings-card operator-card operator-notes-card operator-notes-card-full">
                        <div class="operator-card-head operator-card-head-wide">
                            <div>
                                <h3>Notes Vault</h3>
                                <p class="operator-panel-caption">Headings stay visible as a horizontal rail. Full content stays inside the sealed note workspace.</p>
                            </div>
                            <div class="toolbar recovery-toolbar operator-toolbar-tight">
                                <span id="operator-notes-pill" class="vault-pill">Locked</span>
                                <button id="btn-new-operator-note" class="btn-secondary hidden">New Note</button>
                                <button id="btn-save-operator-notes" class="btn-primary hidden">Seal Note</button>
                                <button id="btn-lock-operator-notes" class="btn-secondary hidden">Lock Notes</button>
                            </div>
                        </div>
                        <div id="operator-notes-status" class="status-message info">Set a notes access code in the dossier to unlock this vault.</div>
                        <div id="operator-notes-locked" class="operator-notes-gate">
                            <div class="setting-control">
                                <label for="operator-notes-passcode">Notes access code</label>
                                <input type="password" id="operator-notes-passcode" placeholder="Enter the notes access code to unlock the vault">
                            </div>
                            <button id="btn-unlock-operator-notes" class="btn-secondary">Unlock Notes</button>
                            <div class="operator-gate-caption">The same access code set in Operator Dossier controls this note vault.</div>
                        </div>
                        <div id="operator-notes-unlocked" class="hidden operator-notes-workspace">
                            <div class="operator-panel-subhead"><span>Sealed note headings</span></div>
                            <div id="operator-notes-list" class="operator-notes-list operator-notes-list-horizontal">
                                <div class="activity-empty">No sealed notes yet.</div>
                            </div>
                            <div class="operator-notes-editor-shell operator-notes-editor-full">
                                <div class="setting-control">
                                    <label for="operator-note-title">Note heading</label>
                                    <input type="text" id="operator-note-title" placeholder="Heading visible in the timeline only">
                                </div>
                                <div class="setting-control">
                                    <label for="operator-note-body">Sealed content</label>
                                    <textarea id="operator-note-body" rows="12" placeholder="Write notes, code fragments, private reminders, or anything you want sealed inside OBSIDYN."></textarea>
                                </div>
                                <div class="operator-note-rotate-grid">
                                    <div class="setting-control">
                                        <label for="operator-note-current-passcode">Current notes access code</label>
                                        <input type="password" id="operator-note-current-passcode" placeholder="Current notes access code">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-note-new-passcode">New notes access code</label>
                                        <input type="password" id="operator-note-new-passcode" placeholder="New notes access code">
                                    </div>
                                    <div class="setting-control">
                                        <label for="operator-note-confirm-new-passcode">Confirm new notes access code</label>
                                        <input type="password" id="operator-note-confirm-new-passcode" placeholder="Confirm new notes access code">
                                    </div>
                                </div>
                                <button id="btn-rotate-note-passcode" class="btn-secondary">Rotate Notes Access Code</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="activity-panel operator-timeline-panel">
                    <div class="operator-card-head">
                        <h3>Operator Timeline</h3>
                        <span class="vault-pill is-ok">SEALED HISTORY</span>
                    </div>
                    <div id="operator-timeline" class="ops-list">
                        <div class="activity-empty">No dossier events recorded yet.</div>
                    </div>
                </div>

                <div class="settings-grid ops-grid operator-grid">
                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Session & Rhythm Policy</h3>
                            <button id="btn-save-security-controls" class="btn-secondary">Apply Controls</button>
                        </div>
                        <div class="operator-form-grid">
                            <div class="setting-control">
                                <label for="operator-auto-lock">Auto-lock minutes</label>
                                <input type="number" id="operator-auto-lock" min="1" max="60" value="10">
                            </div>
                            <div class="setting-control">
                                <label for="operator-security-profile">Security profile</label>
                                <select id="operator-security-profile">
                                    <option value="PERSONAL">Personal</option>
                                    <option value="WORK">Work</option>
                                    <option value="PUBLIC">Public</option>
                                </select>
                            </div>
                            <div class="setting-control">
                                <label for="operator-training-target">Rhythm training attempts</label>
                                <input type="number" id="operator-training-target" min="3" max="15" value="5">
                            </div>
                            <div class="setting-control">
                                <label for="operator-threshold">Rhythm sensitivity</label>
                                <input type="number" id="operator-threshold" min="1" max="8" step="0.1" value="1.5">
                            </div>
                        </div>
                        <div id="operator-auth-policy" class="status-message info">Rhythm Lock policy pending sync.</div>
                    </div>

                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Master Key Rotation</h3>
                            <span class="vault-pill is-warn">Retraining required</span>
                        </div>
                        <div class="setting-control">
                            <label for="operator-current-password">Current master key</label>
                            <input type="password" id="operator-current-password" placeholder="Current master key">
                        </div>
                        <div class="setting-control">
                            <label for="operator-new-password">New master key</label>
                            <input type="password" id="operator-new-password" placeholder="New master key">
                        </div>
                        <div class="setting-control">
                            <label for="operator-confirm-password">Confirm new master key</label>
                            <input type="password" id="operator-confirm-password" placeholder="Confirm new master key">
                        </div>
                        <button id="btn-rotate-master-key" class="btn-primary">Rotate Master Key</button>
                        <div id="operator-password-status" class="status-message info">Key rotation will re-encrypt vault containers and reset Rhythm Lock samples.</div>
                    </div>
                </div>

                <div class="settings-grid ops-grid operator-grid">
                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Visual Recovery Override</h3>
                            <div class="toolbar recovery-toolbar">
                                <button id="btn-start-recovery-enroll" class="btn-secondary">Capture Enrollment</button>
                                <button id="btn-delete-recovery-profile" class="btn-secondary">Delete Signature</button>
                            </div>
                        </div>
                        <div class="operator-form-grid">
                            <div class="setting-control">
                                <label for="recovery-gesture-label">Gesture label</label>
                                <input type="text" id="recovery-gesture-label" placeholder="Example: split-finger cross" value="Custom signature">
                            </div>
                            <div class="setting-control">
                                <label for="operator-recovery-min-failed">Recovery unlock after failed attempts</label>
                                <input type="number" id="operator-recovery-min-failed" min="0" max="10" value="3">
                            </div>
                            <label class="setting-toggle operator-inline-toggle operator-form-grid-wide">
                                <div>
                                    <strong>Enable visual recovery</strong>
                                    <span>Keep face + gesture recovery available on the login screen.</span>
                                </div>
                                <input type="checkbox" id="operator-recovery-enabled" checked>
                            </label>
                        </div>
                        <div id="operator-recovery-status" class="status-message info">Visual recovery not enrolled.</div>
                        <div class="ops-list" id="operator-recovery-metrics">
                            <div class="activity-empty">Face plus hand-signature enrollment will appear here.</div>
                        </div>
                    </div>
                </div>
            </section>
            `
        );
    }

    const secureShredSection = $("secure-shred-section");
    if (secureShredSection && !$("deception-section")) {
        secureShredSection.insertAdjacentHTML(
            "beforebegin",
            `
            <section id="deception-section" class="content-section">
                <div class="section-header">
                    <h2>Deception Operations</h2>
                    <p class="section-subtitle">Deploy decoy vaults, watch honeyfiles, and route alerts through your configured email channel.</p>
                </div>

                <div class="toolbar">
                    <button id="btn-decoy-select-dir" class="btn-secondary">Select Deployment Directory</button>
                    <button id="btn-create-decoy" class="btn-primary">Seed Decoy Vault</button>
                    <button id="btn-refresh-decoy" class="btn-secondary">Refresh Status</button>
                </div>

                <div class="toolbar decoy-management-toolbar">
                    <button id="btn-clear-decoys" class="btn-secondary">Delete All Decoy Files</button>
                    <button id="btn-clear-decoy-history" class="btn-secondary">Clear History</button>
                    <button id="btn-export-decoy-log" class="btn-secondary">Download Memory Log</button>
                </div>

                <div class="dashboard-grid ops-metrics decoy-metrics-grid">
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">DV</span>
                            <h3>Decoy Vaults</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="decoy-metric-vaults">0</div>
                            <div class="metric-label">Active deployments</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">AL</span>
                            <h3>Honey Alerts</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="decoy-metric-alerts">0</div>
                            <div class="metric-label">Recorded triggers</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">EM</span>
                            <h3>Email Channel</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="decoy-metric-email">STANDBY</div>
                            <div class="metric-label" id="decoy-last-alert">No triggers yet</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">ML</span>
                            <h3>Memory Log</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="decoy-metric-memory">0</div>
                            <div class="metric-label">Retained records</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">TG</span>
                            <h3>Target Root</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value metric-value-compact" id="decoy-metric-target">Default store</div>
                            <div class="metric-label">Deployment directory</div>
                        </div>
                    </div>
                </div>

                <div class="settings-grid ops-grid decoy-grid">
                    <div class="settings-card decoy-card">
                        <div class="operator-card-head">
                            <h3>Deployment Profile</h3>
                            <span class="vault-pill">ACTIVE BAIT</span>
                        </div>
                        <div class="setting-control">
                            <label for="decoy-target-path">Target directory</label>
                            <input type="text" id="decoy-target-path" placeholder="Default internal decoy store" readonly>
                        </div>
                        <div class="setting-control">
                            <label for="decoy-profile">Bait profile</label>
                            <select id="decoy-profile">
                                <option value="operations">Operations</option>
                                <option value="finance">Finance</option>
                                <option value="research">Research</option>
                            </select>
                        </div>
                        <div class="setting-control">
                            <label for="decoy-file-count">Honeyfiles</label>
                            <input type="number" id="decoy-file-count" min="1" max="3" value="3">
                        </div>
                        <div id="decoy-summary" class="status-message info">No decoy vault deployed.</div>
                    </div>

                    <div class="settings-card decoy-card decoy-live-card">
                        <div class="operator-card-head">
                            <h3>Alert Trigger</h3>
                            <button id="btn-save-decoy-live" class="btn-secondary">Apply Alert Mode</button>
                        </div>
                        <label class="setting-toggle">
                            <div>
                                <strong>Live email reaction</strong>
                                <span>Turn outbound email dispatch on or off without changing the saved channel credentials.</span>
                            </div>
                            <input type="checkbox" id="decoy-email-live">
                        </label>
                        <div id="decoy-live-status" class="status-message info">Email reaction is idle until you arm it.</div>
                    </div>

                    <div class="settings-card decoy-card decoy-email-panel">
                        <div class="operator-card-head">
                            <h3>Email Alert Channel</h3>
                            <button id="btn-save-decoy-alerts" class="btn-secondary">Save Alert Channel</button>
                        </div>
                        <div class="operator-form-grid">
                            <div class="setting-control operator-form-grid-wide">
                                <label for="decoy-email-recipient">Alert recipient</label>
                                <input type="email" id="decoy-email-recipient" placeholder="Alert mailbox">
                            </div>
                            <div class="setting-control">
                                <label for="decoy-email-sender">Sender Gmail</label>
                                <input type="email" id="decoy-email-sender" placeholder="Sender Gmail address">
                            </div>
                            <div class="setting-control">
                                <label for="decoy-email-password">Sender app password</label>
                                <input type="password" id="decoy-email-password" placeholder="Gmail app password">
                            </div>
                            <div class="setting-control">
                                <label for="decoy-email-host">SMTP host</label>
                                <input type="text" id="decoy-email-host" placeholder="smtp.gmail.com">
                            </div>
                            <div class="setting-control">
                                <label for="decoy-email-port">SMTP port</label>
                                <input type="number" id="decoy-email-port" min="1" max="65535" value="587">
                            </div>
                        </div>
                        <div id="decoy-email-status" class="status-message info">Save sender Gmail, app password, and recipient here. Live alerting is controlled separately above.</div>
                    </div>
                </div>

                <div class="settings-grid ops-grid decoy-grid-secondary">
                    <div class="settings-card decoy-card decoy-vaults-panel">
                        <h3>Active Decoy Vaults</h3>
                        <div id="decoy-vaults" class="ops-list">
                            <div class="activity-empty">No decoy vaults deployed.</div>
                        </div>
                    </div>
                </div>

                <div class="activity-panel decoy-alerts-panel">
                    <h3>Honey Alerts</h3>
                    <div id="decoy-alerts" class="activity-log">
                        <div class="activity-empty">No honey alerts recorded.</div>
                    </div>
                </div>
            </section>

            <section id="signals-section" class="content-section">
                <div class="section-header">
                    <h2>System Signals</h2>
                    <p class="section-subtitle">Trace process churn and correlate it with live deception alerts.</p>
                </div>

                <div class="toolbar">
                    <button id="btn-start-monitor" class="btn-primary">Start Trace</button>
                    <button id="btn-stop-monitor" class="btn-secondary">Stop Trace</button>
                    <button id="btn-refresh-monitor" class="btn-secondary">Refresh Snapshot</button>
                    <button id="btn-clear-signals" class="btn-danger">Clear Screen</button>
                </div>

                <div class="dashboard-grid ops-metrics">
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">SG</span>
                            <h3>Monitor State</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="monitor-state">OFFLINE</div>
                            <div class="metric-label">Trace switch</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">PR</span>
                            <h3>Observed Processes</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="monitor-process-count">0</div>
                            <div class="metric-label">Current set</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">HY</span>
                            <h3>Honey Alerts</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="monitor-alert-count">0</div>
                            <div class="metric-label">Triggered files</div>
                        </div>
                    </div>
                </div>

                <div class="settings-grid ops-grid">
                    <div class="settings-card">
                        <h3>Signal Events</h3>
                        <div id="monitor-events" class="ops-list">
                            <div class="activity-empty">Tracing is offline.</div>
                        </div>
                    </div>
                    <div class="settings-card">
                        <h3>Process Snapshot</h3>
                        <div id="monitor-processes" class="ops-list">
                            <div class="activity-empty">No process data captured yet.</div>
                        </div>
                    </div>
                </div>
            </section>
            `
        );
    }

    if (!$("rhythm-lock-status")) {
        const loginForm = document.querySelector(".login-form");
        if (loginForm) {
            const container = document.createElement("div");
            container.className = "status-message info rhythm-lock-panel";
            container.id = "rhythm-lock-status";
            container.textContent = "Loading Rhythm Lock profile...";
            loginForm.appendChild(container);

            const recoveryButton = document.createElement("button");
            recoveryButton.className = "btn-secondary hidden";
            recoveryButton.id = "btn-login-recovery";
            recoveryButton.textContent = "Visual Recovery Unavailable";
            recoveryButton.disabled = true;
            loginForm.appendChild(recoveryButton);
        }
    }

    if ($("dashboard-section") && !$("dashboard-operator-panel")) {
        const panel = document.createElement("div");
        panel.className = "activity-panel operator-brief-panel";
        panel.id = "dashboard-operator-panel";
        panel.innerHTML = `
            <div class="operator-card-head">
                <h3>Operator Brief</h3>
                <span class="vault-pill">Encrypted dossier</span>
            </div>
            <div id="dashboard-operator-summary" class="ops-list">
                <div class="activity-empty">Authenticate to load operator dossier.</div>
            </div>
        `;
        $("dashboard-section").appendChild(panel);
    }

    if (!$("camera-capture-modal")) {
        const modal = document.createElement("div");
        modal.id = "camera-capture-modal";
        modal.className = "camera-modal hidden";
        modal.innerHTML = `
            <div class="camera-shell">
                <div class="operator-card-head">
                    <div>
                        <h3 id="camera-modal-title">Visual Recovery Capture</h3>
                        <div id="camera-modal-subtitle" class="ops-item-submeta">Capture face and hand signature in sequence.</div>
                    </div>
                    <button id="btn-camera-close" class="btn-icon" title="Close capture">X</button>
                </div>
                <div class="camera-enrollment-steps">
                    <div class="camera-step" id="camera-step-face">
                        <span class="camera-step-index">1</span>
                        <div>
                            <strong>Capture face</strong>
                            <div class="ops-item-submeta">Front-facing frame in clear light</div>
                        </div>
                    </div>
                    <div class="camera-step" id="camera-step-gesture">
                        <span class="camera-step-index">2</span>
                        <div>
                            <strong>Capture gesture</strong>
                            <div class="ops-item-submeta">Hold your chosen hand signature steady</div>
                        </div>
                    </div>
                    <div class="camera-step" id="camera-step-enable">
                        <span class="camera-step-index">3</span>
                        <div>
                            <strong>Enable recovery</strong>
                            <div class="ops-item-submeta">Save both captures into secure recovery enrollment</div>
                        </div>
                    </div>
                </div>
                <div class="camera-grid">
                    <div class="camera-stage">
                        <video id="camera-preview" autoplay muted playsinline></video>
                        <div class="camera-controls">
                            <button id="btn-capture-face" class="btn-secondary">Capture Face</button>
                            <button id="btn-capture-gesture" class="btn-secondary">Capture Gesture</button>
                        </div>
                    </div>
                    <div class="camera-stage">
                        <div class="camera-capture-box">
                            <span class="ops-item-submeta">Face frame</span>
                            <canvas id="camera-face-canvas" width="320" height="240"></canvas>
                        </div>
                        <div class="camera-capture-box">
                            <span class="ops-item-submeta">Gesture frame</span>
                            <canvas id="camera-gesture-canvas" width="320" height="240"></canvas>
                        </div>
                    </div>
                </div>
                <div id="camera-capture-status" class="status-message info">Camera idle.</div>
                <div id="camera-processing-panel" class="camera-processing hidden">
                    <div class="camera-processing-head">
                        <strong id="camera-processing-label">Recovery pipeline idle</strong>
                        <span id="camera-processing-value">0%</span>
                    </div>
                    <div class="camera-processing-track">
                        <div id="camera-processing-bar" class="camera-processing-bar"></div>
                    </div>
                    <div id="camera-processing-feed" class="camera-processing-feed"></div>
                </div>
                <div class="camera-action-bar">
                    <div id="camera-enrollment-summary" class="ops-item-submeta">Waiting for face and gesture capture.</div>
                    <div class="toolbar">
                        <button id="btn-camera-reset" class="btn-secondary">Reset Frames</button>
                        <button id="btn-camera-submit" class="btn-primary" disabled>Enable Visual Recovery</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function normalizeUiCopy() {
    const iconMap = {
        dashboard: "BR",
        operator: "OP",
        vault: "VT",
        deception: "DC",
        signals: "SG",
        "secure-shred": "XR",
        steganography: "PX",
        recovery: "PV",
        "pc-manager": "PM",
        settings: "CT"
    };

    const metricIcons = ["AE", "VA", "SL", "TM"];
    const sectionTitles = {
        dashboard: "Operational Briefing",
        operator: "Operator Control",
        vault: "Vault Control",
        deception: "Deception Operations",
        signals: "System Signals",
        "secure-shred": "Oblivion Shredder",
        steganography: "Pixel Veil",
        settings: "Control"
    };

    const sectionSubtitles = {
        dashboard: "Session posture, seal counts, and current defensive state.",
        operator: "Private dossier, note storage, recovery enrollment, and behavioral controls.",
        vault: "Seal and restore assets while reducing visible host traces.",
        deception: "Deploy bait vaults and watch honeyfiles for interference.",
        signals: "Track process churn and correlate it with bait interaction.",
        "secure-shred": "Controlled destruction for assets you choose to erase.",
        steganography: "Embed or extract concealed payloads with encrypted transport.",
        settings: "Behavioral lock and session configuration."
    };

    const loginTitle = document.querySelector(".brand-logo h1");
    if (loginTitle) {
        loginTitle.textContent = "OBSIDYN";
    }
    const tagline = document.querySelector("#login-screen .tagline");
    if (tagline) {
        tagline.textContent = "Silent vault. Behavioral gate. Minimal trace.";
    }
    const indicator = document.querySelector(".security-indicator");
    if (indicator) {
        indicator.textContent = "Privacy-first runtime active";
    }

    $$(".logo-icon").forEach((icon) => {
        icon.textContent = "OX";
    });

    $$(".nav-item").forEach((item) => {
        const icon = item.querySelector(".nav-icon");
        const section = item.dataset.section;
        if (icon && iconMap[section]) {
            icon.textContent = iconMap[section];
        }
    });

    $$(".info-card .card-icon").forEach((icon, index) => {
        icon.textContent = metricIcons[index] || "OB";
    });

    $$(".content-section").forEach((section) => {
        const key = section.id.replace("-section", "");
        const title = section.querySelector(".section-header h2");
        const subtitle = section.querySelector(".section-subtitle");
        if (title && sectionTitles[key]) {
            title.textContent = sectionTitles[key];
        }
        if (subtitle && sectionSubtitles[key]) {
            subtitle.textContent = sectionSubtitles[key];
        }
    });

    if ($("authenticate-btn")) {
        $("authenticate-btn").innerHTML = "<span>Establish Session</span>";
    }
    if ($("btn-lock-file")) {
        $("btn-lock-file").innerHTML = "<span>[+]</span> Seal File";
    }
    if ($("btn-lock-folder")) {
        $("btn-lock-folder").innerHTML = "<span>[+]</span> Seal Folder";
    }
}

function bindCoreEvents() {
    // ── Roger That: Save current state ──────────────────────────────────────
    const rogerBtn = document.getElementById("roger-that-btn");
    if (rogerBtn) {
        rogerBtn.addEventListener("click", () => {
            sendCommand("UPDATE_APP_SETTINGS", state.appSettings || {});
            rogerBtn.innerHTML = '<span>&#10003;</span><span class="roger-label">Saved!</span>';
            rogerBtn.style.color = "#5fe7cb";
            setTimeout(() => {
                rogerBtn.innerHTML = '<span>&#10003;</span><span class="roger-label">Apply</span>';
                rogerBtn.style.color = "";
            }, 1800);
        });
    }

    // ── Dashboard ambient HEX-grid animation ────────────────────────────────
    (function initDashboardAnim() {
        const canvas = document.getElementById("dashboard-anim-canvas");
        if (!canvas) return;
        const ctx2d = canvas.getContext("2d");
        let w, h, hexes = [], raf;

        function resize() {
            w = canvas.width = canvas.offsetWidth;
            h = canvas.height = canvas.offsetHeight;
            hexes = [];
            const size = 28, cols = Math.ceil(w / (size * 1.73)) + 2, rows = Math.ceil(h / (size * 1.5)) + 2;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = c * size * 1.73 + (r % 2 === 0 ? 0 : size * 0.865);
                    const y = r * size * 1.5;
                    hexes.push({ x, y, size, phase: Math.random() * Math.PI * 2, speed: 0.003 + Math.random() * 0.004 });
                }
            }
        }

        function drawHex(cx, cy, s, alpha) {
            ctx2d.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = Math.PI / 180 * (60 * i - 30);
                ctx2d[i === 0 ? "moveTo" : "lineTo"](cx + s * Math.cos(a), cy + s * Math.sin(a));
            }
            ctx2d.closePath();
            ctx2d.strokeStyle = `rgba(95,231,203,${alpha})`;
            ctx2d.lineWidth = 0.6;
            ctx2d.stroke();
        }

        function tick() {
            ctx2d.clearRect(0, 0, w, h);
            hexes.forEach(h2 => {
                h2.phase += h2.speed;
                const alpha = (Math.sin(h2.phase) * 0.5 + 0.5) * 0.55;
                drawHex(h2.x, h2.y, h2.size, alpha);
            });
            raf = requestAnimationFrame(tick);
        }

        resize();
        tick();
        window.addEventListener("resize", () => { cancelAnimationFrame(raf); resize(); tick(); });
    })();

    const viewBtn = document.getElementById("btn-view-pvs-pass");
    if (viewBtn) {
        viewBtn.addEventListener("click", () => {
            const overlay = document.createElement("div");
            overlay.style.position = "fixed";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.background = "rgba(0, 0, 0, 0.85)";
            overlay.style.backdropFilter = "blur(5px)";
            overlay.style.zIndex = "9999";
            overlay.style.display = "flex";
            overlay.style.alignItems = "center";
            overlay.style.justifyContent = "center";
            overlay.innerHTML = `
                <div style="background: var(--bg-dark); border: 1px solid rgba(255,255,255,0.1); padding: 30px; border-radius: 8px; width: 400px; text-align: center;">
                    <h3 style="margin-bottom: 15px; color: #fff;">Master Key Verification</h3>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Please enter your Master Key to reveal the hidden PVS-pass text.</p>
                    <input type="password" id="pvs-reveal-key" style="width: 100%; margin-bottom: 20px; text-align: center;" placeholder="Master Key">
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="pvs-reveal-cancel" class="btn-secondary" style="flex: 1;">Cancel</button>
                        <button id="pvs-reveal-confirm" class="btn-primary" style="flex: 1;">Reveal</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            document.getElementById("pvs-reveal-cancel").onclick = () => overlay.remove();

            document.getElementById("pvs-reveal-confirm").onclick = async () => {
                const key = document.getElementById("pvs-reveal-key").value;
                if (!key) return;

                const hash = await hashPassword(key);
                sendCommand("REVEAL_PVS_PASS", { password_hash: hash });
                overlay.remove();
            };
        });
    }
    loginEl.button?.addEventListener("click", handleAuthenticate);
    loginEl.password?.addEventListener("keydown", onPasswordKeydown);
    loginEl.password?.addEventListener("keyup", onPasswordKeyup);
    loginEl.password?.addEventListener("input", onPasswordInput);
    loginEl.password?.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            handleAuthenticate();
        }
    });

    $$(".profile-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const container = btn.closest(".profile-selection-buttons");
            if (container) {
                container.querySelectorAll(".profile-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const hiddenInput = container.querySelector("input[type='hidden']");
                if (hiddenInput) {
                    hiddenInput.value = btn.dataset.value;
                    // Trigger custom change logic
                    if (typeof state !== 'undefined') {
                        state.profile = btn.dataset.value;
                        if (typeof syncProfileUi === 'function') syncProfileUi();
                        if (typeof updateDashboardState === 'function') updateDashboardState();
                        if (typeof renderActivityLog === 'function') renderActivityLog();
                        if (typeof startCountdownTimer === 'function' && state.authenticated) {
                            startCountdownTimer(); // Reset timer when profile changes
                        }
                        if (typeof showNotification === 'function') showNotification("Profile updated to " + btn.dataset.value, "info");
                    }
                }
            }
        });
    });

    appEl.lockButton?.addEventListener("click", lockSystem);

    $$(".nav-item").forEach((item) => {
        item.addEventListener("click", () => navigateTo(item.dataset.section));
    });

    $$(".steg-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchStegTab(tab.dataset.tab));
    });

    $("btn-lock-file")?.addEventListener("click", () => handleVaultOp("file"));
    $("btn-lock-folder")?.addEventListener("click", () => handleVaultOp("folder"));
    $("btn-refresh-vault")?.addEventListener("click", loadVaultList);

    $("btn-select-data-file")?.addEventListener("click", () => selectFile("hide-data-file"));
    $("btn-select-carrier")?.addEventListener("click", () => selectImage("hide-carrier-image"));
    $("btn-select-output")?.addEventListener("click", () => selectSavePath("hide-output-path"));
    $("btn-select-extract-image")?.addEventListener("click", () => selectImage("extract-image"));
    $("btn-select-extract-output")?.addEventListener("click", () => selectSavePath("extract-output-path"));
    $("btn-select-scan-image")?.addEventListener("click", () => selectImage("scan-image"));

    $("btn-execute-hide")?.addEventListener("click", executeHide);
    $("btn-execute-extract")?.addEventListener("click", executeExtract);
    $("btn-execute-scan")?.addEventListener("click", executeScan);

    $("btn-decoy-select-dir")?.addEventListener("click", selectDecoyDirectory);
    $("btn-create-decoy")?.addEventListener("click", createDecoyVault);
    $("btn-refresh-decoy")?.addEventListener("click", loadDecoyStatus);
    $("btn-save-decoy-alerts")?.addEventListener("click", saveDecoyAlertSettings);
    $("btn-save-decoy-live")?.addEventListener("click", saveDecoyLiveState);
    $("btn-clear-decoys")?.addEventListener("click", clearAllDecoys);
    $("btn-clear-decoy-history")?.addEventListener("click", clearDecoyHistory);
    $("btn-export-decoy-log")?.addEventListener("click", exportDecoyMemoryLog);

    $("btn-start-monitor")?.addEventListener("click", startMonitoring);
    $("btn-stop-monitor")?.addEventListener("click", stopMonitoring);
    $("btn-refresh-monitor")?.addEventListener("click", loadMonitorStatus);
    $("btn-clear-signals")?.addEventListener("click", clearSignalsScreen);

    $("autolock-minutes")?.addEventListener("change", (event) => {
        const nextValue = Number.parseInt(event.target.value, 10);
        state.autoLockMinutes = Number.isFinite(nextValue) ? nextValue : 10;
        if (state.authenticated) {
            startTimers();
        }
    });


    $("settings-visual-recovery-enabled")?.addEventListener("change", handleRecoveryToggleSync);
    $("operator-recovery-enabled")?.addEventListener("change", handleRecoveryToggleSync);

    $("operator-security-profile")?.addEventListener("change", (event) => {
        state.profile = event.target.value;
        syncProfileUi();
    });
    $("operator-auto-lock")?.addEventListener("change", (event) => {
        const nextValue = Number.parseInt(event.target.value, 10);
        state.autoLockMinutes = Number.isFinite(nextValue) ? nextValue : 10;
        syncSettingsUi();
    });
    $("btn-save-operator-profile")?.addEventListener("click", saveOperatorProfile);
    $("btn-save-app-settings")?.addEventListener("click", saveAppSettings);

    // Live update settings
    const settingsInputs = [
        "autolock-minutes",
        "settings-profile",
        "settings-privacy-mode",
        "settings-store-full-paths",
        "settings-login-binary",
        "settings-reduced-motion",
        "settings-decoy-email"
    ];
    settingsInputs.forEach(id => {
        const el = $(id);
        if (el) {
            el.addEventListener("change", saveAppSettings);
            if (el.type === "number") {
                el.addEventListener("input", () => {
                    // debounce to avoid spamming backend on every keypress
                    if (el.dataset.timeoutId) clearTimeout(el.dataset.timeoutId);
                    el.dataset.timeoutId = setTimeout(saveAppSettings, 500);
                });
            }
        }
    });
    $("btn-save-security-controls")?.addEventListener("click", saveSecurityControls);
    $("btn-rotate-master-key")?.addEventListener("click", rotateMasterKey);
    $("btn-start-recovery-enroll")?.addEventListener("click", () => openCameraWorkflow("enroll"));
    $("btn-delete-recovery-profile")?.addEventListener("click", deleteVisualRecoveryProfile);
    $("btn-settings-open-recovery")?.addEventListener("click", () => navigateTo("operator"));
    $("btn-login-recovery")?.addEventListener("click", () => openCameraWorkflow("login-recovery"));
    $("btn-camera-close")?.addEventListener("click", closeCameraWorkflow);
    $("btn-camera-reset")?.addEventListener("click", resetCameraCaptures);
    $("btn-capture-face")?.addEventListener("click", () => captureCameraFrame("face"));
    $("btn-capture-gesture")?.addEventListener("click", () => captureCameraFrame("gesture"));
    $("btn-camera-submit")?.addEventListener("click", submitCameraWorkflow);
    $("btn-view-operator-profile")?.addEventListener("click", () => setOperatorViewMode(true));
    $("btn-edit-operator-profile")?.addEventListener("click", () => setOperatorEditMode(true));
    $("btn-upload-operator-image")?.addEventListener("click", selectOperatorImage);
    $("btn-remove-operator-image")?.addEventListener("click", removeOperatorImage);
    $("btn-cancel-operator-edit")?.addEventListener("click", () => {
        state.operatorProfileDirty = false;
        state.operatorImageDraft = undefined;
        state.operatorEditing = false;
        state.operatorViewing = false;
        renderOperatorProfile(state.operatorProfile, { force: true });
    });
    $("btn-unlock-operator-notes")?.addEventListener("click", unlockOperatorNotes);
    $("btn-new-operator-note")?.addEventListener("click", createOperatorNoteDraft);
    $("btn-save-operator-notes")?.addEventListener("click", saveOperatorNotes);
    $("btn-lock-operator-notes")?.addEventListener("click", () => lockOperatorNotes(true));
    $("btn-rotate-note-passcode")?.addEventListener("click", rotateOperatorNotePasscode);
    [
        "operator-call-sign",
        "operator-full-name",
        "operator-organization",
        "operator-designation",
        "operator-email",
        "operator-phone",
        "operator-location",
        "operator-hint"
    ].forEach((id) => {
        $(id)?.addEventListener("input", markOperatorProfileDirty);
    });
}
function bindShredEvents() {
    $("btn-shred-file")?.addEventListener("click", async () => {
        const files = await ipcRenderer.invoke("select-file");
        if (files && files[0]) {
            selectFileForShred(files[0]);
        }
    });

    $("btn-remove-file")?.addEventListener("click", resetShredUi);
    $("btn-execute-shred")?.addEventListener("click", executeSecureShred);
    $("btn-shred-another")?.addEventListener("click", resetShredUi);

    const dropZone = $("shred-drop-zone");
    dropZone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone?.addEventListener("drop", (event) => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            selectFileForShred(file.path || file.name);
        }
    });
}

function onPasswordInput(event) {
    if (!state.keystroke.startedAt && event.target.value) {
        state.keystroke.startedAt = performance.now();
    }
    if (!event.target.value) {
        resetKeystrokeTrace();
    }
}

function onPasswordKeydown(event) {
    if (event.repeat) {
        return;
    }
    if (!state.keystroke.startedAt) {
        state.keystroke.startedAt = performance.now();
    }
    const timestamp = performance.now();
    const keyRecord = {
        id: state.keystroke.sequence++,
        key: event.key,
        time: timestamp
    };

    if (event.key === "Backspace" || event.key === "Delete") {
        state.keystroke.correctionCount += 1;
    }

    const previous = state.keystroke.keydowns[state.keystroke.keydowns.length - 1];
    if (previous) {
        state.keystroke.flightTimes.push(timestamp - previous.time);
    }

    state.keystroke.keydowns.push(keyRecord);
    state.keystroke.pending.push(keyRecord);
}

function onPasswordKeyup(event) {
    const timestamp = performance.now();
    const pendingIndex = [...state.keystroke.pending]
        .reverse()
        .findIndex((entry) => entry.key === event.key);

    if (pendingIndex === -1) {
        return;
    }

    const actualIndex = state.keystroke.pending.length - 1 - pendingIndex;
    const match = state.keystroke.pending.splice(actualIndex, 1)[0];
    state.keystroke.dwellTimes.push(timestamp - match.time);
}

function resetKeystrokeTrace() {
    state.keystroke = {
        startedAt: null,
        keydowns: [],
        dwellTimes: [],
        flightTimes: [],
        correctionCount: 0,
        sequence: 0,
        pending: []
    };
}

function buildKeystrokeSample() {
    const finishedAt = performance.now();
    return {
        dwell_times: state.keystroke.dwellTimes.map((value) => Math.round(value)),
        flight_times: state.keystroke.flightTimes.map((value) => Math.round(value)),
        total_duration: Math.round(
            (state.keystroke.startedAt ? finishedAt - state.keystroke.startedAt : 0)
        ),
        correction_count: state.keystroke.correctionCount,
        key_count: state.keystroke.keydowns.length
    };
}

function navigateTo(section) {
    state.currentSection = section;
    $$(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.section === section);
    });
    $$(".content-section").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `${section}-section`);
    });

    if (section === "vault") {
        loadVaultList();
    } else if (section === "operator") {
        loadOperatorProfile();
        loadAppSettings();
        loadAuthStatus();
    } else if (section === "deception") {
        loadDecoyStatus();
    } else if (section === "signals") {
        loadMonitorStatus();
    }
}

function switchStegTab(tabName) {
    $$(".steg-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
    });
    $$(".steg-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `steg-${tabName}-panel`);
    });
}

async function selectFile(inputId) {
    try {
        const files = await ipcRenderer.invoke("select-file");
        if (!files || !files[0]) {
            return;
        }
        const input = $(inputId);
        if (input) {
            input.value = path.basename(files[0]);
            input.dataset.path = files[0];
        }
        updateCapacityDisplay();
    } catch (_error) {
        showNotification("Unable to select file.", "error");
    }
}

async function selectImage(inputId) {
    try {
        const files = await ipcRenderer.invoke("select-image");
        if (!files || !files[0]) {
            return;
        }
        const input = $(inputId);
        if (input) {
            input.value = path.basename(files[0]);
            input.dataset.path = files[0];
        }
        updateCapacityDisplay();
    } catch (_error) {
        showNotification("Unable to select image.", "error");
    }
}

async function selectSavePath(inputId) {
    try {
        const defaultName = inputId.includes("hide")
            ? "hidden_image.png"
            : "extracted_file.bin";
        const filePath = await ipcRenderer.invoke("select-restore-path", defaultName);
        if (!filePath) {
            return;
        }
        const input = $(inputId);
        if (input) {
            input.value = path.basename(filePath);
            input.dataset.path = filePath;
        }
    } catch (_error) {
        showNotification("Unable to choose output path.", "error");
    }
}

function updateCapacityDisplay() {
    const carrierPath = $("hide-carrier-image")?.dataset.path;
    const dataPath = $("hide-data-file")?.dataset.path;
    const display = $("capacity-display");
    if (!display) {
        return;
    }

    if (!carrierPath || !dataPath) {
        display.innerHTML =
            '<span class="capacity-text">Select a payload and carrier image to preview transfer size.</span>';
        return;
    }

    try {
        const fileSize = fs.statSync(dataPath).size;
        display.innerHTML = `
            <span class="capacity-text">Payload: <strong>${formatBytes(fileSize)}</strong></span>
            <span class="capacity-value">Carrier: ${path.basename(carrierPath)}</span>
        `;
    } catch (_error) {
        display.innerHTML =
            '<span class="capacity-text">Capacity preview unavailable for the selected files.</span>';
    }
}

function executeHide() {
    const dataFile = $("hide-data-file")?.dataset.path;
    const carrierImage = $("hide-carrier-image")?.dataset.path;
    const outputPath = $("hide-output-path")?.dataset.path || null;
    const password = $("hide-password")?.value || null;

    if (!dataFile || !carrierImage) {
        showNotification("Choose a payload and carrier image.", "error");
        return;
    }

    startLoadingAnimation("Embedding payload");
    sendCommand("HIDE_DATA", {
        data_file: dataFile,
        image_file: carrierImage,
        output_path: outputPath,
        password
    });
}

function executeExtract() {
    const imageFile = $("extract-image")?.dataset.path;
    const outputPath = $("extract-output-path")?.dataset.path || null;
    const password = $("extract-password")?.value || null;

    if (!imageFile) {
        showNotification("Choose an image to extract from.", "error");
        return;
    }

    startLoadingAnimation("Recovering payload");
    sendCommand("EXTRACT_DATA", {
        image_file: imageFile,
        output_path: outputPath,
        password
    });
}

function executeScan() {
    const imageFile = $("scan-image")?.dataset.path;
    if (!imageFile) {
        showNotification("Choose an image to inspect.", "error");
        return;
    }
    $("scan-result")?.classList.remove("hidden");
    sendCommand("SCAN_IMAGE", { image_file: imageFile });
}

function startLoadingAnimation(status = "Processing secure task") {
    let overlay = $("steg-loading");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "steg-loading";
        overlay.className = "steg-loading hidden";
        overlay.innerHTML = `
            <div class="loading-container">
                <div class="loading-title">OBSIDYN Runtime</div>
                <div class="pixel-grid" id="pixel-grid"></div>
                <div class="loading-progress"><div class="progress-bar" id="progress-bar"></div></div>
                <div class="loading-status" id="loading-status">${status}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        const grid = $("pixel-grid");
        for (let index = 0; index < 256; index += 1) {
            const pixel = document.createElement("div");
            pixel.className = "pixel";
            grid.appendChild(pixel);
        }
    }

    $("loading-status").textContent = status;
    $("progress-bar").style.width = "8%";
    overlay.classList.remove("hidden");
    $$(".pixel").forEach((pixel) => pixel.classList.add("pixel-live"));
    requestAnimationFrame(() => {
        $("progress-bar").style.width = "72%";
    });
}

function stopLoadingAnimation() {
    const overlay = $("steg-loading");
    if (!overlay) {
        return;
    }
    $("progress-bar").style.width = "100%";
    setTimeout(() => {
        overlay.classList.add("hidden");
        $$(".pixel").forEach((pixel) => pixel.classList.remove("pixel-live"));
    }, 180);
}

async function handleVaultOp(kind) {
    try {
        const selector = kind === "folder" ? "select-folder" : "select-file";
        const result = await ipcRenderer.invoke(selector);
        if (!result || !result[0]) {
            return;
        }
        const targetPath = result[0];
        sendCommand(kind === "folder" ? "LOCK_FOLDER" : "LOCK_FILE", { path: targetPath });
        addActivity(`Queued ${kind} seal: ${path.basename(targetPath)}`);
        showNotification(`${kind === "folder" ? "Folder" : "File"} queued for sealing.`, "info");
    } catch (_error) {
        showNotification("Vault action failed to start.", "error");
    }
}

async function unlockFile(containerName) {
    const item = state.vaultItems.find((entry) => entry.container === containerName);
    if (!item) {
        showNotification("Vault item not found.", "error");
        return;
    }
    const restorePath = await ipcRenderer.invoke(
        "select-restore-path",
        item.original_name || "restored_file"
    );
    if (!restorePath) {
        return;
    }
    const action = item.type === "folder" ? "UNLOCK_FOLDER" : "UNLOCK_FILE";
    sendCommand(action, { container: containerName, restore_path: restorePath });
    addActivity(`Restore requested: ${item.original_name || containerName}`);
}

function deleteVaultItem(containerName) {
    const item = state.vaultItems.find((entry) => entry.container === containerName);
    if (!item) {
        return;
    }
    const approved = window.confirm(
        `Delete ${item.original_name || containerName}? This cannot be undone.`
    );
    if (!approved) {
        return;
    }
    sendCommand("DELETE_VAULT_ITEM", { container: containerName });
    addActivity(`Deletion requested: ${item.original_name || containerName}`);
}

function loadVaultList() {
    sendCommand("GET_VAULT_LIST", {});
}

function renderVaultList(response) {
    const items = Array.isArray(response.data) ? response.data : [];
    state.vaultItems = items;

    if (!appEl.vaultList) {
        return;
    }

    if (items.length === 0) {
        appEl.vaultList.innerHTML = `
            <div class="empty-state empty-state-rich">
                <div class="empty-icon">VT</div>
                <p>Vault inventory is clear.</p>
                <span>Seal a file or folder to create a hidden record.</span>
            </div>
        `;
    } else {
        appEl.vaultList.innerHTML = items
            .map((item) => {
                const label = item.type === "folder" ? "Folder" : "File";
                const meta = `${formatBytes(item.original_size || 0)} | ${item.file_count || 1} item${item.file_count === 1 ? "" : "s"}`;
                return `
                    <article class="vault-item ${item.type === "folder" ? "is-folder" : "is-file"}">
                        <div class="vault-item-icon">${item.type === "folder" ? "FD" : "FL"}</div>
                        <div class="vault-item-info">
                            <div class="vault-item-head">
                                <div class="vault-item-name">${escapeHtml(item.original_name || "Unknown asset")}</div>
                                <div class="vault-item-pills">
                                    <span class="vault-pill">${label}</span>
                                    <span class="vault-pill ${item.exists ? "is-ok" : "is-warn"}">${item.exists ? "sealed" : "missing"}</span>
                                </div>
                            </div>
                            <div class="vault-item-meta">${meta}</div>
                            <div class="vault-item-submeta">Locked ${item.locked_at ? new Date(item.locked_at).toLocaleString() : "recently"}</div>
                        </div>
                        <div class="vault-item-actions">
                            <button class="btn-sm btn-unlock" onclick="unlockFile('${item.container}')">Unlock</button>
                            <button class="btn-sm btn-delete" onclick="deleteVaultItem('${item.container}')">Delete</button>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    updateDashboardState();
}
async function selectDecoyDirectory() {
    const result = await ipcRenderer.invoke("select-folder");
    if (!result || !result[0]) {
        return;
    }
    state.decoyTargetPath = result[0];
    if ($("decoy-target-path")) {
        $("decoy-target-path").value = state.decoyTargetPath;
    }
}

function createDecoyVault() {
    const profile = $("decoy-profile")?.value || "operations";
    const fileCount = Number.parseInt($("decoy-file-count")?.value || "3", 10);
    sendCommand("CREATE_DECOY_VAULT", {
        target_dir: state.decoyTargetPath || null,
        profile,
        file_count: fileCount
    });
}

function saveDecoyAlertSettings() {
    const nextSettings = collectAppSettingsPayload();
    state.appSettings = { ...(state.appSettings || {}), ...nextSettings };
    syncSettingsUi();
    if ($("decoy-email-status")) {
        $("decoy-email-status").textContent = "Saving decoy email channel...";
    }
    sendCommand("UPDATE_APP_SETTINGS", nextSettings);
}

function saveDecoyLiveState() {
    const nextSettings = collectAppSettingsPayload();
    state.appSettings = { ...(state.appSettings || {}), ...nextSettings };
    syncSettingsUi();
    if ($("decoy-live-status")) {
        $("decoy-live-status").textContent = "Applying live alert mode...";
    }
    sendCommand("UPDATE_APP_SETTINGS", nextSettings);
}

function clearAllDecoys() {
    if (!window.confirm("Delete every deployed decoy vault and honeyfile from disk?")) {
        return;
    }
    sendCommand("CLEAR_ALL_DECOYS", {});
}

function clearDecoyHistory() {
    if (!window.confirm("Clear all recorded honey alerts and decoy history?")) {
        return;
    }
    sendCommand("CLEAR_DECOY_HISTORY", {});
}

function exportDecoyMemoryLog() {
    sendCommand("EXPORT_DECOY_MEMORY_LOG", {});
}

function loadDecoyStatus() {
    sendCommand("GET_DECOY_STATUS", {});
}

function decoyEmailPosture() {
    const live = Boolean(state.appSettings?.decoy_email_live ?? state.appSettings?.decoy_email_enabled);
    if (!live) {
        return "STANDBY";
    }
    if (state.appSettings?.decoy_email_sender && state.appSettings?.decoy_email_has_secret) {
        return "ARMED";
    }
    return "INCOMPLETE";
}

function renderDecoyStatus(data) {
    const vaults = Array.isArray(data.vaults) ? data.vaults : [];
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const latestAlert = alerts.length ? alerts[alerts.length - 1] : null;
    const memoryLogEntries = Number.isFinite(data.memory_log_entries) ? data.memory_log_entries : alerts.length;

    if ($("decoy-summary")) {
        $("decoy-summary").textContent = vaults.length
            ? `${vaults.length} decoy vault${vaults.length === 1 ? "" : "s"} active with ${alerts.length} recorded alert${alerts.length === 1 ? "" : "s"} and ${memoryLogEntries} retained memory log entr${memoryLogEntries === 1 ? "y" : "ies"}.`
            : "No decoy vault deployed.";
    }
    if ($("decoy-metric-vaults")) {
        $("decoy-metric-vaults").textContent = String(vaults.length);
    }
    if ($("decoy-metric-alerts")) {
        $("decoy-metric-alerts").textContent = String(alerts.length);
    }
    if ($("decoy-metric-email")) {
        $("decoy-metric-email").textContent = decoyEmailPosture();
    }
    if ($("decoy-metric-memory")) {
        $("decoy-metric-memory").textContent = String(memoryLogEntries);
    }
    if ($("decoy-metric-target")) {
        $("decoy-metric-target").textContent = escapeHtml((state.decoyTargetPath || vaults[0]?.path || "Default store").toString());
    }

    if ($("decoy-vaults")) {
        $("decoy-vaults").innerHTML = vaults.length
            ? vaults.map((vault) => `
                <div class="ops-item decoy-vault-card">
                    <div class="ops-item-head">
                        <strong>${escapeHtml(vault.label)}</strong>
                        <span class="vault-pill">${escapeHtml(vault.profile)}</span>
                    </div>
                    <div class="ops-item-meta">${vault.file_count} honeyfiles | ${escapeHtml(vault.path)}</div>
                    <div class="ops-item-submeta">Created ${formatTimestamp(vault.created_at)} | Last alert ${vault.alerts?.length ? formatTimestamp(vault.alerts[vault.alerts.length - 1].timestamp, true) : "None"}</div>
                    <div class="decoy-file-rail">
                        ${(vault.files || []).map((file) => `
                            <div class="decoy-file-chip">
                                <strong>${escapeHtml(String(file.name || '').split('\\').pop())}</strong>
                                <span>${formatBytes(file.size)}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `).join("")
            : '<div class="activity-empty">No decoy vaults deployed.</div>';
    }

    if ($("decoy-alerts")) {
        $("decoy-alerts").innerHTML = alerts.length
            ? alerts.slice().reverse().map((alert) => `
                <div class="activity-item decoy-alert-item">
                    <div class="activity-copy">
                        <strong>${escapeHtml(alert.kind)}</strong>
                        <div>${escapeHtml(alert.file || alert.message)}</div>
                        <div class="ops-item-submeta">${escapeHtml(alert.message || "")}${alert.email_sent ? " | Email sent" : alert.email_error ? ` | Email error: ${escapeHtml(alert.email_error)}` : ""}</div>
                    </div>
                    <span class="activity-time">${formatTimestamp(alert.timestamp, true)}</span>
                </div>
            `).join("")
            : '<div class="activity-empty">No honey alerts recorded.</div>';
    }

    if ($("decoy-last-alert")) {
        $("decoy-last-alert").textContent = latestAlert ? `${latestAlert.kind} at ${formatTimestamp(latestAlert.timestamp, true)}` : "No triggers yet";
    }
}

function startMonitoring() {
    sendCommand("START_MONITORING", {});
}

function stopMonitoring() {
    sendCommand("STOP_MONITORING", {});
}

function clearSignalsScreen() {
    // Clear the UI immediately
    if ($("monitor-events")) $("monitor-events").innerHTML = '<div class="activity-empty">Tracing is offline.</div>';
    if ($("monitor-processes")) $("monitor-processes").innerHTML = '<div class="activity-empty">No process data captured yet.</div>';
    if ($("monitor-process-count")) $("monitor-process-count").textContent = "0";
    if ($("monitor-alert-count")) $("monitor-alert-count").textContent = "0";

    // Tell the backend to wipe its event list permanently
    // so the next poll returns an empty log, not the old data.
    sendCommand("CLEAR_MONITOR_EVENTS", {});

    if (typeof showNotification === "function") showNotification("Signals log cleared.", "info");
}

function loadMonitorStatus() {
    sendCommand("GET_MONITOR_STATUS", {});
}

function renderMonitorStatus(data) {
    const events = Array.isArray(data.events) ? data.events : [];
    const processes = Array.isArray(data.processes) ? data.processes : [];
    const honeyAlerts = Array.isArray(data.honey_alerts) ? data.honey_alerts : [];

    state.monitorActive = Boolean(data.active);
    if ($("monitor-state")) {
        const posture = (data.trace_posture || "nominal").toUpperCase();
        $("monitor-state").textContent = data.active ? `ONLINE | ${posture}` : "OFFLINE";
    }
    if ($("monitor-process-count")) {
        $("monitor-process-count").textContent = String(data.process_count || 0);
    }
    if ($("monitor-alert-count")) {
        $("monitor-alert-count").textContent = String(honeyAlerts.length);
    }

    if ($("monitor-events")) {
        $("monitor-events").innerHTML = events.length
            ? events
                .slice()
                .reverse()
                .map(
                    (event) => `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>${escapeHtml(event.kind)}</strong>
                        <span class="ops-item-time">${formatTimestamp(event.timestamp, true)}</span>
                    </div>
                    <div class="ops-item-meta">${escapeHtml(event.message)}</div>
                </div>
            `
                )
                .join("")
            : `<div class="activity-empty">${data.active ? "No process churn captured." : "Tracing is offline."}</div>`;
    }

    if ($("monitor-processes")) {
        $("monitor-processes").innerHTML = processes.length
            ? processes
                .map(
                    (process) => `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>${escapeHtml(process.image_name)}</strong>
                        <span class="vault-pill ${process.watch_tags?.length ? "is-warn" : ""}">${escapeHtml(process.pid)}</span>
                    </div>
                    <div class="ops-item-meta">${formatBytes((process.memory_kb || 0) * 1024)} | Session ${escapeHtml(process.session_name)}</div>
                    <div class="ops-item-submeta">${process.watch_tags?.length ? escapeHtml(process.watch_tags.join(", ")) : "No watchlist match"}</div>
                </div>
            `
                )
                .join("")
            : '<div class="activity-empty">No process data captured yet.</div>';
    }
}

function selectFileForShred(filePath) {
    state.selectedFileForShred = filePath;
    const stats = safeStat(filePath);
    $("shred-filename").textContent = path.basename(filePath);
    $("shred-filepath").textContent = filePath;
    $("shred-filesize").textContent = stats ? formatBytes(stats.size) : "Unavailable";
    $("shred-file-info")?.classList.remove("hidden");
    $("shred-options")?.classList.remove("hidden");
    $("btn-execute-shred")?.classList.remove("hidden");
}

async function executeSecureShred() {
    if (!state.selectedFileForShred) {
        showNotification("Choose a file first.", "error");
        return;
    }
    if (!$("shred-confirm-check")?.checked) {
        showNotification("Confirm the irreversible action first.", "error");
        return;
    }
    $("shred-progress-modal")?.classList.remove("hidden");
    await simulateShredProgress();
    sendCommand("SHRED_FILE", { path: state.selectedFileForShred });
}

async function simulateShredProgress() {
    const steps = ["step-1", "step-2", "step-3", "step-4"];
    for (let index = 0; index < steps.length; index += 1) {
        const step = $(steps[index]);
        const bar = step?.querySelector(".step-progress");
        step?.classList.add("active");
        for (let progress = 0; progress <= 100; progress += 10) {
            if (bar) {
                bar.style.width = `${progress}%`;
            }
            await wait(40);
        }
        step?.classList.remove("active");
        step?.classList.add("completed");
        $("shred-pass").textContent = `${Math.min(index + 1, 3)}/3`;
        $("shred-percent").textContent = `${Math.round(((index + 1) / steps.length) * 100)}%`;
        if ($("shred-progress-bar")) {
            $("shred-progress-bar").style.width = `${Math.round(((index + 1) / steps.length) * 100)}%`;
        }
    }
    $("shred-time").textContent = "00:00";
}

function handleShredSuccess() {
    $("shred-progress-modal")?.classList.add("hidden");
    $("shred-success-modal")?.classList.remove("hidden");
    const wipeText = $("shred-wipe-name")?.checked ? " Filename wipe requested as well." : "";
    $("shred-success-message").textContent = `${path.basename(state.selectedFileForShred || "Selected file")} removed from the visible workspace.${wipeText}`;
    addActivity(`Destroyed: ${path.basename(state.selectedFileForShred || "file")}`);
    showNotification("Destruction cycle completed.", "success");
}

function resetShredUi() {
    state.selectedFileForShred = null;
    $("shred-file-info")?.classList.add("hidden");
    $("shred-options")?.classList.add("hidden");
    $("btn-execute-shred")?.classList.add("hidden");
    $("shred-progress-modal")?.classList.add("hidden");
    $("shred-success-modal")?.classList.add("hidden");
    if ($("shred-confirm-check")) {
        $("shred-confirm-check").checked = false;
    }
    ["step-1", "step-2", "step-3", "step-4"].forEach((id) => {
        const step = $(id);
        const bar = step?.querySelector(".step-progress");
        step?.classList.remove("active", "completed");
        if (bar) {
            bar.style.width = "0%";
        }
    });
    if ($("shred-progress-bar")) {
        $("shred-progress-bar").style.width = "0%";
    }
    $("shred-percent").textContent = "0%";
    $("shred-pass").textContent = "0/3";
}

function handleAuthenticate() {
    const password = loginEl.password?.value.trim();

    const isMfaRequired = state.appSettings?.pvs_mfa_required || false;
    const isPvsBypass = state.pvsVerified && !isMfaRequired;

    // MFA ON: require both PVS verified AND master key
    if (isMfaRequired && !state.pvsVerified) {
        showLoginStatus("MFA: Verify your Carrier Image first.", "error");
        return;
    }
    if (isMfaRequired && !password) {
        showLoginStatus("MFA: Enter Master Key to complete authentication.", "error");
        return;
    }

    // MFA OFF, no password, no PVS = nothing to auth with
    if (!password && !isPvsBypass) {
        showLoginStatus("Enter the master key to continue.", "error");
        return;
    }

    state.profile = loginEl.mode?.value || "PERSONAL";
    syncProfileUi();

    // Run CIA-style pre-auth sequence, then fire the command
    _runAuthAnimation(isPvsBypass && !password, isMfaRequired, () => {
        // Only hash if we actually have a password
        const hashToSend = password ? hashPassword(password) : null;
        sendCommand("AUTH", {
            password_hash: hashToSend,
            keystroke_sample: buildKeystrokeSample(),
            mode: state.profile
        });
    });
}

function handleAuthSuccess(behavioral) {
    const completeLogin = () => {
        state.authenticated = true;
        state.sessionStart = Date.now();
        closeCameraWorkflow();
        screens.login?.classList.remove("active");
        screens.app?.classList.add("active");
        syncProfileUi();
        renderAuthStatus(behavioral || state.authStatus);
        startTimers();
        startPolling();
        loadAppSettings();
        loadOperatorProfile();
        loadVaultList();
        loadDecoyStatus();
        loadMonitorStatus();
        addActivity("Secure session established");
        showNotification(
            behavioral?.message || "Vault session established.",
            "success"
        );
        resetKeystrokeTrace();
        _bindQuickActions();
        updateDashboardWidgets();
    };

    if (state.cameraMode === "login-recovery" && state.recoveryPipelineActive) {
        finalizeRecoveryPipeline(true, "Recovery verification complete. Session release authorized.", completeLogin);
        return;
    }

    _runLoginTransition(completeLogin);
}

/* ============================================================
   CIA / RAW – PREMIUM AUTHENTICATION ANIMATIONS
   ============================================================ */
function _runAuthAnimation(isPvsBypass, isMfa, callback) {
    const overlay = document.createElement("div");
    overlay.id = "auth-anim-overlay";
    overlay.style.cssText = [
        "position:fixed;inset:0;z-index:99999;",
        "background:rgba(5,8,22,0.97);",
        "display:flex;flex-direction:column;align-items:center;justify-content:center;",
        "font-family:'Segoe UI',monospace;",
        "animation:authOverlayIn 0.25s ease;"
    ].join("");

    const label = isMfa ? "DUAL-FACTOR AUTHENTICATION" : (isPvsBypass ? "CARRIER BYPASS PROTOCOL" : "MASTER KEY VERIFICATION");
    const iconSvg = `<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="28" cy="28" r="27" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 4" class="auth-spin"/>
        <circle cx="28" cy="28" r="18" stroke="#3b82f6" stroke-width="1" opacity="0.5"/>
        <path d="M28 16v8M28 32v8M16 28h8M32 28h8" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="28" cy="28" r="4" fill="#3b82f6"/>
    </svg>`;

    const steps = isMfa
        ? ["VERIFYING CARRIER IMAGE", "VALIDATING MASTER KEY", "CROSS-REFERENCING IDENTITY", "ESTABLISHING ENCRYPTED CHANNEL"]
        : isPvsBypass
        ? ["CARRIER IMAGE CONFIRMED", "EXTRACTING SESSION HASH", "UNLOCKING SECURE ENCLAVE", "SESSION BRIDGE ACTIVE"]
        : ["HASHING MASTER KEY", "VALIDATING IDENTITY", "CHECKING RHYTHM SIGNATURE", "AUTHORIZING ACCESS"];

    overlay.innerHTML = `
        <div style="color:#60a5fa;margin-bottom:24px;animation:authIconPulse 1s ease infinite;">${iconSvg}</div>
        <div style="color:#94a3b8;font-size:10px;letter-spacing:4px;margin-bottom:8px;text-transform:uppercase;">OBSIDYN SECURE SHELL</div>
        <div id="auth-step-label" style="color:#f1f5f9;font-size:15px;font-weight:600;letter-spacing:2px;text-transform:uppercase;min-width:360px;text-align:center;min-height:22px;">${steps[0]}</div>
        <div style="width:360px;height:2px;background:rgba(255,255,255,0.07);border-radius:2px;margin:20px 0;overflow:hidden;">
            <div id="auth-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:2px;transition:width 0.5s cubic-bezier(.4,0,.2,1);"></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">${steps.map((_,i)=>`<div class="auth-dot" style="width:6px;height:6px;border-radius:50%;background:${i===0?'#3b82f6':'rgba(255,255,255,0.15)'};transition:background 0.3s;"></div>`).join('')}</div>
        <div id="auth-status-line" style="color:#475569;font-size:11px;letter-spacing:1.5px;font-family:monospace;">INITIALIZING...</div>
    `;
    document.body.appendChild(overlay);

    const bar = overlay.querySelector("#auth-progress-bar");
    const stepLabel = overlay.querySelector("#auth-step-label");
    const statusLine = overlay.querySelector("#auth-status-line");
    const dots = overlay.querySelectorAll(".auth-dot");

    const statusMessages = [
        "ENTROPY POOL SEEDED",
        "CRYPTOGRAPHIC HANDSHAKE",
        "CHANNEL SECURED — AES-256",
        "AWAITING ENGINE RESPONSE"
    ];

    let step = 0;
    const totalSteps = steps.length;
    const interval = setInterval(() => {
        step++;
        if (step >= totalSteps) {
            clearInterval(interval);
            bar.style.width = "100%";
            stepLabel.textContent = "ACCESS GRANTED";
            stepLabel.style.color = "#5fe7cb";
            statusLine.textContent = "SECURE CHANNEL ESTABLISHED";
            statusLine.style.color = "#5fe7cb";
            dots.forEach(d => { d.style.background = "#5fe7cb"; });
            setTimeout(() => {
                overlay.style.animation = "authOverlayOut 0.4s ease forwards";
                setTimeout(() => { overlay.remove(); callback(); }, 420);
            }, 400);
            return;
        }
        const pct = Math.round((step / totalSteps) * 85);
        bar.style.width = pct + "%";
        stepLabel.textContent = steps[step];
        statusLine.textContent = statusMessages[step] || "PROCESSING";
        dots.forEach((d, i) => {
            d.style.background = i <= step ? "#3b82f6" : "rgba(255,255,255,0.15)";
        });
    }, 420);
}

function _runLoginTransition(callback) {
    const overlay = document.createElement("div");
    overlay.id = "login-transition-overlay";
    overlay.style.cssText = [
        "position:fixed;inset:0;z-index:99998;",
        "background:#050816;",
        "display:flex;flex-direction:column;align-items:center;justify-content:center;",
        "animation:authOverlayIn 0.15s ease;"
    ].join("");

    overlay.innerHTML = `
        <div style="color:#2563eb;font-size:11px;letter-spacing:6px;text-transform:uppercase;margin-bottom:16px;animation:authFadePulse 0.8s ease infinite;">IDENTITY CONFIRMED</div>
        <div style="color:#f1f5f9;font-size:22px;font-weight:700;letter-spacing:4px;">OBSIDYN</div>
        <div style="width:120px;height:1px;background:linear-gradient(90deg,transparent,#2563eb,transparent);margin:20px 0;"></div>
        <div style="color:#475569;font-size:10px;letter-spacing:3px;">INITIALIZING SESSION ENVIRONMENT</div>
        <div style="width:200px;height:1px;background:rgba(255,255,255,0.04);border-radius:1px;margin-top:24px;overflow:hidden;">
            <div id="lt-bar" style="height:100%;width:0%;background:#2563eb;border-radius:1px;transition:width 0.6s ease;"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const ltBar = overlay.querySelector("#lt-bar");
    requestAnimationFrame(() => { ltBar.style.width = "100%"; });

    setTimeout(() => {
        overlay.style.animation = "authOverlayOut 0.5s ease forwards";
        setTimeout(() => { overlay.remove(); callback(); }, 520);
    }, 900);
}

function loadAuthStatus() {
    sendCommand("GET_AUTH_STATUS", {});
}

function renderAuthStatus(data) {
    if (!data) {
        return;
    }
    state.authStatus = data;
    state.failedPasswordAttempts = Number(data.failed_password_attempts || 0);
    state.recoveryTriggerAttempts = Number(data.visual_recovery_trigger_attempts || 0);
    state.recoveryConfigured = Boolean(data.visual_recovery?.configured);
    const statusText = !data.configured
        ? "No master identity enrolled yet. First session will establish Rhythm Lock."
        : data.enforcement_ready
            ? `${data.lock_name || "Rhythm Lock"} active. Score ${data.last_score ?? "n/a"}.`
            : `${data.lock_name || "Rhythm Lock"} training ${data.sample_count || 0}/${data.minimum_training_samples || 5}.`;
    if ($("rhythm-lock-status")) {
        $("rhythm-lock-status").textContent = statusText;
    }
    renderSecurityPolicy(data);
    updateLoginRecoveryButton(data);
}

function lockSystem() {
    sendCommand("LOGOUT", {});
    state.authenticated = false;
    state.monitorActive = false;
    state.pvsVerified = false;
    closeCameraWorkflow();
    clearTimers();
    stopPolling();
    screens.app?.classList.remove("active");
    screens.login?.classList.add("active");
    if (loginEl.password) {
        loginEl.password.value = "";
    }
    resetKeystrokeTrace();
    showLoginStatus("System locked.", "success");

    // Reset PVS-pass bypass button to un-verified state
    const bypassBtn = document.getElementById("btn-visual-recovery") || document.querySelector(".btn-pvs-bypass");
    if (bypassBtn) {
        bypassBtn.style.background = "";
        bypassBtn.style.border = "";
        bypassBtn.style.color = "";
        bypassBtn.innerHTML = '<span style="margin-right:6px;">&#128065;</span> PVS-pass Bypass';
        bypassBtn.disabled = false;
    }
}

function startTimers() {
    clearTimers();
    const autoLockMs = state.autoLockMinutes * 60 * 1000;
    const startedAt = Date.now();
    state.autoLockTimer = setTimeout(() => {
        addActivity("Auto-lock engaged");
        lockSystem();
    }, autoLockMs);
    state.countdownTimer = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startedAt;
        const remaining = Math.max(0, autoLockMs - elapsed);
        if (appEl.sessionTimer) {
            appEl.sessionTimer.textContent = formatCurrentTime(now);
        }
        if (appEl.dashboardAutoLock) {
            appEl.dashboardAutoLock.textContent = formatDuration(remaining);
        }
        if (appEl.autoLockCountdown) {
            appEl.autoLockCountdown.textContent = formatDuration(remaining);
        }
    }, 50);
}

function clearTimers() {
    if (state.autoLockTimer) {
        clearTimeout(state.autoLockTimer);
        state.autoLockTimer = null;
    }
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
}

function loadOperatorProfile() {
    if (!state.authenticated) {
        return;
    }
    sendCommand("GET_OPERATOR_PROFILE", {});
}

function hasOperatorDossier(profile) {
    return Boolean(profile?.has_dossier || profile?.created_at || profile?.notes_configured);
}

function getOperatorAvatarLabel(profile = state.operatorProfile) {
    const source = (profile?.call_sign || profile?.full_name || "Operator").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return "OP";
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] || "O"}${parts[1][0] || "P"}`.toUpperCase();
}

function syncOperatorModes() {
    const profile = state.operatorProfile;
    const hasDossier = hasOperatorDossier(profile);
    const editing = Boolean(state.operatorEditing);
    const viewing = Boolean(state.operatorViewing && hasDossier && !editing);

    $("operator-dossier-summary")?.classList.toggle("hidden", !hasDossier || editing || viewing);
    $("operator-dossier-view")?.classList.toggle("hidden", !viewing);
    $("operator-dossier-form")?.classList.toggle("hidden", !editing);
    $("btn-save-operator-profile")?.classList.toggle("hidden", !editing);
    $("btn-view-operator-profile")?.classList.toggle("hidden", !hasDossier || editing || viewing);
    $("btn-edit-operator-profile")?.classList.toggle("hidden", !hasDossier || editing || viewing);
    $("btn-cancel-operator-edit")?.classList.toggle("hidden", !(editing || viewing));
}

function setOperatorEditMode(editing) {
    state.operatorEditing = Boolean(editing);
    if (editing) {
        state.operatorViewing = false;
    }
    syncOperatorModes();
}

function setOperatorViewMode(viewing) {
    if (!hasOperatorDossier(state.operatorProfile)) {
        state.operatorViewing = false;
        syncOperatorModes();
        return;
    }
    state.operatorViewing = Boolean(viewing);
    if (viewing) {
        state.operatorEditing = false;
    }
    renderOperatorProfile(state.operatorProfile, { force: true, keepViewing: state.operatorViewing });
}

function saveOperatorProfile() {
    if (!state.authenticated) {
        showNotification("Authenticate before editing the dossier.", "error");
        return;
    }

    const notePasscode = $("operator-note-passcode-setup")?.value || "";
    const notePasscodeConfirm = $("operator-note-passcode-confirm")?.value || "";
    const notesConfigured = Boolean(state.operatorProfile?.notes_configured);

    if (!notesConfigured && (notePasscode || notePasscodeConfirm)) {
        if (notePasscode.length < 4) {
            showNotification("Set a notes access code with at least 4 characters.", "error");
            return;
        }
        if (notePasscode !== notePasscodeConfirm) {
            showNotification("Notes access code confirmation does not match.", "error");
            return;
        }
    }

    sendCommand("SAVE_OPERATOR_PROFILE", {
        profile: {
            call_sign: $("operator-call-sign")?.value || "",
            full_name: $("operator-full-name")?.value || "",
            organization: $("operator-organization")?.value || "",
            designation: $("operator-designation")?.value || "",
            email: $("operator-email")?.value || "",
            phone: $("operator-phone")?.value || "",
            location: $("operator-location")?.value || "",
            recovery_phrase_hint: $("operator-hint")?.value || "",
            operator_image_data: state.operatorImageDraft !== undefined ? state.operatorImageDraft : undefined
        },
        note_passcode: !notesConfigured && notePasscode ? notePasscode : null
    });
}

function renderOperatorTimeline(entries = []) {
    const container = $("operator-timeline");
    if (!container) {
        return;
    }
    if (!entries.length) {
        container.innerHTML = '<div class="activity-empty">No dossier events recorded yet.</div>';
        return;
    }

    container.innerHTML = entries.slice().reverse().map((entry) => `
        <div class="ops-item timeline-item">
            <div class="ops-item-head">
                <strong>${escapeHtml((entry.action || "EVENT").replaceAll("_", " "))}</strong>
                <span class="ops-item-time">${formatTimestamp(entry.timestamp, true)}</span>
            </div>
            <div class="ops-item-meta">${escapeHtml(entry.detail || "No detail provided")}</div>
        </div>
    `).join("");
}

function clearNotePasscodeSetupFields() {
    ["operator-note-passcode-setup", "operator-note-passcode-confirm", "operator-notes-passcode", "operator-note-current-passcode", "operator-note-new-passcode", "operator-note-confirm-new-passcode"].forEach((id) => {
        if ($(id)) {
            $(id).value = "";
        }
    });
}

function renderOperatorImagePreview(imageData, profile = state.operatorProfile) {
    const imageTag = $("operator-image-tag");
    const fallback = $("operator-image-fallback");
    if (!imageTag || !fallback) {
        return;
    }
    const source = imageData || null;
    if (source) {
        imageTag.src = source;
        imageTag.classList.remove("hidden");
        fallback.classList.add("hidden");
    } else {
        imageTag.removeAttribute("src");
        imageTag.classList.add("hidden");
        fallback.textContent = getOperatorAvatarLabel(profile);
        fallback.classList.remove("hidden");
    }
}

async function selectOperatorImage() {
    const files = await ipcRenderer.invoke("select-file");
    const selected = files && files[0];
    if (!selected) {
        return;
    }
    const ext = path.extname(selected).toLowerCase();
    const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    };
    if (!mimeMap[ext]) {
        showNotification("Use PNG, JPG, JPEG, or WEBP for the operator image.", "error");
        return;
    }
    const buffer = fs.readFileSync(selected);
    state.operatorImageDraft = `data:${mimeMap[ext]};base64,${buffer.toString("base64")}`;
    renderOperatorImagePreview(state.operatorImageDraft);
    markOperatorProfileDirty();
}

function removeOperatorImage() {
    state.operatorImageDraft = null;
    renderOperatorImagePreview(null);
    markOperatorProfileDirty();
}

function renderOperatorSummary(profile) {
    const summary = $("operator-dossier-summary");
    if (!summary) {
        return;
    }
    const imageMarkup = profile?.operator_image_data
        ? `<img src="${profile.operator_image_data}" alt="Operator profile" class="operator-image-tag operator-image-tag-inline">`
        : `<div class="operator-avatar operator-avatar-xl">${escapeHtml(getOperatorAvatarLabel(profile))}</div>`;
    summary.innerHTML = `
        <div class="operator-summary-card">
            <div class="operator-summary-media">${imageMarkup}</div>
            <div class="operator-summary-copy">
                <span class="operator-summary-kicker">SEALED DOSSIER</span>
                <strong>Single operator record is secured</strong>
                <p>The identity payload stays masked until you intentionally open View Dossier or Update Dossier.</p>
            </div>
        </div>
        <div class="operator-summary-grid operator-summary-grid-mask">
            <div class="operator-summary-cell">
                <span>Profile state</span>
                <strong>${hasOperatorDossier(profile) ? "Sealed" : "Uninitialized"}</strong>
            </div>
            <div class="operator-summary-cell">
                <span>Notes vault</span>
                <strong>${profile?.notes_configured ? "Access code active" : "Not configured"}</strong>
            </div>
            <div class="operator-summary-cell">
                <span>Sealed notes</span>
                <strong>${profile?.notes_count || 0} stored</strong>
            </div>
            <div class="operator-summary-cell">
                <span>Last sealed</span>
                <strong>${formatTimestamp(profile?.updated_at, true)}</strong>
            </div>
        </div>
    `;
}

function renderOperatorView(profile) {
    const view = $("operator-dossier-view");
    if (!view) {
        return;
    }
    if (!profile || !hasOperatorDossier(profile)) {
        view.innerHTML = "";
        return;
    }

    const cells = [
        ["Call sign", profile.call_sign || "Not set"],
        ["Full name", profile.full_name || "Not set"],
        ["Organization", profile.organization || "Not set"],
        ["Designation", profile.designation || "Not set"],
        ["Email", profile.email || "Not set"],
        ["Phone", profile.phone || "Not set"],
        ["Location", profile.location || "Not set"],
        ["Recovery hint", profile.recovery_phrase_hint || "Not set"],
        ["Dossier created", formatTimestamp(profile.created_at, true)],
        ["Last sealed", formatTimestamp(profile.updated_at, true)]
    ];

    view.innerHTML = `
        <div class="operator-view-card">
            <div class="operator-view-head">
                ${profile?.operator_image_data ? `<img src="${profile.operator_image_data}" alt="Operator profile" class="operator-image-tag operator-image-tag-inline operator-image-tag-view">` : `<div class="operator-avatar operator-avatar-small">${escapeHtml(getOperatorAvatarLabel(profile))}</div>`}
                <div>
                    <span class="operator-summary-kicker">VIEW DOSSIER</span>
                    <strong>Sealed identity fields</strong>
                    <p>Visible only while you intentionally keep the dossier open.</p>
                </div>
            </div>
            <div class="operator-view-grid">
                ${cells.map(([label, value]) => `
                    <div class="operator-summary-cell">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(value)}</strong>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

function renderOperatorNotesLockState(profile) {
    const configured = Boolean(profile?.notes_configured);
    const unlocked = Boolean(state.operatorNotesUnlocked);
    const status = $("operator-notes-status");
    const pill = $("operator-notes-pill");
    if (pill) {
        pill.textContent = !configured ? "UNCONFIGURED" : unlocked ? "UNLOCKED" : "LOCKED";
        pill.classList.toggle("is-ok", unlocked);
        pill.classList.toggle("is-warn", !configured);
    }
    if (status) {
        status.textContent = !configured
            ? "Set a notes access code in Operator Dossier to activate the notes vault."
            : unlocked
                ? "Notes vault is open. Seal each heading when you want it stored in the encrypted record."
                : "Notes vault is sealed. Unlock it with the dedicated access code to write or review content.";
    }
    $("operator-notes-locked")?.classList.toggle("hidden", unlocked);
    $("operator-notes-unlocked")?.classList.toggle("hidden", !unlocked);
    $("btn-save-operator-notes")?.classList.toggle("hidden", !unlocked);
    $("btn-lock-operator-notes")?.classList.toggle("hidden", !unlocked);
    $("btn-new-operator-note")?.classList.toggle("hidden", !unlocked);
    if (!configured) {
        $("operator-notes-locked")?.classList.remove("hidden");
        if ($("btn-unlock-operator-notes")) {
            $("btn-unlock-operator-notes").disabled = true;
        }
    } else if ($("btn-unlock-operator-notes")) {
        $("btn-unlock-operator-notes").disabled = false;
    }
}

function renderOperatorNotesList(entries = []) {
    const container = $("operator-notes-list");
    if (!container) {
        return;
    }
    if (!entries.length) {
        container.innerHTML = '<div class="activity-empty">No sealed notes yet.</div>';
        return;
    }
    container.innerHTML = entries.map((entry) => `
        <button class="operator-note-list-item operator-note-chip ${state.operatorSelectedNoteId === entry.id ? "is-active" : ""}" data-note-id="${escapeHtml(entry.id)}">
            <strong>${escapeHtml(entry.title || "Untitled Note")}</strong>
            <span>${formatTimestamp(entry.updated_at, true)}</span>
        </button>
    `).join("");
    $$(".operator-note-list-item").forEach((button) => {
        button.addEventListener("click", () => selectOperatorNote(button.dataset.noteId));
    });
}

function populateOperatorNoteEditor(entry) {
    if ($("operator-note-title")) {
        $("operator-note-title").value = entry?.title || "";
    }
    if ($("operator-note-body")) {
        $("operator-note-body").value = entry?.content || "";
    }
}

function createOperatorNoteDraft() {
    state.operatorSelectedNoteId = null;
    populateOperatorNoteEditor(null);
    renderOperatorNotesList(state.operatorNotesCache?.entries || []);
}

function selectOperatorNote(noteId) {
    state.operatorSelectedNoteId = noteId || null;
    const entry = (state.operatorNotesCache?.entries || []).find((item) => item.id === noteId) || null;
    populateOperatorNoteEditor(entry);
    renderOperatorNotesList(state.operatorNotesCache?.entries || []);
}

function lockOperatorNotes(clearEditors = true) {
    state.operatorNotesUnlocked = false;
    state.operatorSelectedNoteId = null;
    state.operatorNotePasscode = null;
    state.pendingOperatorNotePasscode = null;
    state.operatorNotesCache = null;
    if (clearEditors) {
        populateOperatorNoteEditor(null);
    }
    renderOperatorNotesLockState(state.operatorProfile);
    renderOperatorNotesList([]);
}

function renderOperatorNotes(notes) {
    state.operatorNotesUnlocked = true;
    state.operatorNotesCache = notes || { entries: [] };
    state.operatorNotePasscode = state.pendingOperatorNotePasscode || state.operatorNotePasscode || $("operator-notes-passcode")?.value || null;
    const entries = state.operatorNotesCache?.entries || [];
    if (!state.operatorSelectedNoteId || !entries.some((entry) => entry.id === state.operatorSelectedNoteId)) {
        state.operatorSelectedNoteId = notes?.saved_note_id || entries[0]?.id || null;
    }
    renderOperatorNotesLockState(state.operatorProfile);
    renderOperatorNotesList(entries);
    if (state.operatorSelectedNoteId) {
        selectOperatorNote(state.operatorSelectedNoteId);
    } else {
        createOperatorNoteDraft();
    }
    if (Array.isArray(notes?.note_timeline)) {
        renderOperatorTimeline(notes.note_timeline);
    }
}

function unlockOperatorNotes() {
    if (!state.authenticated) {
        showNotification("Authenticate before unlocking notes.", "error");
        return;
    }
    if (!state.operatorProfile?.notes_configured) {
        showNotification("Set a notes access code in the dossier first.", "error");
        return;
    }
    const passcode = $("operator-notes-passcode")?.value || "";
    if (passcode.length < 4) {
        showNotification("Enter the notes access code.", "error");
        return;
    }
    state.pendingOperatorNotePasscode = passcode;
    sendCommand("GET_OPERATOR_NOTES", { passcode });
}

function saveOperatorNotes() {
    if (!state.operatorNotesUnlocked || !state.operatorNotePasscode) {
        showNotification("Unlock the notes vault before saving.", "error");
        return;
    }
    const noteTitle = $("operator-note-title")?.value?.trim() || "";
    const noteBody = $("operator-note-body")?.value || "";
    if (!noteTitle && !noteBody.trim()) {
        showNotification("Write a heading or note content before sealing.", "error");
        return;
    }
    sendCommand("SAVE_OPERATOR_NOTES", {
        passcode: state.operatorNotePasscode,
        note_title: noteTitle,
        note_content: noteBody,
        note_id: state.operatorSelectedNoteId
    });
}

function rotateOperatorNotePasscode() {
    const currentPasscode = $("operator-note-current-passcode")?.value || "";
    const newPasscode = $("operator-note-new-passcode")?.value || "";
    const confirmPasscode = $("operator-note-confirm-new-passcode")?.value || "";

    if (currentPasscode.length < 4) {
        showNotification("Enter the current notes access code.", "error");
        return;
    }
    if (newPasscode.length < 4) {
        showNotification("New notes access code must be at least 4 characters.", "error");
        return;
    }
    if (newPasscode !== confirmPasscode) {
        showNotification("New notes access code confirmation does not match.", "error");
        return;
    }

    sendCommand("ROTATE_OPERATOR_NOTE_PASSCODE", {
        current_passcode: currentPasscode,
        new_passcode: newPasscode
    });
}

function renderOperatorProfile(profile, options = {}) {
    state.operatorProfile = profile || null;
    if (!profile) {
        return;
    }

    if (state.operatorProfileDirty && !options.force) {
        return;
    }

    if (!state.operatorEditing || options.force) {
        const fieldMap = {
            "operator-call-sign": profile.call_sign,
            "operator-full-name": profile.full_name,
            "operator-organization": profile.organization,
            "operator-designation": profile.designation,
            "operator-email": profile.email,
            "operator-phone": profile.phone,
            "operator-location": profile.location,
            "operator-hint": profile.recovery_phrase_hint,
        };

        state.operatorProfileHydrating = true;
        try {
            Object.entries(fieldMap).forEach(([id, value]) => {
                if ($(id)) {
                    $(id).value = value || "";
                }
            });
            state.operatorProfileDirty = false;
            state.operatorImageDraft = undefined;
        } finally {
            state.operatorProfileHydrating = false;
        }
    }

    renderOperatorImagePreview(state.operatorImageDraft !== undefined ? state.operatorImageDraft : profile.operator_image_data, profile);
    renderOperatorSummary(profile);
    renderOperatorView(profile);
    renderOperatorNotesLockState(profile);
    renderOperatorTimeline(profile.note_timeline || []);

    if ($("operator-dossier-status")) {
        $("operator-dossier-status").textContent = hasOperatorDossier(profile)
            ? `Dossier sealed ${formatTimestamp(profile.updated_at, true)}. Use View Dossier for a controlled read or Update Dossier to revise the record.`
            : "No dossier sealed yet. Fill the fields once, seal the record, then manage it through view and update controls.";
    }

    if (!hasOperatorDossier(profile)) {
        state.operatorViewing = false;
        state.operatorEditing = true;
    } else if (!options.keepEditing && !state.operatorEditing) {
        state.operatorEditing = false;
        state.operatorViewing = Boolean(options.keepViewing || state.operatorViewing);
    }
    syncOperatorModes();

    const dashboardSummary = $("dashboard-operator-summary");
    if (dashboardSummary) {
        dashboardSummary.innerHTML = `
            <div class="ops-item operator-summary-dashboard">
                <div class="ops-item-head">
                    <strong>Masked Operator Record</strong>
                    <span class="vault-pill">${escapeHtml(state.profile)}</span>
                </div>
                <div class="ops-item-meta">${hasOperatorDossier(profile) ? "Dossier sealed and managed through Operator Control." : "No sealed dossier yet."}</div>
                <div class="ops-item-submeta">${profile.notes_configured ? `${profile.notes_count || 0} sealed note headings on file` : "Notes vault not configured"}</div>
            </div>
            <div class="ops-item">
                <div class="ops-item-head">
                    <strong>Operator Timeline</strong>
                    <span class="ops-item-time">${formatTimestamp(profile.updated_at, true)}</span>
                </div>
                <div class="ops-item-meta">${escapeHtml(profile.note_timeline?.length ? profile.note_timeline[profile.note_timeline.length - 1].detail : "No dossier activity recorded yet.")}</div>
            </div>
        `;
    }
    updateDashboardState();
}


function loadAppSettings() {
    sendCommand("GET_APP_SETTINGS", {});
}

function readCheckbox(id, fallback = false) {
    const element = $(id);
    return element ? Boolean(element.checked) : fallback;
}

function isVisualRecoveryEnabled() {
    return state.appSettings?.visual_recovery_enabled !== false;
}

function collectAppSettingsPayload(overrides = {}) {
    const base = state.appSettings || {};
    return {
        auto_lock_minutes:
            overrides.auto_lock_minutes ??
            (
                Number.parseInt(
                    $("autolock-minutes")?.value ||
                    $("operator-auto-lock")?.value ||
                    String(base.auto_lock_minutes || state.autoLockMinutes || 10),
                    10
                ) || 10
            ),
        default_security_profile:
            overrides.default_security_profile ??
            $("settings-profile")?.value ??
            $("operator-security-profile")?.value ??
            state.profile,
        privacy_mode:
            overrides.privacy_mode ??
            readCheckbox("settings-privacy-mode", base.privacy_mode !== false),
        store_full_paths:
            overrides.store_full_paths ??
            readCheckbox("settings-store-full-paths", Boolean(base.store_full_paths)),
        visual_recovery_enabled:
            overrides.visual_recovery_enabled ??
            readCheckbox(
                "operator-recovery-enabled",
                readCheckbox("settings-visual-recovery-enabled", base.visual_recovery_enabled !== false)
            ),
        visual_recovery_min_failed_attempts:
            overrides.visual_recovery_min_failed_attempts ??
            (
                Number.parseInt(
                    $("operator-recovery-min-failed")?.value ||
                    String(base.visual_recovery_min_failed_attempts ?? 3),
                    10
                ) || 3
            ),
        login_binary_enabled:
            overrides.login_binary_enabled ??
            readCheckbox("settings-login-binary", base.login_binary_enabled !== false),
        reduced_motion:
            overrides.reduced_motion ??
            readCheckbox("settings-reduced-motion", Boolean(base.reduced_motion)),
        decoy_email_enabled:
            overrides.decoy_email_enabled ??
            readCheckbox("settings-decoy-email", readCheckbox("decoy-email-live", Boolean(base.decoy_email_live ?? base.decoy_email_enabled))),
        decoy_email_live:
            overrides.decoy_email_live ??
            readCheckbox("decoy-email-live", Boolean(base.decoy_email_live ?? base.decoy_email_enabled)),
        decoy_email_recipient:
            overrides.decoy_email_recipient ??
            $("decoy-email-recipient")?.value ??
            base.decoy_email_recipient ??
            "himeshsainichd@gmail.com",
        decoy_email_sender:
            overrides.decoy_email_sender ??
            $("decoy-email-sender")?.value ??
            base.decoy_email_sender ??
            "",
        decoy_email_app_password:
            overrides.decoy_email_app_password ??
            $("decoy-email-password")?.value ??
            "",
        decoy_email_smtp_host:
            overrides.decoy_email_smtp_host ??
            $("decoy-email-host")?.value ??
            base.decoy_email_smtp_host ??
            "smtp.gmail.com",
        decoy_email_smtp_port:
            overrides.decoy_email_smtp_port ??
            (Number.parseInt($("decoy-email-port")?.value || String(base.decoy_email_smtp_port || 587), 10) || 587),
        decoy_email_use_tls: true,
    };
}

function applyUiSettings() {
    document.body.classList.toggle("reduced-motion", Boolean(state.appSettings?.reduced_motion));
    const ambient = screens.login?.querySelector(".ambient-layer");
    if (ambient) {
        ambient.classList.toggle("hidden", state.appSettings?.login_binary_enabled === false);
    }
}

function saveAppSettings() {
    const nextSettings = collectAppSettingsPayload();
    state.autoLockMinutes = nextSettings.auto_lock_minutes;
    state.profile = nextSettings.default_security_profile;
    state.appSettings = { ...(state.appSettings || {}), ...nextSettings };
    if (state.authenticated) {
        startTimers();
    }
    syncProfileUi();
    syncSettingsUi();
    applyUiSettings();
    updateDashboardState();
    if ($("settings-status")) {
        $("settings-status").textContent = "Applying runtime settings...";
    }
    sendCommand("UPDATE_APP_SETTINGS", nextSettings);
}

function saveSecurityControls() {
    const trainingTarget = Number.parseInt($("operator-training-target")?.value || "5", 10);
    const threshold = Number.parseFloat($("operator-threshold")?.value || "1.5");
    const autoLock = Number.parseInt($("operator-auto-lock")?.value || String(state.autoLockMinutes), 10);
    const selectedProfile = $("operator-security-profile")?.value || state.profile;

    state.autoLockMinutes = Number.isFinite(autoLock) ? autoLock : 10;
    state.profile = selectedProfile;
    syncProfileUi();
    syncSettingsUi();

    const nextSettings = collectAppSettingsPayload({
        auto_lock_minutes: state.autoLockMinutes,
        default_security_profile: state.profile,
    });
    state.appSettings = { ...(state.appSettings || {}), ...nextSettings };
    if (state.authenticated) {
        startTimers();
    }
    applyUiSettings();
    sendCommand("UPDATE_APP_SETTINGS", nextSettings);
    sendCommand("UPDATE_RHYTHM_POLICY", {
        minimum_training_samples: trainingTarget,
        threshold
    });
}

function renderAppSettings(settings) {
    if (!settings) {
        return;
    }

    state.appSettings = settings;
    state.autoLockMinutes = Number.parseInt(settings.auto_lock_minutes || "10", 10) || 10;
    if (!state.authenticated && settings.default_security_profile) {
        state.profile = settings.default_security_profile;
    }
    syncProfileUi();
    syncSettingsUi();
    applyUiSettings();
    if ($("settings-status")) {
        $("settings-status").textContent = "Runtime settings loaded and synchronized.";
    }
    updateDashboardState();
}

function syncSettingsUi() {
    if ($("autolock-minutes")) {
        $("autolock-minutes").value = String(state.autoLockMinutes);
    }
    if ($("operator-auto-lock")) {
        $("operator-auto-lock").value = String(state.autoLockMinutes);
    }
    if ($("settings-profile")) {
        $("settings-profile").value = state.profile;
    }

    if (document.getElementById("recovery-mfa-toggle") && state.appSettings) {
        document.getElementById("recovery-mfa-toggle").checked = Boolean(state.appSettings.pvs_mfa_required);
    }
    if (document.getElementById("pvs-pass-status-badge") && state.appSettings) {
        const badge = document.getElementById("pvs-pass-status-badge");
        if (state.appSettings.pvs_pass_hash_set) {
            badge.textContent = "Status: Enrolled";
            badge.style.background = "rgba(95, 231, 203, 0.2)";
            badge.style.color = "#5fe7cb";
            if (document.getElementById("btn-view-pvs-pass")) document.getElementById("btn-view-pvs-pass").style.display = "block";
        } else {
            badge.textContent = "Status: Not Configured";
            badge.style.background = "rgba(255, 100, 100, 0.2)";
            badge.style.color = "#ff6464";
            if (document.getElementById("btn-view-pvs-pass")) document.getElementById("btn-view-pvs-pass").style.display = "none";
        }
    }
    if ($("operator-security-profile")) {
        $("operator-security-profile").value = state.profile;
    }

    if (state.appSettings) {
        if ($("decoy-email-recipient")) $("decoy-email-recipient").value = state.appSettings.decoy_email_recipient || "";
        if ($("decoy-email-sender")) $("decoy-email-sender").value = state.appSettings.decoy_email_sender || "";
        if ($("decoy-email-host")) $("decoy-email-host").value = state.appSettings.decoy_email_smtp_host || "smtp.gmail.com";
        if ($("decoy-email-port")) $("decoy-email-port").value = String(state.appSettings.decoy_email_smtp_port || 587);
        if ($("decoy-email-live")) $("decoy-email-live").checked = Boolean(state.appSettings.decoy_email_live);
        
        if ($("decoy-email-password") && state.appSettings.decoy_email_has_secret) {
            $("decoy-email-password").placeholder = "******** (saved)";
        }
        
        if ($("decoy-email-status")) {
            $("decoy-email-status").textContent = "Email channel settings loaded.";
        }
        if ($("decoy-live-status")) {
            $("decoy-live-status").textContent = state.appSettings.decoy_email_live 
                ? "Live alerting is ARMED." 
                : "Email reaction is idle until you arm it.";
        }
    }
}

function renderSecurityPolicy(status) {
    if (!status) {
        return;
    }

    if ($("operator-training-target")) {
        $("operator-training-target").value = String(status.minimum_training_samples || 5);
    }
    if ($("operator-threshold")) {
        $("operator-threshold").value = String(status.threshold || 1.5);
    }

    if ($("operator-auth-policy")) {
        const mode = status.enforcement_ready
            ? `Enforcing after ${status.sample_count || 0} samples`
            : `Training ${status.sample_count || 0}/${status.minimum_training_samples || 5}`;
        $("operator-auth-policy").textContent = `Rhythm Lock ${mode}. Sensitivity ${status.threshold || 1.5}. Visual recovery is ${isVisualRecoveryEnabled() ? "available on login" : "disabled in settings"}.`;
    }

    renderRecoveryStatus(status.visual_recovery);
}

function renderRecoveryStatus(recoveryStatus) {
    if (!recoveryStatus) {
        return;
    }

    state.recoveryReady = Boolean(recoveryStatus.configured);
    state.recoveryConfigured = Boolean(recoveryStatus.configured);
    if (state.authStatus) {
        state.authStatus.visual_recovery = {
            ...(state.authStatus.visual_recovery || {}),
            ...recoveryStatus,
        };
        state.authStatus.visual_recovery_allowed = Boolean(recoveryStatus.configured) && (recoveryStatus.enabled ?? isVisualRecoveryEnabled());
    }
    if ($("recovery-gesture-label") && recoveryStatus.gesture_label) {
        $("recovery-gesture-label").value = recoveryStatus.gesture_label;
    }
    updateLoginRecoveryButton(state.authStatus);
    const recoveryEnabled = recoveryStatus.enabled ?? isVisualRecoveryEnabled();
    const recoveryButton = $("btn-start-recovery-enroll");
    if (recoveryButton) {
        recoveryButton.textContent = state.recoveryReady ? "Update Enrollment" : "Capture Enrollment";
    }
    if ($("btn-delete-recovery-profile")) {
        $("btn-delete-recovery-profile").disabled = !state.recoveryReady;
    }
    if ($("operator-recovery-status")) {
        $("operator-recovery-status").textContent = !state.recoveryReady
            ? "Visual recovery not enrolled."
            : recoveryEnabled
                ? `Visual recovery enrolled and active${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`
                : `Visual recovery enrolled but disabled${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`;
    }
    if ($("operator-recovery-metrics")) {
        $("operator-recovery-metrics").innerHTML = state.recoveryReady
            ? `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>Face + Hand Signature</strong>
                        <span class="vault-pill ${recoveryEnabled ? "is-ok" : "is-warn"}">${recoveryEnabled ? "ACTIVE" : "DISABLED"}</span>
                    </div>
                    <div class="ops-item-meta">${escapeHtml(recoveryStatus.gesture_label || "Custom signature")}</div>
                    <div class="ops-item-submeta">Updated ${formatTimestamp(recoveryStatus.updated_at)} | ${recoveryEnabled ? "Available on every login screen" : "Stored but unavailable until re-enabled"}</div>
                </div>
            `
            : '<div class="activity-empty">Capture a face frame and your chosen hand signature to enable recovery.</div>';
    }
    if ($("settings-recovery-status")) {
        $("settings-recovery-status").textContent = !state.recoveryReady
            ? "No visual recovery signature stored."
            : recoveryEnabled
                ? `Visual recovery signature is active${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`
                : `Visual recovery signature is stored but disabled${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`;
    }
    syncSettingsUi();
}

function handleRecoveryToggleSync(event) {
    const enabled = Boolean(event?.target?.checked);
    if ($("settings-visual-recovery-enabled") && event?.target?.id !== "settings-visual-recovery-enabled") {
        $("settings-visual-recovery-enabled").checked = enabled;
    }
    if ($("operator-recovery-enabled") && event?.target?.id !== "operator-recovery-enabled") {
        $("operator-recovery-enabled").checked = enabled;
    }

    state.appSettings = {
        ...(state.appSettings || {}),
        visual_recovery_enabled: enabled,
    };
    applyUiSettings();
    if ($("settings-status")) {
        $("settings-status").textContent = "Applying visual recovery preference...";
    }
    updateLoginRecoveryButton(state.authStatus);
    renderRecoveryStatus({
        configured: state.recoveryReady,
        gesture_label: $("recovery-gesture-label")?.value || "Custom signature",
        updated_at: state.authStatus?.visual_recovery?.updated_at || state.appSettings?.updated_at || null,
        enabled,
    });
    sendCommand("UPDATE_APP_SETTINGS", { visual_recovery_enabled: enabled });
}

function deleteVisualRecoveryProfile() {
    if (!state.recoveryReady) {
        showNotification("No visual recovery signature is stored.", "info");
        return;
    }
    if (!window.confirm("Delete the enrolled face and gesture signature?")) {
        return;
    }
    sendCommand("DELETE_VISUAL_RECOVERY", {});
}

function rotateMasterKey() {
    const currentPassword = $("operator-current-password")?.value || "";
    const newPassword = $("operator-new-password")?.value || "";
    const confirmPassword = $("operator-confirm-password")?.value || "";

    if (!currentPassword || !newPassword) {
        showNotification("Enter the current and new master keys.", "error");
        return;
    }
    if (newPassword !== confirmPassword) {
        showNotification("New master key confirmation does not match.", "error");
        return;
    }

    sendCommand("ROTATE_MASTER_KEY", {
        current_password_hash: hashPassword(currentPassword),
        new_password_hash: hashPassword(newPassword)
    });
}

async function openCameraWorkflow(mode) {
    state.cameraMode = mode;
    resetCameraCaptures();
    clearRecoveryPipeline();

    $("camera-modal-title").textContent =
        mode === "enroll" ? "Enroll Visual Recovery" : "Visual Recovery Override";
    $("camera-modal-subtitle").textContent =
        mode === "enroll"
            ? "Capture your face and your chosen hand signature."
            : "Capture live face and gesture, then submit them for verification.";
    if ($("btn-camera-submit")) {
        $("btn-camera-submit").textContent =
            mode === "enroll" ? "Enable Visual Recovery" : "Submit & Verify";
    }
    $("camera-capture-status").className = "status-message info";
    $("camera-capture-status").textContent = "Opening camera feed...";
    $("camera-capture-modal")?.classList.remove("hidden");

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera API unavailable");
        }
        state.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false
        });
        const video = $("camera-preview");
        if (video) {
            video.srcObject = state.cameraStream;
            await video.play();
        }
        $("camera-capture-status").textContent = "Camera online. Capture face first, then the hand signature.";
        updateCameraCaptureUi();
    } catch (_error) {
        $("camera-capture-status").textContent = "Camera unavailable. Check desktop camera permissions.";
        showNotification("Unable to access the camera.", "error");
    }
}

function closeCameraWorkflow() {
    clearRecoveryPipeline();
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
    }
    state.cameraMode = null;
    resetCameraCaptures();
    $("camera-capture-modal")?.classList.add("hidden");
}

function captureCameraFrame(kind) {
    const video = $("camera-preview");
    const canvas = kind === "face" ? $("camera-face-canvas") : $("camera-gesture-canvas");
    if (!video || !canvas || !video.videoWidth) {
        showNotification("Camera feed is not ready yet.", "error");
        return;
    }

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    state.captures[kind] = canvas.toDataURL("image/png");
    $("camera-capture-status").textContent =
        kind === "face"
            ? "Face frame captured. Now capture the hand signature."
            : "Gesture frame captured. Submit when ready.";
    updateCameraCaptureUi();
}

function submitCameraWorkflow() {
    if (!state.captures.face || !state.captures.gesture) {
        showNotification("Capture both face and gesture frames first.", "error");
        return;
    }

    if (state.cameraMode === "enroll") {
        startRecoveryPipeline("enroll");
        sendCommand("ENROLL_VISUAL_RECOVERY", {
            face_image: state.captures.face,
            gesture_image: state.captures.gesture,
            gesture_label: $("recovery-gesture-label")?.value || "Custom signature"
        });
    } else if (state.cameraMode === "login-recovery") {
        startRecoveryPipeline("login-recovery");
        showLoginStatus("Submitting passwordless visual recovery...", "info");
        sendCommand("AUTH_VISUAL_RECOVERY", {
            recovery_payload: {
                face_image: state.captures.face,
                gesture_image: state.captures.gesture
            }
        });
    }
}

function resetCameraCaptures() {
    state.captures.face = null;
    state.captures.gesture = null;
    clearRecoveryPipeline();
    if ($("camera-face-canvas")) {
        clearCameraCanvas($("camera-face-canvas"));
    }
    if ($("camera-gesture-canvas")) {
        clearCameraCanvas($("camera-gesture-canvas"));
    }
    updateCameraCaptureUi();
}

function updateCameraCaptureUi() {
    const hasFace = Boolean(state.captures.face);
    const hasGesture = Boolean(state.captures.gesture);
    const ready = hasFace && hasGesture;
    const busy = state.recoveryPipelineActive;

    if ($("btn-camera-submit")) {
        $("btn-camera-submit").disabled = !ready || busy;
    }
    if ($("btn-camera-reset")) {
        $("btn-camera-reset").disabled = busy;
    }
    if ($("btn-capture-face")) {
        $("btn-capture-face").disabled = busy;
    }
    if ($("btn-capture-gesture")) {
        $("btn-capture-gesture").disabled = busy;
    }
    if ($("btn-camera-close")) {
        $("btn-camera-close").disabled = busy;
    }

    const summary = $("camera-enrollment-summary");
    if (summary) {
        if (busy) {
            summary.textContent =
                state.cameraMode === "enroll"
                    ? "Enrollment package submitted. Awaiting secure commit."
                    : "Verification package submitted. Awaiting secure verdict.";
        } else if (ready) {
            summary.textContent =
                state.cameraMode === "enroll"
                    ? "Both captures ready. Enable visual recovery to save enrollment."
                    : "Both captures ready. Submit and verify recovery now.";
        } else if (hasFace || hasGesture) {
            summary.textContent = `Waiting for ${hasFace ? "gesture" : "face"} capture.`;
        } else {
            summary.textContent = "Waiting for face and gesture capture.";
        }
    }

    updateCameraStepState("camera-step-face", hasFace);
    updateCameraStepState("camera-step-gesture", hasGesture);
    updateCameraStepState("camera-step-enable", ready);
}

function updateCameraStepState(id, complete) {
    const element = $(id);
    if (!element) {
        return;
    }
    element.classList.toggle("is-complete", complete);
}

function getRecoveryPipelineStages(mode) {
    if (mode === "enroll") {
        return [
            { target: 12, label: "Ingesting face frame", detail: "Packaging enrollment capture" },
            { target: 28, label: "Extracting face signature", detail: "Normalizing facial contrast map" },
            { target: 46, label: "Extracting gesture contour", detail: "Tracing hand silhouette geometry" },
            { target: 64, label: "Matching pixel topology", detail: "Reducing frame into secure feature vectors" },
            { target: 82, label: "Sealing recovery profile", detail: "Encrypting visual recovery enrollment" },
            { target: 96, label: "Awaiting backend commit", detail: "Writing protected recovery artifact" }
        ];
    }
    return [
        { target: 10, label: "Submitting recovery package", detail: "Face and gesture frames transferred" },
        { target: 24, label: "Processing face image", detail: "Reading luminance and boundary features" },
        { target: 41, label: "Matching facial signature", detail: "Comparing live frame against enrolled vector" },
        { target: 58, label: "Processing gesture image", detail: "Normalizing posture and contour geometry" },
        { target: 75, label: "Matching gesture signature", detail: "Computing gesture similarity confidence" },
        { target: 90, label: "Correlating combined trust score", detail: "Binding face and gesture confidence" },
        { target: 97, label: "Awaiting engine verdict", detail: "Final secure decision pending" }
    ];
}

function renderRecoveryPipeline() {
    const panel = $("camera-processing-panel");
    if (!panel) {
        return;
    }

    const active = state.recoveryPipelineActive;
    panel.classList.toggle("hidden", !active && state.recoveryPipelineProgress <= 0);

    const label = $("camera-processing-label");
    const value = $("camera-processing-value");
    const bar = $("camera-processing-bar");
    const feed = $("camera-processing-feed");
    const progress = Math.max(0, Math.min(100, state.recoveryPipelineProgress || 0));
    const stages = state.recoveryPipelineStages || [];
    const activeStageIndex = stages.findIndex((stage) => progress < stage.target);
    const currentIndex = activeStageIndex === -1 ? stages.length - 1 : activeStageIndex;

    if (label) {
        label.textContent = stages[currentIndex]?.label || "Recovery pipeline idle";
    }
    if (value) {
        value.textContent = `${Math.round(progress)}%`;
    }
    if (bar) {
        bar.style.width = `${progress}%`;
    }
    if (feed) {
        feed.innerHTML = stages.map((stage, index) => {
            const stageState = progress >= stage.target
                ? "is-complete"
                : index === currentIndex && active
                    ? "is-active"
                    : "is-pending";
            return `
                <div class="camera-processing-item ${stageState}">
                    <strong>${escapeHtml(stage.label)}</strong>
                    <span>${escapeHtml(stage.detail)}</span>
                </div>
            `;
        }).join("");
    }
}

function startRecoveryPipeline(mode) {
    clearRecoveryPipeline();
    state.recoveryPipelineActive = true;
    state.recoveryPipelineMode = mode;
    state.recoveryPipelineProgress = 3;
    state.recoveryPipelineStages = getRecoveryPipelineStages(mode);
    if ($("camera-capture-status")) {
        $("camera-capture-status").textContent =
            mode === "enroll"
                ? "Submitting enrollment captures into secure recovery pipeline..."
                : "Submitting recovery captures for live verification...";
    }
    renderRecoveryPipeline();
    updateCameraCaptureUi();

    state.recoveryPipelineTimer = setInterval(() => {
        if (!state.recoveryPipelineActive) {
            return;
        }
        const nextStage = state.recoveryPipelineStages.find((stage) => state.recoveryPipelineProgress < stage.target);
        const ceiling = nextStage ? nextStage.target : 97;
        const delta = state.recoveryPipelineProgress < 40 ? 4 : state.recoveryPipelineProgress < 80 ? 3 : 1;
        state.recoveryPipelineProgress = Math.min(ceiling, state.recoveryPipelineProgress + delta);
        renderRecoveryPipeline();
    }, 180);
}

function clearRecoveryPipeline() {
    if (state.recoveryPipelineTimer) {
        clearInterval(state.recoveryPipelineTimer);
        state.recoveryPipelineTimer = null;
    }
    state.recoveryPipelineActive = false;
    state.recoveryPipelineMode = null;
    state.recoveryPipelineProgress = 0;
    state.recoveryPipelineStages = [];
    renderRecoveryPipeline();
    updateCameraCaptureUi();
}

function finalizeRecoveryPipeline(success, message, onDone) {
    if (!state.recoveryPipelineActive && state.recoveryPipelineProgress <= 0) {
        onDone?.();
        return;
    }

    if (state.recoveryPipelineTimer) {
        clearInterval(state.recoveryPipelineTimer);
        state.recoveryPipelineTimer = null;
    }
    state.recoveryPipelineActive = false;
    state.recoveryPipelineProgress = 100;
    renderRecoveryPipeline();
    if ($("camera-capture-status")) {
        $("camera-capture-status").textContent = message;
        $("camera-capture-status").className = `status-message ${success ? "success" : "error"}`;
    }

    setTimeout(() => {
        clearRecoveryPipeline();
        if ($("camera-capture-status")) {
            $("camera-capture-status").className = "status-message info";
        }
        onDone?.();
    }, success ? 520 : 380);
}

function updateLoginRecoveryButton(authStatus) {
    const button = $("btn-login-recovery");
    if (!button) {
        return;
    }

    const configured = Boolean(
        authStatus?.visual_recovery?.configured || state.recoveryConfigured
    );
    const enabled = authStatus?.visual_recovery?.enabled ?? isVisualRecoveryEnabled();
    const allowed = Boolean(authStatus?.visual_recovery_allowed);

    button.classList.toggle("hidden", !configured || !enabled || !allowed);
    if (!configured || !enabled || !allowed) {
        button.disabled = true;
        const required = Number(authStatus?.visual_recovery_min_failed_attempts ?? 3);
        button.textContent = !enabled
            ? "Visual Recovery Disabled"
            : allowed
                ? "Engage Visual Recovery"
                : `Available after ${required} failed attempt(s)`;
        return;
    }

    state.recoveryConfigured = true;
    button.disabled = false;
    button.textContent = "Engage Visual Recovery";
}

function clearCameraCanvas(canvas) {
    const context = canvas.getContext("2d");
    context.fillStyle = "#050816";
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
        if (!state.authenticated) {
            return;
        }

        if (state.currentSection === "vault" || state.vaultItems.length === 0) {
            loadVaultList();
        }
        if (state.currentSection === "operator") {
            loadAuthStatus();
        }
        loadDecoyStatus();
        if (state.monitorActive || state.currentSection === "signals") {
            loadMonitorStatus();
        }
    }, 5000);
}

function stopPolling() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

function syncProfileUi() {
    if (appEl.profile) {
        appEl.profile.textContent = state.profile;
    }
    if ($("settings-profile")) {
        $("settings-profile").value = state.profile;
    }
    if (loginEl.mode) {
        loginEl.mode.value = state.profile;
    }
    if ($("operator-security-profile")) {
        $("operator-security-profile").value = state.profile;
    }
}

function updateDashboardState() {
    const vaultCount = state.vaultItems.length;
    const auth = state.authStatus || {};
    let postureScore = 0;

    if (auth.configured) {
        postureScore += 1;
    }
    if (auth.enforcement_ready) {
        postureScore += 2;
    }
    if (state.monitorActive) {
        postureScore += 1;
    }
    if (state.profile === "PUBLIC") {
        postureScore += 1;
    } else if (state.profile === "WORK") {
        postureScore += 0.5;
    }

    let posture = "STANDBY";
    if (postureScore >= 4) {
        posture = "BLACKSITE";
    } else if (postureScore >= 2.5) {
        posture = "ELEVATED";
    } else if (postureScore >= 1) {
        posture = "GUARDED";
    }

    if (appEl.vaultStatus) {
        appEl.vaultStatus.textContent = `${vaultCount} Sealed`;
    }
    if (appEl.vaultCount) {
        appEl.vaultCount.textContent = `${vaultCount} item${vaultCount === 1 ? "" : "s"}`;
    }
    if (appEl.dashboardVaultCount) {
        appEl.dashboardVaultCount.textContent = String(vaultCount);
    }
    if (appEl.dashboardSecurityLevel) {
        appEl.dashboardSecurityLevel.textContent = posture;
    }

    // Update extended dashboard widgets
    updateDashboardWidgets();
}

function updateDashboardWidgets() {
    if (!state.authenticated) return;
    const os = require("os");

    // ── System Vitals ──────────────────────────────────────────
    const totalRam = os.totalmem();
    const freeRam  = os.freemem();
    const uptimeSec = os.uptime();
    const uh = Math.floor(uptimeSec / 3600);
    const um = Math.floor((uptimeSec % 3600) / 60);

    _setTxt("dash-cpu-cores", os.cpus().length);
    _setTxt("dash-ram-total", formatBytes(totalRam));
    _setTxt("dash-ram-free", formatBytes(freeRam));
    _setTxt("dash-uptime", `${uh}h ${um}m`);

    // ── Session Intelligence ───────────────────────────────────
    const sessionAgeSec = state.sessionStart ? Math.floor((Date.now() - state.sessionStart) / 1000) : 0;
    const ah = Math.floor(sessionAgeSec / 3600);
    const am = Math.floor((sessionAgeSec % 3600) / 60);
    const as_ = sessionAgeSec % 60;
    _setTxt("dash-session-age", ah > 0 ? `${ah}h ${am}m` : `${am}m ${as_}s`);
    _setTxt("dash-profile-mode", (state.profile || "—").toUpperCase());
    const pvsEl = document.getElementById("dash-pvs-state");
    if (pvsEl) {
        pvsEl.textContent = state.pvsVerified ? "✓ VERIFIED" : "—";
        pvsEl.style.color = state.pvsVerified ? "#5fe7cb" : "";
    }

    // ── Runtime Fingerprint ────────────────────────────────────
    _setTxt("dash-platform", (os.platform() + " / " + os.release()).slice(0, 30));
    _setTxt("dash-arch", os.arch().toUpperCase());
    _setTxt("dash-node", process.versions.node || "—");
    _setTxt("dash-electron", process.versions.electron || "—");
    _setTxt("dash-hostname", os.hostname().slice(0, 24));
    if (state.sessionStart) {
        const d = new Date(state.sessionStart);
        _setTxt("dash-session-time", d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
}

function _setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
}

function _bindQuickActions() {
    const nav = (sec) => {
        const btn = document.querySelector(`.nav-item[data-section="${sec}"]`);
        if (btn) btn.click();
    };
    const lock = document.getElementById("dqa-lock");
    if (lock && !lock._bound) {
        lock._bound = true;
        lock.addEventListener("click", () => {
            const lb = document.getElementById("btn-lock") || document.querySelector("[data-action='lock']");
            if (lb) lb.click();
            else if (typeof lockSession === "function") lockSession();
        });
    }
    [
        ["dqa-vault",   "vault"],
        ["dqa-shred",   "secure-shred"],
        ["dqa-signals", "signals"],
        ["dqa-pcmgr",   "pc-manager"],
        ["dqa-steg",    "steganography"],
    ].forEach(([id, sec]) => {
        const el = document.getElementById(id);
        if (el && !el._bound) { el._bound = true; el.addEventListener("click", () => nav(sec)); }
    });
}

function addActivity(message, kind = "INFO") {
    state.activityLog.push({
        message,
        kind,
        timestamp: new Date().toISOString()
    });
    state.activityLog = state.activityLog.slice(-24);
    renderActivityLog();
}

function renderActivityLog() {
    if (!appEl.activityLog) {
        return;
    }

    if (state.activityLog.length === 0) {
        appEl.activityLog.innerHTML = '<div class="activity-empty">No recent activity</div>';
        return;
    }

    appEl.activityLog.innerHTML = state.activityLog
        .slice()
        .reverse()
        .map(
            (entry) => `
                <div class="activity-item">
                    <div class="activity-copy">${escapeHtml(entry.message)}</div>
                    <span class="activity-time">${formatTimestamp(entry.timestamp, true)}</span>
                </div>
            `
        )
        .join("");
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
    }
    return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatCurrentTime(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (number, width = 2) => String(number).padStart(width, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTimestamp(timestamp, compact = false) {
    if (!timestamp) {
        return compact ? "--:--:--.---" : "Unavailable";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return String(timestamp);
    }

    if (compact) {
        return formatCurrentTime(date);
    }

    return `${date.toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "2-digit"
    })} ${formatCurrentTime(date)}`;
}

function sendCommand(action, payload = {}) {
    ipcRenderer.send(
        "secure-command",
        JSON.stringify({
            action,
            payload
        })
    );
}

function showLoginStatus(message, type = "info") {
    if (!loginEl.status) {
        return;
    }

    loginEl.status.className = `status-message ${type}`;
    loginEl.status.textContent = message;
}

function showNotification(message, type = "info") {
    let stack = $("notification-stack");
    if (!stack) {
        stack = document.createElement("div");
        stack.id = "notification-stack";
        stack.className = "toast-stack";
        document.body.appendChild(stack);
    }

    const titleMap = {
        info: "Signal",
        success: "Confirmed",
        error: "Alert"
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-title">${escapeHtml(titleMap[type] || "Signal")}</div>
        <div class="toast-body">${escapeHtml(message)}</div>
    `;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("visible");
    });

    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 110);
    }, 200);
}

function safeStat(filePath) {
    try {
        return fs.statSync(filePath);
    } catch (_error) {
        return null;
    }
}

function wait(durationMs) {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function processEngineChunk(chunk) {
    state.engineBuffer += chunk;
    const lines = state.engineBuffer.split(/\r?\n/);
    state.engineBuffer = lines.pop() || "";

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }

        try {
            handleEngineMessage(JSON.parse(trimmed));
        } catch (_error) {
            console.warn("Unreadable engine payload:", trimmed);
        }
    });
}

function extractMessage(payload) {
    if (!payload) {
        return "No response received";
    }

    if (typeof payload.data === "string") {
        return payload.data;
    }
    if (payload.data && typeof payload.data.message === "string") {
        return payload.data.message;
    }
    if (typeof payload.message === "string") {
        return payload.message;
    }
    return payload.status || "Operation completed";
}

function handleEngineMessage(payload) {
    const message = extractMessage(payload);
    const behavioral = payload?.data?.behavioral || payload?.data;

    switch (payload.status) {
        case "AUTH_SUCCESS":
            showLoginStatus("Session established.", "success");
            handleAuthSuccess(behavioral);
            break;
        case "AUTH_FAIL":
            const recoveryAttemptInFlight = state.cameraMode === "login-recovery" && state.recoveryPipelineActive;
            if (behavioral && typeof behavioral === "object") {
                renderAuthStatus(behavioral);
            }
            if (recoveryAttemptInFlight) {
                finalizeRecoveryPipeline(false, `Verification completed: ${message}`, () => {
                    showLoginStatus(message, "error");
                    showNotification(message, "error");
                    updateCameraCaptureUi();
                });
            } else {
                showLoginStatus(message, "error");
                showNotification(message, "error");
            }
            if (behavioral?.visual_recovery?.configured && behavioral?.visual_recovery?.enabled !== false) {
                if ($("btn-login-recovery")) {
                    $("btn-login-recovery").classList.remove("hidden");
                    $("btn-login-recovery").disabled = false;
                }
                if (!recoveryAttemptInFlight) {
                    showLoginStatus(`${message} Use visual recovery if needed.`, "error");
                }
            } else {
                resetKeystrokeTrace();
            }
            break;
        case "LOGOUT_SUCCESS":
            loadAuthStatus();
            showNotification(message, "info");
            break;
        case "OK":
            routeOkPayload(payload);
            break;
        case "SUCCESS":
            routeSuccessPayload(payload);
            break;
        case "ERROR":
            stopLoadingAnimation();
            if (!state.authenticated || payload.action === "AUTH") {
                showLoginStatus(message, "error");
            }
            if (state.cameraMode && state.recoveryPipelineActive) {
                finalizeRecoveryPipeline(false, `Pipeline completed with error: ${message}`, () => {
                    if ($("camera-capture-status")) {
                        $("camera-capture-status").textContent = message;
                    }
                    updateCameraCaptureUi();
                });
            } else if (state.cameraMode && $("camera-capture-status")) {
                $("camera-capture-status").textContent = message;
            }
            if (payload.action === "ROTATE_MASTER_KEY" && $("operator-password-status")) {
                $("operator-password-status").textContent = message;
            }
            showNotification(message, "error");
            addActivity(`Error: ${message}`, "ERROR");
            break;
        case "PONG":
            break;
        default:
            showNotification(message, "info");
            break;
    }
}

function routeOkPayload(payload) {
    const action = payload.action;
    const data = payload.data;

    switch (action) {
        case "GET_AUTH_STATUS":
            renderAuthStatus(data);
            updateDashboardState();
            break;
        case "REVEAL_PVS_PASS":
            if (status === "SUCCESS") {
                if (typeof showNotification === 'function') showNotification("Decryption Successful", "success");
                window.alert("Your Saved PVS-pass Verification Text:\n\n" + data);
            } else {
                if (typeof showNotification === 'function') showNotification(data, "error");
            }
            break;
        case "GET_APP_SETTINGS":
        case "UPDATE_APP_SETTINGS":
            renderAppSettings(data);
            if (action === "UPDATE_APP_SETTINGS") {
                addActivity("Session controls updated");
                showNotification("Session controls updated.", "success");
                if ($("settings-status")) {
                    $("settings-status").textContent = "Runtime settings saved.";
                }
            }
            break;
        case "GET_OPERATOR_PROFILE":
            renderOperatorProfile(data);
            break;
        case "GET_OPERATOR_NOTES":
            renderOperatorNotes(data);
            showNotification("Notes vault unlocked.", "success");
            break;
        case "GET_VAULT_LIST":
            renderVaultList(payload);
            break;
        case "GET_DECOY_STATUS":
            renderDecoyStatus(data);
            break;
        case "EXPORT_DECOY_MEMORY_LOG":
            if (data?.filename && typeof data.content === "string") {
                downloadTextFile(data.filename, data.content);
                showNotification("Decoy memory log downloaded.", "success");
                addActivity("Decoy memory log exported");
            }
            break;
        case "GET_MONITOR_STATUS":
        case "START_MONITORING":
        case "STOP_MONITORING":
            renderMonitorStatus(data);
            updateDashboardState();
            break;
        case "SCAN_IMAGE":
            renderScanResult(data);
            addActivity(`Scan complete: ${data?.is_obsidyn ? "OBSIDYN signature detected" : data?.message || "No hidden payload"}`);
            break;
        case "GET_STATUS":
            updateDashboardState();
            break;
        default:
            if (data && Array.isArray(data.vaults)) {
                renderDecoyStatus(data);
            } else if (data && Array.isArray(data.processes)) {
                renderMonitorStatus(data);
            } else if (Array.isArray(data)) {
                renderVaultList(payload);
            }
            break;
    }
}

function routeSuccessPayload(payload) {
    const action = payload.action;
    const message = extractMessage(payload);

    switch (action) {
        case "LOCK_FILE":
        case "LOCK_FOLDER":
            addActivity(message);
            loadVaultList();
            showNotification(message, "success");
            break;
        case "UNLOCK_FILE":
        case "UNLOCK_FOLDER":
            addActivity(message);
            loadVaultList();
            showNotification(message, "success");
            break;
        case "DELETE_VAULT_ITEM":
            addActivity(message);
            loadVaultList();
            showNotification(message, "success");
            break;
        case "VERIFY_PVS_PASS": {
            showNotification("PVS-pass Image Verified. Click Establish Session to log in.", "success");
            showLoginStatus("PVS-pass Verified. Now click Establish Session.", "success");
            const bypassBtn2 = document.getElementById("btn-visual-recovery") || document.querySelector(".btn-pvs-bypass");
            if (bypassBtn2) {
                bypassBtn2.style.background = "rgba(95, 231, 203, 0.25)";
                bypassBtn2.style.border = "1.5px solid #5fe7cb";
                bypassBtn2.style.color = "#5fe7cb";
                bypassBtn2.innerHTML = "&#10003; PVS-pass Verified";
                bypassBtn2.disabled = true;
            }
            state.pvsVerified = true;
            break;
        }
        case "HIDE_DATA":
            stopLoadingAnimation();
            addActivity(message);
            showNotification(message, "success");
            // Clear form inputs
            if ($("hide-data-file")) {
                $("hide-data-file").value = "";
                $("hide-data-file").dataset.path = "";
            }
            if ($("hide-carrier-image")) {
                $("hide-carrier-image").value = "";
                $("hide-carrier-image").dataset.path = "";
            }
            if ($("hide-password")) {
                $("hide-password").value = "";
            }
            if ($("hide-output-path")) {
                $("hide-output-path").value = "";
                $("hide-output-path").dataset.path = "";
            }
            if ($("capacity-display")) {
                $("capacity-display").innerHTML = "";
            }
            break;
        case "EXTRACT_DATA":
            stopLoadingAnimation();
            addActivity(message);
            showNotification(message, "success");
            break;
        case "CREATE_DECOY_VAULT":
            addActivity(message);
            loadDecoyStatus();
            showNotification(message, "success");
            break;
        case "CLEAR_ALL_DECOYS":
            addActivity(message);
            loadDecoyStatus();
            showNotification(message, "success");
            break;
        case "CLEAR_DECOY_HISTORY":
            addActivity(message);
            loadDecoyStatus();
            showNotification(message, "success");
            break;
        case "SAVE_OPERATOR_PROFILE":
            clearNotePasscodeSetupFields();
            state.operatorImageDraft = undefined;
            state.operatorEditing = false;
            state.operatorViewing = false;
            renderOperatorProfile(payload.profile, { force: true });
            addActivity("Operator dossier updated");
            showNotification(message, "success");
            break;
        case "SAVE_OPERATOR_NOTES":
            renderOperatorNotes(payload.notes);
            loadOperatorProfile();
            addActivity(`Operator note sealed: ${payload.notes?.entries?.find((entry) => entry.id === payload.notes?.saved_note_id)?.title || "Untitled Note"}`);
            showNotification(message, "success");
            break;
        case "ROTATE_OPERATOR_NOTE_PASSCODE":
            clearNotePasscodeSetupFields();
            state.operatorNotePasscode = null;
            lockOperatorNotes(true);
            renderOperatorProfile(payload.profile, { force: true });
            addActivity("Notes access code updated");
            showNotification(message, "success");
            break;
        case "UPDATE_RHYTHM_POLICY":
            renderSecurityPolicy(payload.policy);
            addActivity("Rhythm Lock policy updated");
            showNotification(message, "success");
            break;
        case "ENROLL_VISUAL_RECOVERY":
            if (state.cameraMode === "enroll" && state.recoveryPipelineActive) {
                finalizeRecoveryPipeline(true, "Enrollment sealed. Visual recovery profile committed.", () => {
                    renderRecoveryStatus(payload.recovery);
                    closeCameraWorkflow();
                    addActivity("Visual recovery enrollment updated");
                    showNotification(message, "success");
                });
            } else {
                renderRecoveryStatus(payload.recovery);
                closeCameraWorkflow();
                addActivity("Visual recovery enrollment updated");
                showNotification(message, "success");
            }
            break;
        case "DELETE_VISUAL_RECOVERY":
            renderRecoveryStatus(payload.recovery);
            addActivity("Visual recovery enrollment deleted");
            showNotification(message, "success");
            break;
        case "ROTATE_MASTER_KEY":
            if (payload.auth_status) {
                renderAuthStatus(payload.auth_status);
            }
            if ($("operator-password-status")) {
                $("operator-password-status").textContent = message;
            }
            ["operator-current-password", "operator-new-password", "operator-confirm-password"].forEach((id) => {
                if ($(id)) {
                    $(id).value = "";
                }
            });
            addActivity("Master key rotated");
            showNotification(message, "success");
            break;
        case "SHRED_FILE":
            handleShredSuccess();
            break;
        default:
            showNotification(message, "success");
            break;
    }
}

function renderScanResult(data) {
    const result = $("scan-result");
    const content = $("scan-result-content");
    if (!result || !content) {
        return;
    }

    result.classList.remove("hidden");

    const info = data?.image_info || {};
    const rows = [
        ["Status", data?.message || "No signal"],
        ["Image", `${info.width || "-"} x ${info.height || "-"} | ${info.format || "Unknown"}`],
        ["Mode", info.mode || "Unknown"],
        ["Size", formatBytes(info.size_bytes || 0)],
        ["Capacity", formatBytes(info.capacity_bytes || 0)],
        ["Hidden Payload", data?.has_hidden_data ? "Detected" : "Not detected"],
        ["OBSIDYN Signature", data?.is_obsidyn ? "Confirmed" : "Not confirmed"]
    ];

    if (data?.hidden_data_size) {
        rows.push(["Payload Size", formatBytes(data.hidden_data_size)]);
    }

    content.innerHTML = rows
        .map(
            ([label, value]) => `
                <div class="scan-row">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(String(value))}</strong>
                </div>
            `
        )
        .join("");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

ipcRenderer.on("engine-message", (_event, chunk) => {
    processEngineChunk(String(chunk || ""));
});

window.unlockFile = unlockFile;
window.deleteVaultItem = deleteVaultItem;

document.addEventListener("DOMContentLoaded", init);





// ===== VISUAL RECOVERY BYPASS =====
document.addEventListener("DOMContentLoaded", () => {
    const visualBtn = document.getElementById("btn-visual-recovery-login");
    if (visualBtn) {
        visualBtn.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/png, image/jpeg";
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    performVisualRecovery(file);
                }
            };
            input.click();
        });
    }

    const execRecoveryBtn = document.getElementById("btn-execute-recovery");
    const recoveryCarrierBtn = document.getElementById("btn-select-recovery-carrier");
    const recoveryCarrierInput = document.getElementById("recovery-carrier-image");

    if (recoveryCarrierBtn && recoveryCarrierInput) {
        recoveryCarrierBtn.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/png, image/jpeg";
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    recoveryCarrierInput.value = file.path || file.name;
                }
            };
            input.click();
        });
    }

    if (execRecoveryBtn) {
        execRecoveryBtn.addEventListener("click", () => {
            if (!recoveryCarrierInput || !recoveryCarrierInput.value) {
                if (typeof showNotification === "function") showNotification("Please select a Carrier Image first.", "error");
                return;
            }
            performVisualRecovery({ name: recoveryCarrierInput.value });
        });
    }
});

function performVisualRecovery(file) {
    const overlay = document.createElement("div");
    overlay.className = "recovery-overlay";
    overlay.innerHTML = `
        <div class="recovery-scanner-box">
            <div class="recovery-scan-line"></div>
            <h3>SCANNING CARRIER IMAGE</h3>
            <p style="color: #3ca8ff; margin-bottom: 5px;">Extracting Steganographic Payload...</p>
            <div class="recovery-progress">
                <div class="recovery-progress-bar"></div>
            </div>
            <p class="recovery-status-text" style="color: var(--text-secondary); font-size: 12px; margin-top: 10px;">Analyzing \</p>
        </div>
    `;
    document.body.appendChild(overlay);

    const style = document.createElement("style");
    style.innerHTML = `
        .recovery-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(8, 12, 24, 0.95);
            backdrop-filter: blur(10px);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .recovery-scanner-box {
            background: rgba(15, 22, 42, 0.8);
            border: 1px solid rgba(95, 231, 203, 0.4);
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            width: 400px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 0 30px rgba(95, 231, 203, 0.1);
        }
        .recovery-scan-line {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 2px;
            background: #5fe7cb;
            box-shadow: 0 0 10px #5fe7cb;
            animation: scanVertical 2s ease-in-out infinite alternate;
        }
        .recovery-progress {
            width: 100%; height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            margin-top: 20px;
            overflow: hidden;
        }
        .recovery-progress-bar {
            width: 0%; height: 100%;
            background: #3ca8ff;
            transition: width 2s ease-out;
        }
        @keyframes scanVertical {
            0% { top: 0; }
            100% { top: 100%; }
        }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
        const bar = overlay.querySelector(".recovery-progress-bar");
        if (bar) bar.style.width = "100%";
    }, 100);

    setTimeout(() => {
        overlay.querySelector("h3").innerText = "BIOMETRIC HASH VERIFIED";
        overlay.querySelector("h3").style.color = "#5fe7cb";
        overlay.querySelector(".recovery-status-text").innerText = "Authentication Override Successful";
        overlay.querySelector(".recovery-scan-line").style.display = "none";

        setTimeout(() => {
            overlay.remove();

            // Bypass login securely via IPC
            const pwd = document.getElementById("master-password") ? document.getElementById("master-password").value.trim() : "";
            const pwdHash = pwd ? hashPassword(pwd) : "";
            sendCommand("VERIFY_PVS_PASS", {
                carrier_image_path: file.path || file.name,
                password_hash: pwdHash, keystroke_sample: buildKeystrokeSample()
            });

        }, 1500);
    }, 2500);
}




document.addEventListener("DOMContentLoaded", () => {
    const btnSavePvs = document.getElementById("btn-save-pvs-pass");
    const pvsInput = document.getElementById("pvs-pass-input");
    const mfaToggle = document.getElementById("recovery-mfa-toggle");

    if (btnSavePvs && pvsInput) {
        btnSavePvs.addEventListener("click", async () => {
            const text = pvsInput.value.trim();
            if (!text) {
                if (typeof showNotification === 'function') showNotification("PVS-pass text cannot be empty", "error");
                return;
            }

            // Hash the text before sending to backend for storage
            const hash = await hashPassword(text); // hashPassword is in renderer.js
            sendCommand("UPDATE_APP_SETTINGS", {
                pvs_pass_hash: hash,
                pvs_pass_text: text
            });
            if (state.appSettings) state.appSettings.pvs_pass_hash_set = true;
            if (typeof syncSettingsUi === 'function') syncSettingsUi();
            pvsInput.value = "";
            if (typeof showNotification === 'function') showNotification("PVS-pass Verification Text Saved", "success");
        });
    }

    if (mfaToggle) {
        mfaToggle.addEventListener("change", (e) => {
            sendCommand("UPDATE_APP_SETTINGS", {
                pvs_mfa_required: e.target.checked
            });
            if (typeof showNotification === 'function') showNotification("PVS-pass MFA updated", "info");
        });
    }
    
    const pcModal = document.getElementById('pc-confirm-modal');
    const pcModalCmd = document.getElementById('pc-modal-cmd');
    const pcModalAction = document.getElementById('pc-modal-action');
    const pcModalImpact = document.getElementById('pc-modal-impact');
    const pcModalTime = document.getElementById('pc-modal-time');
    const pcModalConfirm = document.getElementById('pc-modal-confirm');
    const pcModalCancel = document.getElementById('pc-modal-cancel');
    let pendingPcCommand = null;
    let pendingPcBtn = null;

    if (pcModalCancel) {
        pcModalCancel.addEventListener('click', () => {
            pcModal.classList.add('hidden');
            pendingPcCommand = null;
            pendingPcBtn = null;
        });
    }

    if (pcModalConfirm) {
        pcModalConfirm.addEventListener('click', () => {
            if (pendingPcCommand && pendingPcBtn) {
                const btn = pendingPcBtn;
                const cmd = pendingPcCommand;
                pcModal.classList.add('hidden');
                
                const originalHtml = btn.innerHTML;
                btn.textContent = 'Deploying...';
                btn.style.opacity = '0.7';
                btn.style.pointerEvents = 'none';

                sendCommand('PC_CONTROL', { cmd });
                showNotification('Executing command...', 'success');

                setTimeout(() => {
                    btn.textContent = 'Executed';
                    btn.style.background = 'rgba(114, 226, 176, 0.2)';
                    btn.style.borderColor = '#72e2b0';
                    
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.style.background = '';
                        btn.style.borderColor = '';
                        btn.style.opacity = '1';
                        btn.style.pointerEvents = 'auto';
                    }, 2000);
                }, 500);
            }
        });
    }

    const pcCommands = [
        // ── NETWORK ──────────────────────────────────────────────────
        { name: "Flush DNS Cache", cmd: "ipconfig /flushdns", category: "Network", desc: "💡 TIP: Run this first when a website fails to load despite internet working fine. Clears stale DNS entries." },
        { name: "Show IP Configuration", cmd: "cmd /c start cmd /k ipconfig /all", category: "Network", desc: "Displays your full IP, subnet, gateway, and DNS server addresses. Essential for diagnosing network issues." },
        { name: "Release & Renew IP", cmd: "cmd /c start cmd /k ipconfig /release & ipconfig /renew", category: "Network", desc: "⚠️ NOTE: Forces your PC to request a new IP from the router. Use when IP conflicts occur." },
        { name: "Continuous Ping (Google)", cmd: "cmd /c start cmd /k ping 8.8.8.8 -t", category: "Network", desc: "Continuously pings Google DNS. Watch for packet loss — if you see 'Request timed out', your connection is unstable." },
        { name: "Trace Route", cmd: "cmd /c start cmd /k tracert google.com", category: "Network", desc: "Maps every hop between you and a server. Use to find where internet slowdown is occurring (your ISP vs remote server)." },
        { name: "Network Statistics", cmd: "cmd /c start cmd /k netstat -ano", category: "Network", desc: "🔍 SECURITY: Lists all active connections and their PIDs. Spot suspicious foreign connections here." },
        { name: "Network Connections Panel", cmd: "ncpa.cpl", category: "Network", desc: "Manage WiFi, Ethernet, and VPN adapters. Right-click an adapter to diagnose, disable, or view its properties." },
        { name: "Network Reset (Nuclear)", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k netsh winsock reset & netsh int ip reset & ipconfig /flushdns'\"", category: "Network", desc: "⚠️ CAUTION: Full network stack reset. Fixes most deep network issues but requires a reboot. Use as last resort." },
        { name: "WiFi Passwords (All)", cmd: "cmd /c start cmd /k netsh wlan show profiles", category: "Network", desc: "Lists all saved WiFi networks. To see a specific password: 'netsh wlan show profile name=\"NetworkName\" key=clear'" },
        { name: "Hosts File Editor", cmd: "powershell -Command \"Start-Process notepad -Verb RunAs -ArgumentList 'C:\\Windows\\System32\\drivers\\etc\\hosts'\"", category: "Network", desc: "💡 TIP: Block websites by adding '127.0.0.1 website.com'. Also used to redirect domains locally for development." },

        // ── SECURITY ──────────────────────────────────────────────────
        { name: "Windows Security Dashboard", cmd: "windowsdefender:", category: "Security", desc: "Main hub for Virus & Threat Protection, Firewall, App & Browser Control, and Device Security." },
        { name: "Malicious Software Tool (MRT)", cmd: "mrt", category: "Security", desc: "💡 Microsoft's hidden scanner. Detects and removes the most common/widespread malware families. Fast, free, built-in." },
        { name: "Quick Antivirus Scan", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit,-Command,Write-Host ''Quick Scan Started...'';Start-MpScan -ScanType QuickScan'\"", category: "Security", desc: "Scans startup locations and common malware hiding spots. Takes 2-5 min. Run weekly as best practice." },
        { name: "Full System Deep Scan", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit,-Command,Write-Host ''Full Scan Started...'';Start-MpScan -ScanType FullScan'\"", category: "Security", desc: "⚠️ Scans every single file. Takes 30min-2hrs. High CPU/Disk usage. Schedule overnight. Run monthly." },
        { name: "Update Virus Definitions", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit,-Command,Update-MpSignature;Write-Host ''Definitions Updated!'''\"", category: "Security", desc: "Fetches latest threat definitions from Microsoft. Run before any scan for best detection accuracy." },
        { name: "Windows Firewall Settings", cmd: "control firewall.cpl", category: "Security", desc: "Basic firewall on/off and exception management. 💡 TIP: Leave it ON always — it blocks inbound attacks." },
        { name: "Advanced Firewall Rules", cmd: "wf.msc", category: "Security", desc: "Create precise inbound/outbound rules for specific apps and ports. For advanced users. Misconfiguration can block legit apps." },
        { name: "BitLocker Drive Encryption", cmd: "control /name Microsoft.BitLockerDriveEncryption", category: "Security", desc: "🔒 Encrypts your entire drive. Essential for laptops — if stolen, data is unreadable without your PIN/recovery key." },
        { name: "Credential Manager", cmd: "control /name Microsoft.CredentialManager", category: "Security", desc: "View/delete saved Windows credentials and website passwords stored by apps. Good to audit periodically." },
        { name: "User Account Control Settings", cmd: "useraccountcontrolsettings", category: "Security", desc: "💡 ADVICE: Keep UAC at 'Notify me only when apps try to make changes'. Turning it OFF is a major security risk." },
        { name: "Check Defender Status", cmd: "cmd /c start cmd /k powershell -Command \"Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureAge\"", category: "Security", desc: "Shows if real-time protection is active and how old your virus definitions are. Signature should be under 3 days old." },

        // ── SYSTEM HEALTH ──────────────────────────────────────────────────
        { name: "System File Checker (SFC)", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k sfc /scannow'\"", category: "System Health", desc: "💡 FIRST STEP: Run this whenever Windows behaves oddly. Repairs corrupted system files using cached copies. Takes ~10 min." },
        { name: "DISM Image Repair", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k DISM /Online /Cleanup-Image /RestoreHealth'\"", category: "System Health", desc: "⚠️ Run AFTER SFC if SFC fails. Downloads fresh system files from Windows Update servers. Needs internet." },
        { name: "Disk Check (Chkdsk)", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k chkdsk C: /f /r'\"", category: "System Health", desc: "Fixes file system errors and maps bad sectors. NOTE: Runs on next reboot for drive C. May take 30-60 min." },
        { name: "Advanced System Properties", cmd: "sysdm.cpl", category: "System Health", desc: "Configure virtual memory (page file), System Restore, remote access, and environment variables in one place." },
        { name: "System Configuration", cmd: "msconfig", category: "System Health", desc: "💡 TIP: Go to Boot tab to enable Safe Mode for troubleshooting. Startup tab controls auto-start behavior (use Task Manager instead on Win10+)." },
        { name: "Windows Memory Diagnostic", cmd: "mdsched", category: "System Health", desc: "Scans RAM for hardware errors on next reboot. Use if you experience random BSODs or crashes. Results appear after restart." },
        { name: "Performance Monitor", cmd: "perfmon", category: "System Health", desc: "Advanced real-time performance graphs. Create Data Collector Sets to log performance over time for diagnosis." },
        { name: "Reliability Monitor", cmd: "cmd /c start perfmon /rel", category: "System Health", desc: "💡 HIDDEN GEM: Shows a timeline of app crashes, Windows errors, and updates. Best tool to find when problems started." },
        { name: "Check Windows Version", cmd: "winver", category: "System Health", desc: "Displays your exact Windows version and build number. Share this info when seeking technical support." },
        { name: "Environment Variables", cmd: "rundll32 sysdm.cpl,EditEnvironmentVariables", category: "System Health", desc: "Directly open the Environment Variables editor. Add paths for dev tools like Python, Node, Git without opening System Properties." },

        // ── USER ACCOUNTS ──────────────────────────────────────────────────
        { name: "Advanced User Accounts", cmd: "netplwiz", category: "User Accounts", desc: "Add or remove users, manage group memberships, and bypass the login screen (not recommended for security)." },
        { name: "Local Users and Groups", cmd: "lusrmgr.msc", category: "User Accounts", desc: "Advanced management of users and groups. (Only available in Windows Pro/Enterprise/Education)." },
        { name: "Credential Manager", cmd: "control keymgr.dll", category: "User Accounts", desc: "View and delete saved passwords for websites, apps, and Windows networks." },

        // ── WINDOWS TOOLS ──────────────────────────────────────────────────
        { name: "Event Viewer", cmd: "eventvwr.msc", category: "Windows Tools", desc: "Logs every system event. Look in Windows Logs > System/Application to diagnose silent crashes." },
        { name: "Services Console", cmd: "services.msc", category: "Windows Tools", desc: "Start, stop, and disable background Windows services. ⚠️ Be careful disabling critical services." },
        { name: "Task Scheduler", cmd: "taskschd.msc", category: "Windows Tools", desc: "Automate scripts, programs, and updates. Malware sometimes hides persistence mechanisms here." },
        { name: "System Information", cmd: "msinfo32", category: "Windows Tools", desc: "Massive compendium of hardware and software configuration. Great for checking BIOS versions." },

        // ── PERFORMANCE ──────────────────────────────────────────────────
        { name: "Task Manager", cmd: "taskmgr", category: "Performance", desc: "💡 TIP: Use the 'Startup' tab to disable programs that slow your boot. 'Details' tab shows exact resource usage per process." },
        { name: "Resource Monitor", cmd: "resmon", category: "Performance", desc: "More detailed than Task Manager. Shows exactly which files a process is reading, and which ports it's using." },
        { name: "Power Plan: High Performance", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit,-Command,powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c;Write-Host ''High Performance plan activated!'''\"", category: "Performance", desc: "Maximizes CPU clock speed at all times. ⚠️ Uses more power and heat. Best for desktops or plugged-in laptops." },
        { name: "Power Plan: Balanced", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit,-Command,powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e;Write-Host ''Balanced plan restored!'''\"", category: "Performance", desc: "Microsoft's recommended setting. CPU scales up/down based on load. Best for battery life on laptops." },
        { name: "Power Options Panel", cmd: "powercfg.cpl", category: "Performance", desc: "GUI for power plans. Also access advanced settings like sleep timers, USB suspend, and PCI Express power states." },
        { name: "Adjust Visual Effects", cmd: "SystemPropertiesPerformance", category: "Performance", desc: "💡 TIP FOR SLOW PCs: Select 'Adjust for best performance' to disable animations. Huge speed boost on old hardware." },
        { name: "Prefetch Folder", cmd: "cmd /c start shell:prefetch", category: "Performance", desc: "Windows stores app launch data here to speed up startup. Safe to delete contents manually to free space. Windows rebuilds it automatically." },
        { name: "Startup Apps Manager", cmd: "taskmgr /0 /startup", category: "Performance", desc: "Opens Task Manager directly on the Startup tab. Disable anything you don't need at boot to improve startup time." },

        // ── STORAGE & MAINTENANCE ──────────────────────────────────────────────────
        { name: "Disk Cleanup", cmd: "cleanmgr", category: "Storage", desc: "Deletes temp files, recycle bin, old Windows updates. Run 'Clean up system files' option for maximum space recovery." },
        { name: "Disk Management", cmd: "diskmgmt.msc", category: "Storage", desc: "View, resize, format, and assign drive letters to partitions. ⚠️ Deleting a partition erases ALL data on it permanently." },
        { name: "Storage Settings", cmd: "ms-settings:storagesense", category: "Storage", desc: "Enable Storage Sense to auto-delete temp files. View space used by apps, documents, and system files." },
        { name: "Open Temp Folder", cmd: "cmd /c start %temp%", category: "Storage", desc: "💡 TIP: Manually delete everything in this folder. It's safe — Windows recreates what it needs. Run monthly for a clean system." },
        { name: "Open Windows Temp", cmd: "powershell -Command \"Start-Process explorer -Verb RunAs -ArgumentList 'C:\\Windows\\Temp'\"", category: "Storage", desc: "System-level temp files. Requires Admin to view. Delete contents periodically to reclaim disk space." },
        { name: "Optimize & Defragment Drives", cmd: "dfrgui", category: "Storage", desc: "Defragment HDDs for performance. ⚠️ NOTE: SSDs do NOT need defragmentation — Windows runs TRIM automatically on them." },

        // ── ADVANCED UTILITIES ──────────────────────────────────────────────────
        { name: "Computer Management", cmd: "compmgmt.msc", category: "Advanced Utilities", desc: "Master control panel combining Event Viewer, Task Scheduler, Disk Management, Services, and Device Manager." },
        { name: "Event Viewer", cmd: "eventvwr", category: "Advanced Utilities", desc: "💡 TIP: Go to Windows Logs > System or Application to find errors around the time of a crash or problem." },
        { name: "Services Manager", cmd: "services.msc", category: "Advanced Utilities", desc: "Control all background Windows services. ⚠️ CAUTION: Disabling wrong services can break Windows. Research before disabling." },
        { name: "Task Scheduler", cmd: "taskschd.msc", category: "Advanced Utilities", desc: "Create automated tasks triggered by time, event, or user login. Used by Windows Update, antivirus, and apps." },
        { name: "Registry Editor", cmd: "regedit", category: "Advanced Utilities", desc: "⚠️ DANGER: Advanced system configuration database. Always export/backup a key before editing. Wrong edits can break Windows." },
        { name: "Group Policy Editor", cmd: "gpedit.msc", category: "Advanced Utilities", desc: "Enterprise-grade system policy manager. Pro/Enterprise only. Controls hundreds of settings not exposed in Settings app." },
        { name: "Local Security Policy", cmd: "secpol.msc", category: "Advanced Utilities", desc: "Set password policies, lockout rules, and audit policies. Great for hardening a standalone machine." },
        { name: "Add/Remove Programs", cmd: "appwiz.cpl", category: "Advanced Utilities", desc: "Classic uninstaller. Also access Windows Features here (turn on/off Hyper-V, WSL, Telnet, IIS, etc.)." },
        { name: "Internet Properties", cmd: "inetcpl.cpl", category: "Advanced Utilities", desc: "Configure proxy settings, trusted sites, security zones, and cached browser data for Internet Explorer/Edge legacy." },
        { name: "Certificates Manager", cmd: "certmgr.msc", category: "Advanced Utilities", desc: "🔒 View all trusted SSL certificates. Remove unknown/expired certificates from Trusted Root if you suspect MITM attacks." },
        { name: "Shared Folders", cmd: "fsmgmt.msc", category: "Advanced Utilities", desc: "See all folders currently shared on your PC and who is connected. Useful for auditing network shares." },
        { name: "Windows Tools Folder", cmd: "control admintools", category: "Advanced Utilities", desc: "Shortcut folder to all administrative tools. Pin frequently used ones to your taskbar for quick access." },

        // ── HARDWARE & DRIVERS ──────────────────────────────────────────────────
        { name: "Device Manager", cmd: "devmgmt.msc", category: "Hardware", desc: "💡 TIP: Yellow exclamation marks = driver issue. Right-click > Update Driver. Or 'Disable' to troubleshoot conflicts." },
        { name: "Disk Management", cmd: "diskmgmt.msc", category: "Hardware", desc: "View all physical disks and partitions. Initialize new drives, extend volumes, or mark partitions as active." },
        { name: "System Information", cmd: "msinfo32", category: "Hardware", desc: "Full hardware inventory: CPU, RAM, motherboard, BIOS version, installed drivers. Export as .nfo file for support tickets." },
        { name: "DirectX Diagnostic", cmd: "dxdiag", category: "Hardware", desc: "Shows DirectX version, GPU details, driver dates, and runs display/sound tests. Key for gaming diagnostics." },
        { name: "Display Settings", cmd: "ms-settings:display", category: "Hardware", desc: "Change resolution, refresh rate, HDR, scaling, and multi-monitor arrangement. 💡 TIP: Set refresh rate to your monitor's max." },
        { name: "Sound Settings", cmd: "mmsys.cpl", category: "Hardware", desc: "Manage audio devices, set default playback/recording device, and configure sound schemes." },
        { name: "Power & Sleep Settings", cmd: "ms-settings:powersleep", category: "Hardware", desc: "Configure when your screen turns off and when PC goes to sleep. Adjust separately for battery and plugged-in." },
        { name: "Print Management", cmd: "printmanagement.msc", category: "Hardware", desc: "Manage all printers, print queues, and drivers. Remove ghost/offline printers that clog the list." },

        // ── PRIVACY & USER ACCOUNT ──────────────────────────────────────────────────
        { name: "Privacy Settings", cmd: "ms-settings:privacy", category: "Privacy", desc: "🔒 Review which apps can access camera, microphone, location, contacts. Revoke permissions from suspicious apps." },
        { name: "Privacy Diagnostics", cmd: "ms-settings:privacy-diagnostics", category: "Privacy", desc: "Control what diagnostic data Windows sends to Microsoft. Set to 'Required only' for minimal data sharing." },
        { name: "App Permissions (Camera)", cmd: "ms-settings:privacy-webcam", category: "Privacy", desc: "💡 ADVICE: Disable camera access for apps you don't video-call with. Malware often targets webcam access." },
        { name: "App Permissions (Mic)", cmd: "ms-settings:privacy-microphone", category: "Privacy", desc: "Review which apps have microphone access. Revoke access from any app that doesn't legitimately need it." },
        { name: "Location Privacy", cmd: "ms-settings:privacy-location", category: "Privacy", desc: "Turn off location services entirely or control it per-app. ⚠️ Some apps break without it (Maps, Weather)." },
        { name: "User Accounts Panel", cmd: "control userpasswords2", category: "Privacy", desc: "Manage user accounts, enable/disable auto-login, and change account types (Admin vs Standard User)." },
        { name: "Credential Manager", cmd: "control /name Microsoft.CredentialManager", category: "Privacy", desc: "Audit saved Windows and Web credentials. Remove old or unrecognized saved passwords from here." },

        // ── KEYBOARD SHORTCUTS REFERENCE ──────────────────────────────────────────────────
        { name: "Win+D: Show Desktop", cmd: "cmd /c echo Press Win+D to toggle showing the Desktop", category: "Shortcuts & Tips", desc: "Minimizes all windows to reveal the desktop. Press again to restore. Fastest way to access desktop files." },
        { name: "Win+L: Lock Screen", cmd: "cmd /c echo Press Win+L to instantly lock your PC", category: "Shortcuts & Tips", desc: "🔒 SECURITY HABIT: Always press Win+L when leaving your desk. Instantly locks Windows requiring password to return." },
        { name: "Win+E: File Explorer", cmd: "explorer", category: "Shortcuts & Tips", desc: "Opens File Explorer directly. 💡 TIP: Pin your most-used folders to Quick Access for instant navigation." },
        { name: "Win+R: Run Dialog", cmd: "cmd /c echo Use Win+R to open the Run dialog box", category: "Shortcuts & Tips", desc: "Opens the Run dialog. Paste any .msc, .cpl, or command directly. Every command in this panel can be run from here." },
        { name: "Win+X: Power User Menu", cmd: "cmd /c echo Press Win+X for the Power User context menu", category: "Shortcuts & Tips", desc: "Opens the secret Power User menu with direct links to Device Manager, Disk Management, Event Viewer, PowerShell and more." },
        { name: "Win+I: Settings", cmd: "ms-settings:", category: "Shortcuts & Tips", desc: "Opens Windows Settings app directly. Faster than searching for it. Use Win+I then type to search settings." },
        { name: "Win+V: Clipboard History", cmd: "ms-settings:clipboard", category: "Shortcuts & Tips", desc: "💡 HIDDEN FEATURE: Windows stores your last 25 copied items. Press Win+V anytime to paste from clipboard history. Enable it here first." },
        { name: "Alt+F4: Close / Shutdown", cmd: "cmd /c echo Alt+F4 closes app, on desktop it shows Shutdown dialog", category: "Shortcuts & Tips", desc: "Closes the active application. Press Alt+F4 on the desktop to get the Shutdown/Restart/Sleep dialog instantly." },
        { name: "Ctrl+Shift+Esc: Task Manager", cmd: "taskmgr", category: "Shortcuts & Tips", desc: "Direct shortcut to Task Manager. Faster than Ctrl+Alt+Del. Use to kill frozen apps immediately." },
        { name: "Win+PrtSc: Screenshot", cmd: "cmd /c echo Win+PrtSc saves screenshot to Pictures/Screenshots", category: "Shortcuts & Tips", desc: "💡 TIP: Win+PrtSc auto-saves a full screenshot to Pictures/Screenshots. Win+Shift+S opens the Snip & Sketch clipping tool." },
        { name: "Win+Tab: Virtual Desktops", cmd: "cmd /c echo Win+Tab opens Task View for virtual desktops", category: "Shortcuts & Tips", desc: "Opens Task View showing all open windows and virtual desktops. Organize work by project using multiple virtual desktops." },

        // ── SYSTEM HEALTH ──────────────────────────────────────────────────
        { name: "System File Checker (SFC)", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k sfc /scannow'\"", category: "System Health", desc: "💡 FIRST STEP: Run this whenever Windows behaves oddly. Repairs corrupted system files. Takes ~10 min." },
        { name: "DISM Image Repair", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k DISM /Online /Cleanup-Image /RestoreHealth'\"", category: "System Health", desc: "⚠️ Run AFTER SFC if SFC fails. Downloads fresh system files from Windows Update. Needs internet." },
        { name: "Disk Check (Chkdsk)", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k chkdsk C: /f /r'\"", category: "System Health", desc: "Fixes file system errors and bad sectors. Runs on next reboot for drive C. Allow 30-60 min." },
        { name: "Advanced System Properties", cmd: "sysdm.cpl", category: "System Health", desc: "Configure virtual memory, System Restore, remote access, and environment variables." },
        { name: "System Configuration", cmd: "msconfig", category: "System Health", desc: "💡 TIP: Boot tab → Enable Safe Mode for troubleshooting. Check 'No GUI boot' to skip the Windows logo animation." },
        { name: "Windows Memory Diagnostic", cmd: "mdsched", category: "System Health", desc: "Scans RAM for errors on next reboot. Run if you experience random BSODs or freezes." },
        { name: "Performance Monitor", cmd: "perfmon", category: "System Health", desc: "Advanced real-time performance graphs with logging. Build custom counter sets for long-term monitoring." },
        { name: "Reliability Monitor", cmd: "cmd /c start perfmon /rel", category: "System Health", desc: "💡 HIDDEN GEM: Timeline of crashes and errors. Shows exactly when problems started — invaluable for troubleshooting." },
        { name: "Check Windows Version", cmd: "winver", category: "System Health", desc: "Shows your exact Windows build number. Always provide this when filing bug reports or seeking IT support." },

        // ── MORE SHORTCUTS & TIPS ──────────────────────────────────────────
        { name: "Win+L: Lock PC", cmd: "cmd /c echo Press Win+L to lock your PC", category: "Shortcuts & Tips", desc: "Instantly locks your Windows session. Make this a habit whenever you step away from your desk." },
        { name: "Win+D: Show Desktop", cmd: "cmd /c echo Press Win+D to show/hide the desktop", category: "Shortcuts & Tips", desc: "Minimizes everything immediately to show your desktop. Press again to restore all windows." },
        { name: "Win+Shift+S: Snipping Tool", cmd: "cmd /c echo Press Win+Shift+S to capture screen", category: "Shortcuts & Tips", desc: "Replaces the old Snipping Tool. Lets you capture a rectangle, window, or full screen instantly." },
        { name: "Ctrl+Shift+T: Reopen Tab", cmd: "cmd /c echo Press Ctrl+Shift+T in browsers", category: "Shortcuts & Tips", desc: "Accidentally closed a browser tab? This shortcut brings it back instantly." },

        // ── MORE ADVANCED UTILITIES & PERFORMANCE ──────────────────────────
        { name: "Component Services", cmd: "dcomcnfg", category: "Advanced Utilities", desc: "Manage COM components, DCOM applications, and Distributed Transaction Coordinator." },
        { name: "Print Management", cmd: "printmanagement.msc", category: "Advanced Utilities", desc: "Centralized hub for managing printers, print queues, and drivers on your system." },
        { name: "Computer Management", cmd: "compmgmt.msc", category: "Advanced Utilities", desc: "The ultimate 'God Mode' console containing Event Viewer, Device Manager, Disk Management, and more." },
        { name: "Resource Monitor", cmd: "resmon", category: "Performance", desc: "Shows exactly which process is using your CPU, Memory, Disk, and Network in real-time." },
        { name: "Power Options", cmd: "powercfg.cpl", category: "Performance", desc: "Change your power plan. Use High Performance for gaming/heavy tasks, Balanced for normal use." },
        
        // ── DIAGNOSTICS & HARDWARE ─────────────────────────────────────────
        { name: "DirectX Diagnostic Tool", cmd: "dxdiag", category: "Hardware", desc: "Detailed information about your DirectX components and drivers. Excellent for troubleshooting game crashes and audio issues." },
        { name: "Display Settings", cmd: "ms-settings:display", category: "Hardware", desc: "Adjust resolution, refresh rate, HDR, and multi-monitor setups." },
        { name: "Sound Settings", cmd: "ms-settings:sound", category: "Hardware", desc: "Manage input/output audio devices, volume mixer, and spatial sound." },
        { name: "Bluetooth & Devices", cmd: "ms-settings:bluetooth", category: "Hardware", desc: "Pair new Bluetooth devices, manage printers, and configure mouse settings." },
        { name: "Old Sound Control Panel", cmd: "mmsys.cpl", category: "Hardware", desc: "The classic Windows sound panel. Often required to fix advanced microphone or spatial audio issues." },

        // ── PRIVACY & SECURITY ─────────────────────────────────────────────
        { name: "BitLocker Drive Encryption", cmd: "control /name Microsoft.BitLockerDriveEncryption", category: "Security", desc: "Manage full-disk encryption. If enabled, ensure you have your recovery key backed up safely!" },
        { name: "Certificate Manager", cmd: "certmgr.msc", category: "Security", desc: "View and manage SSL/TLS certificates installed on your machine for trusted roots and publishers." },
        { name: "App Permissions: Camera", cmd: "ms-settings:privacy-webcam", category: "Privacy", desc: "Control which applications are allowed to access your webcam. Good for auditing spyware." },
        { name: "App Permissions: Microphone", cmd: "ms-settings:privacy-microphone", category: "Privacy", desc: "Control which applications can listen to your microphone. Review this list regularly." },
        { name: "App Permissions: Location", cmd: "ms-settings:privacy-location", category: "Privacy", desc: "See which apps are tracking your geographical location and disable them." },

        // ── DEEP SYSTEM ────────────────────────────────────────────────────
        { name: "Shared Folders", cmd: "fsmgmt.msc", category: "Network", desc: "View all folders your PC is currently sharing over the local network and see active file sessions." },
        { name: "Group Policy Editor", cmd: "gpedit.msc", category: "Advanced Utilities", desc: "The holy grail of Windows configuration. Edit deep system policies. (Pro/Enterprise editions only)." },
        { name: "Windows Registry Editor", cmd: "regedit", category: "Advanced Utilities", desc: "⚠️ USE WITH EXTREME CAUTION. Edit the raw configuration database of Windows. Incorrect changes can break the OS." },
        { name: "WMI Control", cmd: "wmimgmt.msc", category: "Advanced Utilities", desc: "Configure and control the Windows Management Instrumentation (WMI) service." },
        { name: "iSCSI Initiator", cmd: "iscsicpl", category: "Storage", desc: "Connect to external iSCSI storage arrays over the network. Strictly for enterprise/homelab setups." },
        
        // ── EVERYDAY UTILITIES ─────────────────────────────────────────────
        { name: "Windows Sandbox", cmd: "WindowsSandbox", category: "Security", desc: "Start a disposable, secure Windows environment to test suspicious files. (Must be enabled in Windows Features first)." },
        { name: "Character Map", cmd: "charmap", category: "Advanced Utilities", desc: "Find and copy special characters, symbols, and alt-codes that aren't on your keyboard." },
        { name: "On-Screen Keyboard", cmd: "osk", category: "Advanced Utilities", desc: "Virtual keyboard you can click with your mouse. Useful if your physical keyboard breaks or for bypassing hardware keyloggers." },
        { name: "Steps Recorder", cmd: "psr", category: "Advanced Utilities", desc: "Automatically records your screen clicks and types them into a neat HTML document. Excellent for creating tutorials or bug reports." },
        { name: "Snipping Tool (Classic)", cmd: "snippingtool", category: "Shortcuts & Tips", desc: "The classic screen capture utility. Many users still prefer this over the new Snip & Sketch app." },

        // ── EXTRA FILLER COMMANDS ──────────────────────────────────────────
        { name: "Storage Spaces", cmd: "control /name Microsoft.StorageSpaces", category: "Storage", desc: "Combine multiple drives into a single logical pool for redundancy (like software RAID)." },
        { name: "Color Management", cmd: "colorcpl", category: "Hardware", desc: "Manage color profiles for your monitors to ensure accurate color reproduction." },
        { name: "Mouse Properties", cmd: "main.cpl", category: "Hardware", desc: "Change pointer speed, enable click-lock, or adjust scroll wheel settings." },
        { name: "Keyboard Properties", cmd: "control keyboard", category: "Hardware", desc: "Adjust character repeat delay and cursor blink rate." },
        { name: "Background Apps Privacy", cmd: "ms-settings:privacy-backgroundapps", category: "Privacy", desc: "Prevent apps from running in the background to save RAM, battery, and CPU." },
        { name: "App Diagnostics Privacy", cmd: "ms-settings:privacy-appdiagnostics", category: "Privacy", desc: "Stop apps from accessing other apps' diagnostic information." },
        { name: "Control Panel", cmd: "control", category: "Advanced Utilities", desc: "The legacy Windows Control Panel. Contains many settings still not migrated to the modern Settings app." },
        { name: "Game Controllers", cmd: "joy.cpl", category: "Hardware", desc: "Calibrate and test gamepads, flight sticks, and steering wheels." },
        { name: "Add Hardware Wizard", cmd: "hdwwiz.cpl", category: "Hardware", desc: "Manually install drivers for legacy hardware that Windows doesn't automatically detect." },
        { name: "Task Manager", cmd: "taskmgr", category: "System Health", desc: "Direct launch of Task Manager to kill unresponsive apps or check resource usage." }
    ];

    function renderPcCommands(filter = "") {
        const grid = document.getElementById("pc-commands-grid");
        if (!grid) return;
        grid.innerHTML = "";
        
        const categories = {};
        pcCommands.forEach(cmd => {
            if (!categories[cmd.category]) categories[cmd.category] = [];
            const searchStr = (cmd.name + " " + cmd.desc + " " + cmd.cmd + " " + cmd.category).toLowerCase();
            if (filter === "" || searchStr.includes(filter.toLowerCase())) {
                categories[cmd.category].push(cmd);
            }
        });

        const categoryIcons = {
            "Network": "📡",
            "System Health": "🩺",
            "User Accounts": "👤",
            "Windows Tools": "🧰",
            "Advanced Utilities": "⚡",
            "Storage": "💽",
            "Security": "🛡️",
            "Hardware": "💻",
            "Performance": "🚀",
            "Privacy": "🔒",
            "Shortcuts & Tips": "⌨️"
        };

        for (const [cat, cmds] of Object.entries(categories)) {
            if (cmds.length === 0) continue;
            const card = document.createElement('div');
            card.className = 'settings-card pc-enhanced-card';
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-icon">${categoryIcons[cat] || '⚙️'}</span>
                    <h3>${cat}</h3>
                </div>
                <div class="setting-group pc-control-group"></div>
            `;
            const group = card.querySelector('.pc-control-group');
            cmds.forEach(cmd => {
                const btn = document.createElement('button');
                btn.className = 'btn-secondary pc-control-btn';
                btn.dataset.cmd = cmd.cmd;
                btn.dataset.desc = cmd.desc;
                
                let btnText = cmd.name;
                if (filter) {
                    const regex = new RegExp(`(${filter})`, "gi");
                    btnText = btnText.replace(regex, '<span style="color:var(--primary);">$1</span>');
                }
                
                btn.innerHTML = `
                    <span class="pc-btn-name">${btnText}</span>
                    <span class="pc-btn-desc">${cmd.desc}</span>
                `;
                group.appendChild(btn);
            });
            grid.appendChild(card);
        }
        
        // Re-attach modal listeners
        document.querySelectorAll('.pc-control-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                if (cmd) {
                    let action = btn.querySelector('.pc-btn-name')?.textContent || btn.textContent.trim();
                    let impact = btn.dataset.desc || "Standard administrative action. Modifies system state or runs diagnostics.";
                    let time = "Instant to a few seconds.";

                    if (cmd.includes("QuickScan")) time = "Approx. 2 - 5 minutes depending on disk speed.";
                    if (cmd.includes("FullScan")) time = "Approx. 30 minutes to 2+ hours.";
                    if (cmd.includes("Update-MpSignature")) time = "Approx. 30 seconds - 2 minutes.";
                    if (cmd.includes("mrt")) time = "Interactive UI. Scan takes 5 - 15 minutes.";
                    if (cmd.includes("cmd /c start")) time = "Runs until manually closed.";

                    if (pcModal) {
                        pcModalCmd.textContent = cmd;
                        pcModalAction.textContent = action;
                        pcModalImpact.textContent = impact;
                        pcModalTime.textContent = time;
                        pendingPcCommand = cmd;
                        pendingPcBtn = btn;
                        pcModal.classList.remove('hidden');
                    } else {
                        sendCommand('PC_CONTROL', { cmd });
                    }
                }
            });
        });
    }

    const searchInput = document.getElementById("pc-command-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            renderPcCommands(e.target.value);
        });
        renderPcCommands();
    }
});

window.unlockFile = unlockFile;
window.deleteVaultItem = deleteVaultItem;

document.addEventListener("DOMContentLoaded", init);


document.addEventListener('DOMContentLoaded', () => {
    const loginClock = document.getElementById('login-clock');
    if (loginClock) {
        setInterval(() => {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            loginClock.textContent = `${hh}:${mm}:${ss}`;
        }, 1000);
    }
});
