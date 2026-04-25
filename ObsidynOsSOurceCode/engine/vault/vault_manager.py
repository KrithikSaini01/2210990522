"""Vault orchestration"""
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .file_locker import FileLocker
from .folder_locker import FolderLocker
from .file_unlocker import FileUnlocker
from .folder_unlocker import FolderUnlocker
from .vault_deleter import VaultDeleter
from .vault_scanner import VaultScanner
from .vault_index import VaultIndex
from utils.file_utils import FileUtils

class VaultManager:
    """Manages all vault operations"""
    
    def __init__(self, session_key):
        self.session_key = session_key
        self.index = VaultIndex()
        self.file_locker = FileLocker(session_key, self.index)
        self.folder_locker = FolderLocker(session_key, self.index)
        self.file_unlocker = FileUnlocker(session_key, self.index)
        self.folder_unlocker = FolderUnlocker(session_key, self.index)
        self.deleter = VaultDeleter(self.index)
        self.scanner = VaultScanner()
        
    def lock_file(self, file_path):
        """Lock a single file"""
        return self.file_locker.lock(file_path)
    
    def lock_folder(self, folder_path):
        """Lock entire folder"""
        return self.folder_locker.lock(folder_path)
    
    def unlock_file(self, container_name, restore_path):
        """Unlock a file"""
        return self.file_unlocker.unlock(container_name, restore_path)
    
    def unlock_folder(self, container_name, restore_path):
        """Unlock a folder"""
        return self.folder_unlocker.unlock(container_name, restore_path)
    
    def delete_item(self, container_name):
        """Delete vault item"""
        return self.deleter.delete(container_name)
    
    def get_vault_list(self):
        """Get list of all vault items"""
        return self.index.get_all_items()
    
    def scan_vault(self):
        """Scan for hidden files"""
        return self.scanner.scan()

    def rotate_session_key(self, old_key, new_key):
        """Re-encrypt all vault containers with a new session key."""
        old_cipher = AESGCM(old_key)
        new_cipher = AESGCM(new_key)

        for item in self.index.get_all_items().get("data", []):
            container_name = item.get("container")
            if not container_name:
                continue

            container_path = self.index.get_vault_path(container_name)
            if not os.path.exists(container_path):
                continue

            hidden = self.file_locker.hider
            hidden.unhide(container_path)
            try:
                payload = FileUtils.read_file(container_path)
                nonce = payload[:12]
                ciphertext = payload[12:]
                plaintext = old_cipher.decrypt(nonce, ciphertext, None)
                new_nonce = os.urandom(12)
                reencrypted = new_nonce + new_cipher.encrypt(new_nonce, plaintext, None)
                FileUtils.write_file(container_path, reencrypted)
            finally:
                hidden.hide(container_path)
