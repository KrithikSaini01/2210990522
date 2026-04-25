"""Vault deletion logic."""
import os
from security.file_hider import FileHider
from security.secure_deleter import SecureDeleter


class VaultDeleter:
    """Handles vault item deletion."""

    def __init__(self, vault_index):
        self.index = vault_index
        self.hider = FileHider()
        self.deleter = SecureDeleter()

    def delete(self, container_name):
        """Delete vault item permanently."""
        try:
            container_info = self.index.get_item(container_name)
            if not container_info:
                return {"status": "ERROR", "data": "Container not found"}

            container_path = self.index.get_vault_path(container_name)
            if not os.path.exists(container_path):
                return {"status": "ERROR", "data": "Container file not found"}

            metadata = self.index.get_metadata(container_name)
            original_name = metadata.get('original_name', container_name)

            self.hider.unhide(container_path)
            self.deleter.secure_delete(container_path)
            self.index.remove_item(container_name)

            return {"status": "SUCCESS", "data": f"Permanently deleted: {original_name}"}
        except Exception as exc:
            return {"status": "ERROR", "data": f"Delete failed: {exc}"}
