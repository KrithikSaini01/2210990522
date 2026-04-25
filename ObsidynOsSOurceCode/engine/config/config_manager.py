"""Configuration management."""
import json
import os
import sys
from utils.file_utils import FileUtils
from utils.logger import log_exception


def _project_root():
    """Resolve the project root for config storage."""
    # Prefer env-var injected by Electron when running packaged
    data_dir = os.environ.get('OBSIDYN_DATA_DIR')
    if data_dir:
        return data_dir
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    # Dev: engine/config/ -> engine/ -> project_root/
    engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.dirname(engine_dir)


class ConfigManager:
    """Manages application configuration."""

    DEFAULT_CONFIG = {
        "privacy_mode": True,
        "store_full_paths": False,
        "log_level": "ERROR",
        "auto_lock_minutes": 10,
        "default_security_profile": "PERSONAL",
        "visual_recovery_enabled": True,
        "login_binary_enabled": True,
        "reduced_motion": False,
        "decoy_email_enabled": False,
        "decoy_email_live": False,
        "decoy_email_recipient": "",
        "decoy_email_sender": "",
        "decoy_email_app_password": "",
        "decoy_email_smtp_host": "smtp.gmail.com",
        "decoy_email_smtp_port": 587,
        "decoy_email_use_tls": True,
    }

    def __init__(self):
        self.config_path = self._get_config_path()
        self.config = self._load_config()

    def _get_config_path(self):
        """Get path to config file."""
        return os.path.join(_project_root(), "config", "app_config.sys")

    def _load_config(self):
        """Load configuration from file."""
        config = dict(self.DEFAULT_CONFIG)

        try:
            loaded = FileUtils.read_json(self.config_path)
            if isinstance(loaded, dict):
                config.update(loaded)
        except Exception as exc:
            log_exception(f"[CONFIG] Error loading config: {exc}", exc)

        return config

    def save_config(self):
        """Save configuration to file."""
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            FileUtils.write_json(self.config_path, self.config)
        except Exception as exc:
            log_exception(f"[CONFIG] Error saving config: {exc}", exc)

    def get(self, key, default=None):
        """Get configuration value."""
        return self.config.get(key, default)

    def set(self, key, value):
        """Set configuration value."""
        self.config[key] = value
        self.save_config()
