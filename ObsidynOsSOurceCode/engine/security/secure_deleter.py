"""Secure file deletion."""
import os
from utils.logger import log_exception


class SecureDeleter:
    """Securely deletes files with multiple overwrites."""

    def secure_delete(self, file_path):
        """Securely delete a single file with a 3-pass overwrite."""
        if not file_path or not os.path.exists(file_path):
            return False

        if os.path.isdir(file_path):
            return self.secure_delete_path(file_path)

        try:
            file_size = os.path.getsize(file_path)

            for _ in range(3):
                with open(file_path, 'r+b' if file_size else 'wb') as file_handle:
                    if file_size:
                        file_handle.seek(0)
                        file_handle.write(os.urandom(file_size))
                    file_handle.flush()
                    os.fsync(file_handle.fileno())

            os.remove(file_path)
            return True
        except Exception as exc:
            log_exception(f"[DELETER] Secure delete failed: {exc}", exc)
            try:
                os.remove(file_path)
                return True
            except OSError:
                return False

    def secure_delete_path(self, target_path):
        """Securely delete a file or recursively clear a directory tree."""
        if not target_path or not os.path.exists(target_path):
            return False

        if os.path.isfile(target_path):
            return self.secure_delete(target_path)

        success = True
        for root, dirs, files in os.walk(target_path, topdown=False):
            for file_name in files:
                file_path = os.path.join(root, file_name)
                success = self.secure_delete(file_path) and success
            for dir_name in dirs:
                dir_path = os.path.join(root, dir_name)
                try:
                    os.rmdir(dir_path)
                except OSError:
                    success = False

        try:
            os.rmdir(target_path)
        except OSError:
            success = False

        return success
