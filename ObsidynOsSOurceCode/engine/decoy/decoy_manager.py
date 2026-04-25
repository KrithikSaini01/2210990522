"""Decoy vault and honeyfile management.

Detection strategy:
  - FILE_MODIFIED : SHA-256 hash change  → always a real threat signal.
  - FILE_REMOVED  : file gone            → always a real threat signal.
  - FILE_OPENED   : access-time advanced AND the process that last opened
                    the file is a HUMAN process (not a system background
                    service).  Requires psutil; degrades gracefully without it.

System-noise suppression:
    Windows continuously updates atime via SearchIndexer, MsMpEng (Defender),
    svchost, TiWorker, WmiPrvSE, and Prefetch.  We maintain a blocklist of
    known-noise executables and skip alerts caused by them.  If we cannot
    determine the process (psutil unavailable or access denied), we apply a
    minimum QUIET_WINDOW_S cooldown between touch-alerts to dampen spam.
"""

import hashlib
import os
import random
import secrets
import shutil
import time

from utils.email_notifier import EmailNotifier
from utils.file_utils import FileUtils
from utils.logger import log_exception, mask_path

# ---------------------------------------------------------------------------
# Noise suppression configuration
# ---------------------------------------------------------------------------

# System / background executables that should NEVER trigger a FILE_OPENED alert.
_SYSTEM_NOISE_PROCS = frozenset({
    # Windows indexing & search
    "searchindexer.exe", "searchprotocolhost.exe", "searchfilterhost.exe",
    # Windows Defender / MRT
    "msmpeng.exe", "mpcmdrun.exe", "nissrv.exe", "mpdefender.exe",
    # Windows Update / maintenance
    "tiworker.exe", "trustedinstaller.exe", "wuauclt.exe", "musnotification.exe",
    # WMI
    "wmiprvse.exe", "wmiapsrv.exe",
    # Service Host (generic)
    "svchost.exe",
    # System idle / kernel
    "system", "system idle process", "registry",
    # Antivirus / security vendors (common)
    "avp.exe", "avg.exe", "avast.exe", "mbam.exe", "bdservicehost.exe",
    # Thumbnails / shell
    "dllhost.exe",
    # Our own process
    "python.exe", "pythonw.exe", "electron.exe", "node.exe",
})

# If psutil is unavailable, only alert once per file per this window (seconds).
_QUIET_WINDOW_S = 60  # seconds between fallback touch-alerts per file

# Minimum atime delta (nanoseconds) that counts as a real access change.
# Filters out sub-millisecond filesystem jitter on some NTFS implementations.
_MIN_ATIME_DELTA_NS = 1_000_000  # 1 ms


# ---------------------------------------------------------------------------
# psutil helper — optional dependency
# ---------------------------------------------------------------------------

try:
    import psutil as _psutil
    _PSUTIL_AVAILABLE = True
except ImportError:  # pragma: no cover
    _psutil = None
    _PSUTIL_AVAILABLE = False


def _get_process_accessing(file_path: str):
    """Return (pid, exe_name_lower) of the first non-system process that has
    the file open, or (None, None) if none found or psutil unavailable."""
    if not _PSUTIL_AVAILABLE:
        return None, None
    try:
        norm = os.path.normcase(os.path.abspath(file_path))
        for proc in _psutil.process_iter(["pid", "name", "open_files"]):
            try:
                pinfo = proc.info
                name_lower = (pinfo.get("name") or "").lower()
                if name_lower in _SYSTEM_NOISE_PROCS:
                    continue
                for of in (pinfo.get("open_files") or []):
                    if os.path.normcase(of.path) == norm:
                        return pinfo["pid"], name_lower
            except (_psutil.AccessDenied, _psutil.NoSuchProcess, PermissionError):
                continue
    except Exception:  # pragma: no cover
        pass
    return None, None


def _classify_event(exe_name: str | None) -> str:
    """Map an executable name to a human-readable interaction label."""
    if not exe_name:
        return "Unknown Process"
    _MAP = {
        "explorer.exe": "Windows Explorer (opened / copied)",
        "cmd.exe":      "Command Prompt",
        "powershell.exe": "PowerShell",
        "pwsh.exe":     "PowerShell Core",
        "notepad.exe":  "Notepad",
        "wordpad.exe":  "WordPad",
        "winword.exe":  "Microsoft Word",
        "excel.exe":    "Microsoft Excel",
        "code.exe":     "VS Code",
        "7zg.exe":      "7-Zip (archive operation)",
        "7z.exe":       "7-Zip CLI",
        "winrar.exe":   "WinRAR",
        "robocopy.exe": "Robocopy (file copy)",
        "xcopy.exe":    "XCopy",
        "mspaint.exe":  "MS Paint",
        "acrobat.exe":  "Adobe Acrobat",
        "chrome.exe":   "Google Chrome",
        "msedge.exe":   "Microsoft Edge",
        "firefox.exe":  "Mozilla Firefox",
    }
    return _MAP.get(exe_name.lower(), exe_name)


# ---------------------------------------------------------------------------
# DecoyManager
# ---------------------------------------------------------------------------

class DecoyManager:
    """Creates and tracks decoy vaults plus honeyfiles."""

    BAIT_LIBRARY = {
        "finance": [
            ("Quarterly_Reconciliation.csv", "ledger_id,amount,status\nA-1409,12440.90,PENDING\nB-3920,810.00,HOLD\n"),
            ("Board_Remittance_Notes.txt", "Settlement references held for approval.\nEscalate only through secure channel.\n"),
            ("Vendor_Payout_Map.md", "# Vendor Payout Map\n- Corridor-1: Manual release\n- Corridor-2: Review pending\n"),
        ],
        "research": [
            ("Prototype_Transfer_Log.txt", "Transfer corridor reopened at 04:30 UTC.\nChecksum review still pending.\n"),
            ("Field_Study_Index.csv", "sample_id,zone,priority\nR-19,North,High\nR-21,East,Critical\n"),
            ("Acquisition_Notes.md", "# Acquisition Notes\nObservation lattice requires second pass.\n"),
        ],
        "operations": [
            ("Ops_Rotation_Grid.csv", "unit,window,location\nEcho,21:00,Delta\nKilo,03:00,North\n"),
            ("Transit_Access_Brief.txt", "Transit corridors remain compartmentalized.\nPhysical keys rotated on weekday cycle.\n"),
            ("Containment_Checklist.md", "# Containment Checklist\n- Stage decoy media\n- Verify watchlist\n"),
        ],
    }

    def __init__(self, config_manager=None):
        self.config = config_manager
        self.email_notifier = EmailNotifier(config_manager) if config_manager else None
        self.registry_path = self._get_registry_path()
        self.registry = self._load_registry()
        # {file_path: last_alert_wall_time}  — used for quiet-window fallback
        self._last_touch_alert: dict[str, float] = {}

    # ------------------------------------------------------------------ registry

    def _get_registry_path(self):
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        decoy_dir = os.path.join(project_root, "data", "decoys")
        os.makedirs(decoy_dir, exist_ok=True)
        return os.path.join(decoy_dir, "registry.sys")

    def _load_registry(self):
        try:
            loaded = FileUtils.read_json(self.registry_path)
            if isinstance(loaded, dict):
                loaded.setdefault("vaults", [])
                loaded.setdefault("events", [])
                return loaded
        except Exception as exc:
            log_exception(f"[DECOY] Error loading registry: {exc}", exc)
        return {"vaults": [], "events": []}

    def _save_registry(self):
        FileUtils.write_json(self.registry_path, self.registry)

    # ------------------------------------------------------------------ create

    def create_decoy_vault(self, target_dir=None, profile="operations", file_count=3):
        target_root = target_dir or os.path.dirname(self.registry_path)
        os.makedirs(target_root, exist_ok=True)

        vault_id = secrets.token_hex(5)
        folder_name = f"Ops_Archive_{vault_id.upper()}"
        vault_path = os.path.join(target_root, folder_name)
        os.makedirs(vault_path, exist_ok=True)

        bait_pool = list(self.BAIT_LIBRARY.get(profile, self.BAIT_LIBRARY["operations"]))
        random.shuffle(bait_pool)
        selected = bait_pool[: max(1, min(file_count, len(bait_pool)))]

        records = []
        for file_name, content in selected:
            file_path = os.path.join(vault_path, file_name)
            tagged_content = (
                f"{content}\n# honey_id={vault_id}\n# token={secrets.token_hex(8)}\n"
            )
            FileUtils.write_file(file_path, tagged_content.encode("utf-8"))
            records.append(self._snapshot_file(file_path))

        vault_record = {
            "id": vault_id,
            "profile": profile,
            "label": folder_name,
            "path": vault_path,
            "created_at": FileUtils.get_timestamp(milliseconds=True),
            "files": records,
            "alerts": [],
        }
        self.registry["vaults"].append(vault_record)
        self._append_event("DECOY_CREATED", f"Decoy vault seeded at {mask_path(vault_path)}")
        self._save_registry()
        return {
            "status": "SUCCESS",
            "data": f"Decoy vault created: {folder_name}",
            "vault": self._sanitize_vault(vault_record),
        }

    # ------------------------------------------------------------------ status / alerts

    def get_status(self):
        alerts = self.poll_alerts()
        return {
            "status": "OK",
            "data": {
                "vaults": [self._sanitize_vault(v) for v in self.registry["vaults"]],
                "alerts": alerts,
                "event_count": len(self.registry["events"]),
                "memory_log_entries": len(self.registry["events"]),
                "deployment_root": mask_path(os.path.dirname(self.registry_path)),
            },
        }

    def poll_alerts(self):
        """Check each honeyfile and return new threat alerts.

        Detection logic (in priority order):
          1. FILE_REMOVED   — file no longer exists.
          2. FILE_MODIFIED  — SHA-256 changed.
          3. FILE_OPENED    — atime advanced by a human process.
        """
        alerts = []
        for vault in self.registry["vaults"]:
            for index, file_record in enumerate(vault.get("files", [])):
                current_path = file_record.get("path")
                if not current_path:
                    continue

                # ── 1. REMOVED ────────────────────────────────────────────
                if not os.path.exists(current_path):
                    alerts.append(
                        self._make_alert(vault, current_path, "FILE_REMOVED",
                                         "⚠️ Honeyfile was DELETED from the decoy vault")
                    )
                    continue

                current = self._snapshot_file(current_path)

                # ── 2. MODIFIED (content change) ───────────────────────────
                if current["sha256"] != file_record.get("sha256"):
                    alerts.append(
                        self._make_alert(vault, current_path, "FILE_MODIFIED",
                                         "⚠️ Honeyfile content was MODIFIED")
                    )
                    vault["files"][index] = current
                    continue

                # ── 3. OPENED — suppress system noise ─────────────────────
                prev_atime = file_record.get("last_accessed", 0)
                curr_atime = current.get("last_accessed", 0)
                atime_delta = curr_atime - prev_atime

                if atime_delta >= _MIN_ATIME_DELTA_NS:
                    # atime advanced — now determine WHO did it
                    pid, exe_name = _get_process_accessing(current_path)

                    if exe_name is not None:
                        # psutil found a non-system process actively holding the file
                        label = _classify_event(exe_name)
                        alert = self._make_alert(
                            vault, current_path, "FILE_OPENED",
                            f"🚨 Honeyfile accessed by user process: {label} (PID {pid})"
                        )
                        alert["process"] = exe_name
                        alert["pid"] = pid
                        alerts.append(alert)
                        vault["files"][index] = current

                    elif not _PSUTIL_AVAILABLE:
                        # psutil not installed — use quiet-window to reduce spam
                        now = time.monotonic()
                        last = self._last_touch_alert.get(current_path, 0)
                        if now - last >= _QUIET_WINDOW_S:
                            alerts.append(
                                self._make_alert(
                                    vault, current_path, "FILE_OPENED",
                                    "⚠️ Honeyfile atime advanced (process unknown — install psutil for attribution)"
                                )
                            )
                            self._last_touch_alert[current_path] = now
                            vault["files"][index] = current
                    # else: psutil available but no non-system process found → system noise, skip

        if alerts:
            for alert in alerts:
                if (self.email_notifier and self.config and
                        self.config.get("decoy_email_live",
                                        self.config.get("decoy_email_enabled", False))):
                    email_result = self.email_notifier.send_decoy_alert(alert)
                    alert["email_sent"] = bool(email_result.get("sent"))
                    if not email_result.get("sent"):
                        alert["email_error"] = email_result.get("reason")
                self.registry["events"].append(alert)
            self.registry["events"] = self.registry["events"][-100:]
            self._save_registry()

        return self.registry["events"][-20:]

    # ------------------------------------------------------------------ helpers

    def _make_alert(self, vault, file_path, kind, message):
        alert = {
            "kind": kind,
            "message": message,
            "vault": vault.get("label"),
            "file": mask_path(file_path),
            "timestamp": FileUtils.get_timestamp(milliseconds=True),
        }
        vault.setdefault("alerts", []).append(alert)
        vault["alerts"] = vault["alerts"][-20:]
        return alert

    def _append_event(self, kind, message):
        self.registry["events"].append({
            "kind": kind,
            "message": message,
            "timestamp": FileUtils.get_timestamp(milliseconds=True),
        })
        self.registry["events"] = self.registry["events"][-100:]

    # ------------------------------------------------------------------ clear / export

    def clear_all_decoys(self):
        """Remove every deployed decoy vault and reset the vault registry."""
        removed, failures = 0, []
        for vault in list(self.registry.get("vaults", [])):
            vault_path = vault.get("path")
            if not vault_path:
                continue
            try:
                if os.path.isdir(vault_path):
                    shutil.rmtree(vault_path, ignore_errors=False)
                elif os.path.exists(vault_path):
                    os.remove(vault_path)
                removed += 1
            except Exception as exc:
                failures.append(f"{mask_path(vault_path)}: {exc}")
                log_exception(f"[DECOY] Failed to remove vault {vault_path}: {exc}", exc)

        self.registry["vaults"] = []
        self._append_event("DECOY_RESET", f"{removed} decoy vault(s) removed")
        self._save_registry()
        message = f"Removed {removed} decoy vault(s)."
        if failures:
            message += f" {len(failures)} removal issue(s) recorded."
        return {
            "status": "SUCCESS" if not failures else "PARTIAL",
            "data": message,
            "removed_count": removed,
            "failures": failures,
        }

    def clear_history(self):
        """Clear recorded honey alerts and event history while keeping deployments."""
        for vault in self.registry.get("vaults", []):
            vault["alerts"] = []
        self.registry["events"] = []
        self._save_registry()
        return {"status": "SUCCESS", "data": "Decoy history cleared"}

    def export_memory_log(self):
        """Return a text export of current decoy memory events and deployments."""
        lines = [
            "OBSIDYN Decoy Memory Log",
            f"Generated: {FileUtils.get_timestamp(milliseconds=True)}",
            "",
            f"Active vaults: {len(self.registry.get('vaults', []))}",
            f"Recorded events: {len(self.registry.get('events', []))}",
            "",
            "Active Deployments",
            "------------------",
        ]
        vaults = self.registry.get("vaults", [])
        if not vaults:
            lines.append("No active decoy vaults.")
        else:
            for vault in vaults:
                lines.extend([
                    f"- {vault.get('label', 'Unknown')} [{vault.get('profile', 'operations')}]",
                    f"  Path: {mask_path(vault.get('path', ''))}",
                    f"  Created: {vault.get('created_at', 'Unknown')}",
                    f"  Honeyfiles: {len(vault.get('files', []))}",
                ])

        lines.extend(["", "Event Timeline", "--------------"])
        events = self.registry.get("events", [])
        if not events:
            lines.append("No events recorded.")
        else:
            for event in events:
                lines.append(
                    f"{event.get('timestamp', 'Unknown')} | {event.get('kind', 'EVENT')} | "
                    f"{event.get('file') or event.get('message') or 'No detail'}"
                )

        return {
            "status": "OK",
            "data": {
                "filename": f"obsidyn_decoy_memory_log_{FileUtils.get_timestamp().replace(':', '-').replace('T', '_')}.txt",
                "content": "\n".join(lines),
            },
        }

    # ------------------------------------------------------------------ internals

    def _sanitize_vault(self, vault):
        return {
            "id": vault.get("id"),
            "profile": vault.get("profile"),
            "label": vault.get("label"),
            "path": mask_path(vault.get("path", "")),
            "created_at": vault.get("created_at"),
            "file_count": len(vault.get("files", [])),
            "alerts": vault.get("alerts", [])[-5:],
            "files": [
                {
                    "name": mask_path(fr.get("path", "")),
                    "size": fr.get("size", 0),
                    "last_accessed": fr.get("last_accessed"),
                }
                for fr in vault.get("files", [])
            ],
        }

    def _snapshot_file(self, file_path):
        payload = FileUtils.read_file(file_path)
        stat = os.stat(file_path)
        return {
            "path": file_path,
            "size": stat.st_size,
            "last_modified": stat.st_mtime_ns,
            "last_accessed": stat.st_atime_ns,
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
