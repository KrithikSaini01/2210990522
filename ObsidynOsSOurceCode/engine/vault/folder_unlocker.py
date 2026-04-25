"""Folder unlocking logic."""
import io
import os
import zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils.file_utils import FileUtils
from security.file_hider import FileHider


class FolderUnlocker:
    """Handles folder unlocking operations."""

    def __init__(self, session_key, vault_index):
        self.session_key = session_key
        self.index = vault_index
        self.hider = FileHider()

    def unlock(self, container_name, restore_path):
        """Unlock a folder."""
        container_path = None
        try:
            container_info = self.index.get_item(container_name)
            if not container_info:
                return {"status": "ERROR", "data": "Container not found"}

            container_path = self.index.get_vault_path(container_name)
            if not os.path.exists(container_path):
                return {"status": "ERROR", "data": "Container file not found"}

            metadata = self.index.get_metadata(container_name)
            self.hider.unhide(container_path)
            data = FileUtils.read_file(container_path)

            nonce = data[:12]
            ciphertext = data[12:]
            aesgcm = AESGCM(self.session_key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            with zipfile.ZipFile(io.BytesIO(plaintext), 'r') as zip_file:
                FileUtils.safe_extract_zip(zip_file, restore_path)

            os.remove(container_path)
            self.index.remove_item(container_name)

            original_name = metadata.get('original_name', 'restored_folder')
            return {"status": "SUCCESS", "data": f"Unlocked: {original_name}", "restore_path": restore_path}
        except Exception as exc:
            if container_path and os.path.exists(container_path):
                self.hider.hide(container_path)
            return {"status": "ERROR", "data": f"Unlock failed: {exc}"}
