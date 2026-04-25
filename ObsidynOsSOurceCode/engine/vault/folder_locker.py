"""Folder locking logic."""
import hashlib
import io
import os
import zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils.file_utils import FileUtils
from security.file_hider import FileHider
from security.secure_deleter import SecureDeleter


class FolderLocker:
    """Handles folder locking operations."""

    def __init__(self, session_key, vault_index):
        self.session_key = session_key
        self.index = vault_index
        self.hider = FileHider()
        self.deleter = SecureDeleter()

    def lock(self, folder_path):
        """Lock an entire folder."""
        try:
            if not os.path.exists(folder_path):
                return {"status": "ERROR", "data": "Folder not found"}
            if not os.path.isdir(folder_path):
                return {"status": "ERROR", "data": "Path is not a folder"}

            original_name = os.path.basename(folder_path.rstrip('/\\'))
            original_path = os.path.abspath(folder_path)
            total_files, total_size = FileUtils.count_folder_contents(folder_path)

            archive_buffer = io.BytesIO()
            with zipfile.ZipFile(archive_buffer, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zip_file:
                for root, _, files in os.walk(folder_path):
                    for file_name in files:
                        file_path = os.path.join(root, file_name)
                        arcname = os.path.relpath(file_path, os.path.dirname(folder_path))
                        zip_file.write(file_path, arcname)

            data = archive_buffer.getvalue()
            zip_hash = hashlib.sha256(data).hexdigest()

            aesgcm = AESGCM(self.session_key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, data, None)

            container_name = self.index.generate_container_name(f"{original_name}_folder")
            container_path = self.index.get_vault_path(container_name)
            FileUtils.write_file(container_path, nonce + ciphertext)
            container_size = os.path.getsize(container_path)

            self.hider.hide(container_path)
            self.deleter.secure_delete_path(folder_path)

            metadata = {
                "container_name": container_name,
                "original_name": original_name,
                "original_path": self.index.sanitize_original_path(original_path),
                "original_size": total_size,
                "original_hash": zip_hash,
                "container_size": container_size,
                "locked_at": FileUtils.get_timestamp(),
                "type": "folder",
                "file_count": total_files,
            }
            self.index.add_item(container_name, original_path, "folder", metadata)
            return {"status": "SUCCESS", "data": f"Locked folder: {original_name} ({total_files} files)", "metadata": metadata}
        except Exception as exc:
            return {"status": "ERROR", "data": f"Folder lock failed: {exc}"}
