"""Vault scanning logic."""
import os
from utils.logger import mask_path


class VaultScanner:
    """Scans vault directory for hidden files."""

    def __init__(self):
        self.vault_path = self._get_vault_path()

    def _get_vault_path(self):
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "data", "vaults")

    def scan(self):
        """Scan for hidden .aegis files."""
        try:
            hidden_files = []
            if not os.path.exists(self.vault_path):
                return {"status": "OK", "data": {"found": 0, "files": []}}

            for filename in os.listdir(self.vault_path):
                if filename.endswith('.aegis'):
                    file_path = os.path.join(self.vault_path, filename)
                    hidden_files.append({
                        "container": filename,
                        "path": mask_path(file_path),
                        "size": os.path.getsize(file_path),
                    })

            return {"status": "OK", "data": {"found": len(hidden_files), "files": hidden_files}}
        except Exception as exc:
            return {"status": "ERROR", "data": f"Scan failed: {exc}"}
