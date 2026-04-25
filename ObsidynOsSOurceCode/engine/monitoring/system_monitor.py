"""Process and honeyfile monitoring."""
import csv
import io
import subprocess
from datetime import datetime


class SystemMonitor:
    """Tracks Windows processes and combines them with honeyfile alerts."""

    WATCHLIST = {
        "procmon": "Trace monitor",
        "procexp": "Process inspector",
        "processhacker": "Process inspector",
        "wireshark": "Packet capture",
        "dumpcap": "Packet capture",
        "fiddler": "HTTP interception",
        "tcpview": "Socket observer",
        "autoruns": "Startup inspector",
        "x64dbg": "Debugger",
        "x32dbg": "Debugger",
        "ollydbg": "Debugger",
        "ida": "Reverse engineering",
    }

    def __init__(self, decoy_manager):
        self.decoy_manager = decoy_manager
        self.active = False
        self.previous_processes = {}
        self.events = []
        self.watch_hits = set()

    def start(self):
        self.active = True
        self.previous_processes = self._capture_processes()
        self._append_event("MONITOR_ONLINE", "Background process tracing enabled")
        return self.get_status()

    def stop(self):
        self.active = False
        self.previous_processes = {}
        self.watch_hits = set()
        self._append_event("MONITOR_OFFLINE", "Background process tracing disabled")
        return self.get_status()

    def get_status(self):
        honey_alerts = self.decoy_manager.poll_alerts()
        processes = self._capture_processes() if self.active else {}

        if self.active:
            self._diff_processes(processes)
            suspicious_processes = self._detect_watchlist(processes)
            self.previous_processes = processes
        else:
            suspicious_processes = []

        top_processes = sorted(
            processes.values(), key=lambda entry: entry.get("memory_kb", 0), reverse=True
        )[:20]
        return {
            "status": "OK",
            "data": {
                "active": self.active,
                "process_count": len(processes),
                "processes": top_processes,
                "suspicious_processes": suspicious_processes[:12],
                "trace_posture": self._trace_posture(suspicious_processes, honey_alerts),
                "events": self.events[-40:],
                "honey_alerts": honey_alerts[-20:],
                "last_updated": datetime.utcnow().isoformat(timespec="seconds"),
            },
        }

    def _capture_processes(self):
        output = subprocess.check_output(
            ["tasklist", "/FO", "CSV", "/NH"],
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=0x08000000,
        )
        reader = csv.reader(io.StringIO(output))
        processes = {}

        for row in reader:
            if len(row) < 5:
                continue

            image_name, pid, session_name, session_num, mem_usage = row[:5]
            memory_kb = int("".join(ch for ch in mem_usage if ch.isdigit()) or "0")
            watch_tags = self._watch_tags(image_name)
            processes[pid] = {
                "pid": pid,
                "image_name": image_name,
                "session_name": session_name,
                "session_number": session_num,
                "memory_kb": memory_kb,
                "watch_tags": watch_tags,
                "risk_level": "elevated" if watch_tags else "normal",
            }

        return processes

    def _diff_processes(self, current_processes):
        current_ids = set(current_processes)
        previous_ids = set(self.previous_processes)

        for pid in sorted(current_ids - previous_ids):
            proc = current_processes[pid]
            self._append_event(
                "PROCESS_START",
                f"{proc['image_name']} appeared with PID {proc['pid']}",
            )

        for pid in sorted(previous_ids - current_ids):
            proc = self.previous_processes[pid]
            self._append_event(
                "PROCESS_EXIT",
                f"{proc['image_name']} exited from trace set",
            )

        active_hits = {
            f"{pid}:{','.join(current_processes[pid].get('watch_tags', []))}"
            for pid in current_ids
            if current_processes[pid].get("watch_tags")
        }
        self.watch_hits.intersection_update(active_hits)

    def _detect_watchlist(self, processes):
        suspicious = []
        for pid, process in sorted(
            processes.items(),
            key=lambda item: item[1].get("memory_kb", 0),
            reverse=True,
        ):
            watch_tags = process.get("watch_tags", [])
            if not watch_tags:
                continue

            signature = f"{pid}:{','.join(watch_tags)}"
            suspicious.append(process)
            if signature not in self.watch_hits:
                self.watch_hits.add(signature)
                self._append_event(
                    "WATCHLIST_HIT",
                    f"{process['image_name']} matched {', '.join(watch_tags)}",
                )

        return suspicious

    def _watch_tags(self, image_name):
        lowered = (image_name or "").lower()
        tags = []
        for needle, label in self.WATCHLIST.items():
            if needle in lowered:
                tags.append(label)
        return tags

    @staticmethod
    def _trace_posture(suspicious_processes, honey_alerts):
        if suspicious_processes and honey_alerts:
            return "critical"
        if suspicious_processes or honey_alerts:
            return "elevated"
        return "nominal"

    def _append_event(self, kind, message):
        self.events.append(
            {
                "kind": kind,
                "message": message,
                "timestamp": datetime.utcnow().isoformat(timespec="seconds"),
            }
        )
        self.events = self.events[-120:]

    def clear_events(self):
        """Wipe all recorded signal events from memory."""
        self.events = []
        self.watch_hits = set()
