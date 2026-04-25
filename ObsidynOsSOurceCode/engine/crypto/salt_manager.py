"""Salt management for key derivation."""
import base64
import json
import os
from utils.logger import log, log_exception
from utils.file_utils import FileUtils


class SaltManager:
    """Manages cryptographic salt."""

    def __init__(self):
        self.salt_path = self._get_salt_path()
        self.salt = self._load_or_create_salt()

    def _get_salt_path(self):
        """Get path to salt file."""
        data_dir = os.environ.get('OBSIDYN_DATA_DIR')
        if data_dir:
            return os.path.join(data_dir, "config", "security_policy.sys")
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "config", "security_policy.sys")

    def _load_or_create_salt(self):
        """Load existing salt or create new one."""
        try:
            data = FileUtils.read_json(self.salt_path)
            if data and isinstance(data, dict):
                salt = data.get('salt')
                if salt:
                    base64.b64decode(salt.encode('utf-8'), validate=True)
                    log("[SALT] Loaded existing salt", level="DEBUG")
                    return salt
        except Exception as exc:
            log_exception(f"[SALT] Error loading salt: {exc}", exc)

        salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        self._save_salt(salt)
        log("[SALT] Created new salt", level="DEBUG")
        return salt

    def _save_salt(self, salt):
        """Save salt to file."""
        try:
            os.makedirs(os.path.dirname(self.salt_path), exist_ok=True)
            FileUtils.write_json(self.salt_path, {'salt': salt})
            log("[SALT] Salt saved", level="DEBUG")
        except Exception as exc:
            log_exception(f"[SALT] Error saving salt: {exc}", exc)

    def get_salt(self):
        """Get current salt string."""
        return self.salt

    def get_salt_bytes(self):
        """Get current salt as raw bytes."""
        return base64.b64decode(self.salt.encode('utf-8'))
