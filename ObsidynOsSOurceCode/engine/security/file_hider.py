"""File hiding for Windows."""
import ctypes
from utils.logger import log, log_exception


class FileHider:
    """Hides files from Windows Explorer."""

    def hide(self, file_path):
        """Hide file using SYSTEM + HIDDEN attributes."""
        try:
            ctypes.windll.kernel32.SetFileAttributesW(file_path, 0x02 | 0x04)
            log("[HIDER] File hidden", level="DEBUG")
            return True
        except Exception as exc:
            log_exception(f"[HIDER] Hide failed: {exc}", exc)
            return False

    def unhide(self, file_path):
        """Unhide file."""
        try:
            ctypes.windll.kernel32.SetFileAttributesW(file_path, 0x80)
            log("[HIDER] File revealed", level="DEBUG")
            return True
        except Exception as exc:
            log_exception(f"[HIDER] Unhide failed: {exc}", exc)
            return False
