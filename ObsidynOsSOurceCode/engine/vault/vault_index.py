"""Vault index management."""
import json
import os
import secrets
from utils.file_utils import FileUtils
from utils.logger import log_exception, mask_path
from config.config_manager import ConfigManager


class VaultIndex:
    """Manages vault index and metadata."""

    def __init__(self):
        self.config = ConfigManager()
        self.index_path, self.metadata_path = self._get_paths()
        self.index = self._load_json(self.index_path, [])
        self.metadata = self._load_json(self.metadata_path, {})

    def _get_paths(self):
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        data_dir = os.path.join(project_root, "data")
        os.makedirs(data_dir, exist_ok=True)
        return (
            os.path.join(data_dir, "vault_index.sys"),
            os.path.join(data_dir, "vault_metadata.sys"),
        )

    def _load_json(self, file_path, fallback):
        try:
            loaded = FileUtils.read_json(file_path)
            if isinstance(loaded, type(fallback)):
                return loaded
        except Exception as exc:
            log_exception(f"[INDEX] Error loading {os.path.basename(file_path)}: {exc}", exc)
        return fallback

    def _save_index(self):
        try:
            FileUtils.write_json(self.index_path, self.index)
        except Exception as exc:
            log_exception(f"[INDEX] Error saving index: {exc}", exc)

    def _save_metadata(self):
        try:
            FileUtils.write_json(self.metadata_path, self.metadata)
        except Exception as exc:
            log_exception(f"[INDEX] Error saving metadata: {exc}", exc)

    def sanitize_original_path(self, original_path):
        if self.config.get("store_full_paths", False):
            return os.path.abspath(original_path)
        return mask_path(original_path)

    def get_vault_path(self, filename=None):
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        vault_path = os.path.join(project_root, "data", "vaults")
        os.makedirs(vault_path, exist_ok=True)
        if filename:
            return os.path.join(vault_path, filename)
        return vault_path

    def generate_container_name(self, original_name):
        safe_name = "".join(char for char in original_name if char.isalnum() or char in ('-', '_', '.')).rstrip() or "vault_item"
        return f"{safe_name}.{secrets.token_hex(6)}.aegis"

    def add_item(self, container_name, original_path, item_type, metadata):
        self.index.append({
            "container": container_name,
            "original": self.sanitize_original_path(original_path),
            "type": item_type,
        })
        self.metadata[container_name] = metadata
        self._save_index()
        self._save_metadata()

    def remove_item(self, container_name):
        self.index = [item for item in self.index if item['container'] != container_name]
        if container_name in self.metadata:
            del self.metadata[container_name]
        self._save_index()
        self._save_metadata()

    def get_item(self, container_name):
        return next((item for item in self.index if item['container'] == container_name), None)

    def get_metadata(self, container_name):
        return self.metadata.get(container_name, {})

    def get_all_items(self):
        items = []
        for item in self.index:
            container_name = item['container']
            metadata = self.metadata.get(container_name, {})
            container_path = self.get_vault_path(container_name)
            items.append({
                "container": container_name,
                "original": item.get('original', ''),
                "original_name": metadata.get('original_name', 'Unknown'),
                "type": metadata.get('type', item.get('type', 'file')),
                "original_size": metadata.get('original_size', 0),
                "container_size": metadata.get('container_size', 0),
                "locked_at": metadata.get('locked_at', ''),
                "file_count": metadata.get('file_count', 1),
                "exists": os.path.exists(container_path),
            })
        return {"status": "OK", "data": items, "total_count": len(items)}
