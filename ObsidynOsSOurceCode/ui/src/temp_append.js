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
    { name: "Flush DNS Cache", cmd: "ipconfig /flushdns", category: "Network", desc: "Clears the DNS resolver cache. Useful for fixing internet connection issues." },
    { name: "Continuous Ping (Google)", cmd: "cmd /c start cmd /k ping 8.8.8.8 -t", category: "Network", desc: "Continuously pings Google DNS to monitor packet loss and latency." },
    { name: "Network Connections", cmd: "ncpa.cpl", category: "Network", desc: "Opens the classic Network Connections control panel." },
    { name: "System File Checker", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k sfc /scannow'\"", category: "System Health", desc: "Scans and repairs corrupted Windows system files. Requires Admin." },
    { name: "DISM Image Repair", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k DISM /Online /Cleanup-Image /RestoreHealth'\"", category: "System Health", desc: "Repairs the Windows image if SFC fails. Requires Admin." },
    { name: "Disk Check (Chkdsk)", cmd: "powershell -Command \"Start-Process cmd -Verb RunAs -ArgumentList '/k chkdsk C: /f /r'\"", category: "System Health", desc: "Scans the hard drive for errors and bad sectors." },
    { name: "Resource Monitor", cmd: "resmon", category: "Advanced Utilities", desc: "Detailed real-time monitoring of CPU, Disk, Network, and Memory usage." },
    { name: "Computer Management", cmd: "compmgmt.msc", category: "Advanced Utilities", desc: "Access Event Viewer, Task Scheduler, Disk Management, and more in one place." },
    { name: "Local Security Policy", cmd: "secpol.msc", category: "Advanced Utilities", desc: "Manage local security policies like password requirements and user rights." },
    { name: "Event Viewer", cmd: "eventvwr", category: "Advanced Utilities", desc: "View detailed system and application logs for troubleshooting." },
    { name: "Services", cmd: "services.msc", category: "Advanced Utilities", desc: "Start, stop, and configure background Windows services." },
    { name: "Group Policy Editor", cmd: "gpedit.msc", category: "Advanced Utilities", desc: "Advanced system configuration editor (Pro/Enterprise editions only)." },
    { name: "Add/Remove Programs", cmd: "appwiz.cpl", category: "Advanced Utilities", desc: "The classic control panel for uninstalling software." },
    { name: "Internet Properties", cmd: "inetcpl.cpl", category: "Advanced Utilities", desc: "Configure advanced internet settings, proxies, and security zones." },
    { name: "Power Options", cmd: "powercfg.cpl", category: "Advanced Utilities", desc: "Manage power plans and sleep settings." },
    { name: "Windows Tools", cmd: "control admintools", category: "Advanced Utilities", desc: "Folder containing shortcuts to administrative tools." },
    { name: "Disk Cleanup", cmd: "cleanmgr", category: "Storage", desc: "Free up disk space by deleting temporary files and system caches." },
    { name: "Windows Security", cmd: "windowsdefender:", category: "Security", desc: "Open the Windows Defender GUI dashboard." },
    { name: "Malicious Software Tool", cmd: "mrt", category: "Security", desc: "Launch the Microsoft Malicious Software Removal Tool (MRT)." },
    { name: "Quick Anti-Malware Scan", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-Command', 'Write-Host ''Starting Quick Scan...''; Start-MpScan -ScanType QuickScan; Write-Host ''Scan Completed!'''\"", category: "Security", desc: "Scans critical system areas where malware usually hides." },
    { name: "Deep System Scan", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-Command', 'Write-Host ''Starting Deep System Scan...''; Start-MpScan -ScanType FullScan; Write-Host ''Scan Completed!'''\"", category: "Security", desc: "Extensive scan of all files, folders, and active processes." },
    { name: "Update Virus Definitions", cmd: "powershell -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-Command', 'Write-Host ''Updating Virus Definitions...''; Update-MpSignature; Write-Host ''Update Completed!'''\"", category: "Security", desc: "Connects to Microsoft servers to fetch the latest threat definitions." },
    { name: "Windows Firewall", cmd: "control firewall.cpl", category: "Security", desc: "Configure Windows Defender Firewall settings." },
    { name: "Advanced Firewall", cmd: "wf.msc", category: "Security", desc: "Windows Defender Firewall with Advanced Security." },
    { name: "Disk Management", cmd: "diskmgmt.msc", category: "Hardware", desc: "Create, format, and resize hard drive partitions." },
    { name: "Device Manager", cmd: "devmgmt.msc", category: "Hardware", desc: "Manage hardware drivers and devices." },
    { name: "DirectX Diagnostic", cmd: "dxdiag", category: "Hardware", desc: "Detailed system information and DirectX capabilities." },
    { name: "System Information", cmd: "msinfo32", category: "Hardware", desc: "Comprehensive hardware resources, components, and software environment info." },
    { name: "Advanced System Properties", cmd: "sysdm.cpl", category: "System Health", desc: "Configure environment variables, performance settings, and system protection." },
    { name: "System Configuration", cmd: "msconfig", category: "System Health", desc: "Manage startup selection and boot options." }
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
        "Advanced Utilities": "⚡",
        "Storage": "💽",
        "Security": "🛡️",
        "Hardware": "💻"
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
                    <div style="display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:4px;">
                        <span style="font-weight:600;">${btnText}</span>
                        <span style="font-size:10px;color:var(--text-secondary);opacity:0.8;line-height:1.2;font-weight:normal;">${cmd.desc}</span>
                    </div>
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
                let action = btn.querySelector('span[style*="font-weight:600"]')?.textContent || btn.textContent.trim();
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

window.unlockFile = unlockFile;
window.deleteVaultItem = deleteVaultItem;

document.addEventListener("DOMContentLoaded", init);
