"""Main application orchestration."""
from datetime import datetime
from .session import Session
from auth.authenticator import Authenticator
from config.config_manager import ConfigManager
from decoy.decoy_manager import DecoyManager
from identity.operator_profile_manager import OperatorProfileManager
from monitoring.system_monitor import SystemMonitor
from utils.logger import log
from vault.vault_manager import VaultManager


class Application:
    """Main application class."""

    def __init__(self):
        self.session = Session()
        self.config = ConfigManager()
        self.authenticator = None
        self.vault_manager = None
        self.decoy_manager = None
        self.system_monitor = None
        self.operator_profile = None

    def initialize(self):
        """Initialize application components."""
        self.authenticator = Authenticator()
        self.decoy_manager = DecoyManager(self.config)
        self.system_monitor = SystemMonitor(self.decoy_manager)
        self.operator_profile = OperatorProfileManager()
        log("[APP] Application initialized", level="DEBUG")

    def authenticate(self, password_hash, keystroke_sample=None, recovery_payload=None):
        """Authenticate user."""
        if not self.authenticator:
            return False, "Authenticator not initialized", {}

        self.authenticator.set_visual_recovery_gate(
            self.config.get("visual_recovery_min_failed_attempts", 3)
        )
        if not self.config.get("visual_recovery_enabled", True):
            recovery_payload = None
        success, message, behavioral = self.authenticator.authenticate(
            password_hash, keystroke_sample, recovery_payload
        )
        behavioral = self._decorate_behavioral_status(behavioral)
        if success:
            session_key = self.authenticator.get_session_key()
            self.session.set_authenticated(True)
            self.session.set_session_key(session_key)
            self.vault_manager = VaultManager(session_key)
            return True, message, behavioral

        return False, message, behavioral

    def authenticate_visual_recovery(self, recovery_payload=None):
        """Authenticate using visual recovery without a password."""
        if not self.authenticator:
            return False, "Authenticator not initialized", {}

        self.authenticator.set_visual_recovery_gate(
            self.config.get("visual_recovery_min_failed_attempts", 3)
        )
        if not self.config.get("visual_recovery_enabled", True):
            return False, "Visual recovery is disabled in settings", self._decorate_behavioral_status(
                self.authenticator.get_behavioral_status()
            )
        success, message, behavioral = self.authenticator.authenticate_visual_recovery(
            recovery_payload or {}
        )
        behavioral = self._decorate_behavioral_status(behavioral)
        if success:
            session_key = self.authenticator.get_session_key()
            self.session.set_authenticated(True)
            self.session.set_session_key(session_key)
            self.vault_manager = VaultManager(session_key)
            return True, message, behavioral

        return False, message, behavioral

    def logout(self):
        """Logout user."""
        if self.system_monitor:
            self.system_monitor.stop()
        if self.authenticator:
            self.authenticator.logout()
        self.session.reset()
        self.vault_manager = None
        log("[APP] User logged out", level="DEBUG")

    def is_authenticated(self):
        """Check if user is authenticated."""
        return self.session.is_authenticated()

    def get_vault_manager(self):
        """Get vault manager instance."""
        return self.vault_manager

    def get_auth_status(self):
        """Get behavioral authentication status."""
        if not self.authenticator:
            return {"configured": False}
        self.authenticator.set_visual_recovery_gate(
            self.config.get("visual_recovery_min_failed_attempts", 3)
        )
        return self._decorate_behavioral_status(self.authenticator.get_behavioral_status())

    def get_operator_profile(self):
        """Load the encrypted operator dossier."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}

        profile = self.operator_profile.load_profile(self.session.get_session_key())
        return {"status": "OK", "data": profile}

    def save_operator_profile(self, profile_patch, note_passcode=None):
        """Save operator profile fields."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}

        profile = self.operator_profile.save_profile(
            self.session.get_session_key(),
            profile_patch or {},
            note_passcode,
        )
        return {"status": "SUCCESS", "data": "Operator dossier updated", "profile": profile}

    def unlock_operator_notes(self, passcode):
        """Unlock the note vault with the dedicated note code."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        notes = self.operator_profile.unlock_notes(self.session.get_session_key(), passcode)
        return {"status": "OK", "data": notes}

    def save_operator_notes(self, passcode, note_title, note_content, note_id=None):
        """Save an encrypted note entry under the dedicated note code."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        notes = self.operator_profile.save_notes(
            self.session.get_session_key(),
            passcode,
            note_title,
            note_content,
            note_id,
        )
        return {"status": "SUCCESS", "data": "Operator notes saved", "notes": notes}

    def rotate_operator_note_passcode(self, current_passcode, new_passcode):
        """Rotate the note-vault access code."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        profile = self.operator_profile.rotate_note_passcode(
            self.session.get_session_key(),
            current_passcode,
            new_passcode,
        )
        return {"status": "SUCCESS", "data": "Notes access code updated", "profile": profile}

    def get_app_settings(self):
        """Get operator-controlled runtime settings."""
        return {
            "status": "OK",
            "data": {
                "auto_lock_minutes": self.config.get("auto_lock_minutes", 10),
                "default_security_profile": self.config.get("default_security_profile", "PERSONAL"),
                "privacy_mode": self.config.get("privacy_mode", True),
                "store_full_paths": self.config.get("store_full_paths", False),
                "visual_recovery_enabled": self.config.get("visual_recovery_enabled", True),
                "visual_recovery_min_failed_attempts": self.config.get("visual_recovery_min_failed_attempts", 3),
                "pvs_pass_hash_set": bool(self.config.get("pvs_pass_hash")),
                "pvs_mfa_required": self.config.get("pvs_mfa_required", False),
                "login_binary_enabled": self.config.get("login_binary_enabled", True),
                "reduced_motion": self.config.get("reduced_motion", False),
                "decoy_email_enabled": self.config.get("decoy_email_enabled", False),
                "decoy_email_live": self.config.get("decoy_email_live", self.config.get("decoy_email_enabled", False)),
                "decoy_email_recipient": self.config.get("decoy_email_recipient", "himeshsainichd@gmail.com"),
                "decoy_email_sender": self.config.get("decoy_email_sender", ""),
                "decoy_email_has_secret": bool(self.config.get("decoy_email_app_password", "")),
                "decoy_email_smtp_host": self.config.get("decoy_email_smtp_host", "smtp.gmail.com"),
                "decoy_email_smtp_port": self.config.get("decoy_email_smtp_port", 587),
                "decoy_email_use_tls": self.config.get("decoy_email_use_tls", True),
            },
        }

    def update_app_settings(self, settings):
        """Persist runtime settings."""
        settings = settings or {}
        if "auto_lock_minutes" in settings:
            self.config.set("auto_lock_minutes", max(1, min(int(settings["auto_lock_minutes"]), 60)))
        if "default_security_profile" in settings:
            self.config.set("default_security_profile", str(settings["default_security_profile"]).upper())
        if "privacy_mode" in settings:
            self.config.set("privacy_mode", bool(settings["privacy_mode"]))
        if "store_full_paths" in settings:
            self.config.set("store_full_paths", bool(settings["store_full_paths"]))
        if "visual_recovery_enabled" in settings:
            self.config.set("visual_recovery_enabled", bool(settings["visual_recovery_enabled"]))
        if "visual_recovery_min_failed_attempts" in settings:
            minimum = int(settings["visual_recovery_min_failed_attempts"] or 0)
            self.config.set("visual_recovery_min_failed_attempts", max(0, min(minimum, 10)))
        if "pvs_pass_hash" in settings:
            self.config.set("pvs_pass_hash", str(settings["pvs_pass_hash"]))
        if "pvs_pass_text" in settings:
            self.config.set("pvs_pass_text", str(settings["pvs_pass_text"]))
        if "pvs_mfa_required" in settings:
            self.config.set("pvs_mfa_required", bool(settings["pvs_mfa_required"]))
        self.config.set("updated_at", str(datetime.now().isoformat()))
        if "login_binary_enabled" in settings:
            self.config.set("login_binary_enabled", bool(settings["login_binary_enabled"]))
        if "reduced_motion" in settings:
            self.config.set("reduced_motion", bool(settings["reduced_motion"]))
        if "decoy_email_enabled" in settings:
            self.config.set("decoy_email_enabled", bool(settings["decoy_email_enabled"]))
        if "decoy_email_live" in settings:
            self.config.set("decoy_email_live", bool(settings["decoy_email_live"]))
        if "decoy_email_recipient" in settings:
            self.config.set("decoy_email_recipient", str(settings["decoy_email_recipient"] or ""))
        if "decoy_email_sender" in settings:
            self.config.set("decoy_email_sender", str(settings["decoy_email_sender"] or ""))
        if "decoy_email_app_password" in settings and str(settings["decoy_email_app_password"] or "").strip():
            self.config.set("decoy_email_app_password", str(settings["decoy_email_app_password"]))
        if "decoy_email_smtp_host" in settings:
            self.config.set("decoy_email_smtp_host", str(settings["decoy_email_smtp_host"] or "smtp.gmail.com"))
        if "decoy_email_smtp_port" in settings:
            self.config.set("decoy_email_smtp_port", max(1, min(int(settings["decoy_email_smtp_port"]), 65535)))
        if "decoy_email_use_tls" in settings:
            self.config.set("decoy_email_use_tls", bool(settings["decoy_email_use_tls"]))
        return self.get_app_settings()

    def update_rhythm_policy(self, minimum_training_samples=None, threshold=None):
        """Update behavioral authentication policy."""
        if not self.authenticator:
            return {"status": "ERROR", "data": "Authenticator not initialized"}
        return {
            "status": "SUCCESS",
            "data": "Rhythm Lock policy updated",
            "policy": self._decorate_behavioral_status(
                self.authenticator.update_rhythm_policy(
                    minimum_training_samples,
                    threshold,
                )
            ),
        }

    def enroll_visual_recovery(self, face_image, gesture_image, gesture_label):
        """Enroll the visual recovery fallback."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        try:
            status = self.authenticator.enroll_visual_recovery(face_image, gesture_image, gesture_label)
            status["enabled"] = self.config.get("visual_recovery_enabled", True)
            return {"status": "SUCCESS", "data": "Visual recovery enrolled", "recovery": status}
        except Exception as exc:
            log_exception(f"[APP] Visual recovery enrollment error: {exc}", exc)
            return {"status": "ERROR", "data": str(exc)}

    def delete_visual_recovery(self):
        """Delete the visual recovery enrollment."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        try:
            status = self.authenticator.delete_visual_recovery()
            status["enabled"] = self.config.get("visual_recovery_enabled", True)
            return {"status": "SUCCESS", "data": "Visual recovery enrollment deleted", "recovery": status}
        except Exception as exc:
            log_exception(f"[APP] Visual recovery deletion error: {exc}", exc)
            return {"status": "ERROR", "data": str(exc)}

    def rotate_master_key(self, current_password_hash, new_password_hash):
        """Rotate the master password and re-encrypt dependent stores."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}

        success, result = self.authenticator.rotate_master_key(
            current_password_hash,
            new_password_hash,
        )
        if not success:
            return {"status": "ERROR", "data": result.get("message", "Master key rotation failed")}

        old_key = result["old_key"]
        new_key = result["new_key"]
        if self.vault_manager:
            self.vault_manager.rotate_session_key(old_key, new_key)
            self.vault_manager = VaultManager(new_key)
        self.operator_profile.rotate_key(old_key, new_key)
        self.session.set_session_key(new_key)
        return {
            "status": "SUCCESS",
            "data": result.get("message", "Master key rotated"),
            "auth_status": self._decorate_behavioral_status(result.get("status")),
        }

    def _decorate_behavioral_status(self, status):
        if not isinstance(status, dict):
            return status

        visual_recovery = status.get("visual_recovery")
        if not isinstance(visual_recovery, dict):
            visual_recovery = {}
        visual_recovery["enabled"] = self.config.get("visual_recovery_enabled", True)
        status["visual_recovery"] = visual_recovery
        min_failed_attempts = int(self.config.get("visual_recovery_min_failed_attempts", 3) or 0)
        status["visual_recovery_min_failed_attempts"] = min_failed_attempts
        status["visual_recovery_allowed"] = (
            bool(visual_recovery.get("configured"))
            and bool(visual_recovery.get("enabled"))
            and int(status.get("failed_password_attempts", 0) or 0) >= min_failed_attempts
        )
        return status

    def create_decoy_vault(self, target_dir=None, profile="operations", file_count=3):
        """Create a decoy vault plus honeyfiles."""
        return self.decoy_manager.create_decoy_vault(target_dir, profile, file_count)

    def get_decoy_status(self):
        """Get decoy vault and honeyfile status."""
        return self.decoy_manager.get_status()

    def clear_all_decoys(self):
        """Delete all decoy vaults from disk and reset deployment registry."""
        return self.decoy_manager.clear_all_decoys()

    def clear_decoy_history(self):
        """Clear alert history while keeping current deployments."""
        return self.decoy_manager.clear_history()

    def export_decoy_memory_log(self):
        """Export a text-form decoy memory log."""
        return self.decoy_manager.export_memory_log()

    def start_monitoring(self):
        """Enable process and honeyfile monitoring."""
        return self.system_monitor.start()

    def stop_monitoring(self):
        """Disable process and honeyfile monitoring."""
        return self.system_monitor.stop()

    def get_monitor_status(self):
        """Get process and honeyfile monitoring status."""
        return self.system_monitor.get_status()







