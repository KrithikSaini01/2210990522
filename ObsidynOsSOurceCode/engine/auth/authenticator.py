"""Authentication logic."""
from .visual_recovery import VisualRecoveryManager
from .password_hasher import PasswordHasher
from .rhythm_profile import RhythmProfile
from crypto.key_derivation import KeyDerivation
from core.session import Session
from utils.logger import log, log_exception


class Authenticator:
    """Handles user authentication."""

    def __init__(self):
        self.password_hasher = PasswordHasher()
        self.rhythm_profile = RhythmProfile()
        self.visual_recovery = VisualRecoveryManager()
        self.key_derivation = KeyDerivation()
        self.session = Session()
        self.session_key = None
        self.failed_password_attempts = 0
        self.visual_recovery_min_failed_attempts = 3
        self.visual_recovery_trigger_attempts = 0

    def set_visual_recovery_gate(self, minimum_failed_attempts=3):
        """Configure when passwordless visual recovery becomes available."""
        try:
            minimum_failed_attempts = int(minimum_failed_attempts)
        except Exception:
            minimum_failed_attempts = 3
        self.visual_recovery_min_failed_attempts = max(0, min(minimum_failed_attempts, 10))

    def authenticate(self, password_hash, keystroke_sample=None, recovery_payload=None):
        """Authenticate user with master key, Rhythm Lock, and optional visual recovery."""
        try:
            if not self.rhythm_profile.has_master_identity():
                behavioral = self.rhythm_profile.enroll_identity(password_hash, keystroke_sample)
                self.session_key = self.key_derivation.derive_key(password_hash)
                self.session.set_session_key(self.session_key)
                self.failed_password_attempts = 0
                return True, behavioral.get("message", "Master identity enrolled"), behavioral

            if not self.rhythm_profile.master_hash_matches(password_hash):
                self.failed_password_attempts += 1
                behavioral = self.rhythm_profile.reject_master_hash()
                behavioral.update(self._recovery_gate_status())
                behavioral["visual_recovery"] = self.visual_recovery.get_status()
                log("[AUTH] Authentication failed", level="ERROR")
                return False, behavioral.get("message", "Authentication failed"), behavioral

            candidate_key = self.key_derivation.derive_key(password_hash)
            behavioral = self.rhythm_profile.evaluate_sample(keystroke_sample)
            if not behavioral.get("accepted") and recovery_payload:
                recovery_status = self.visual_recovery.verify(
                    recovery_payload.get("face_image"),
                    recovery_payload.get("gesture_image"),
                )
                if recovery_status.get("accepted"):
                    behavioral = self.rhythm_profile.accept_recovery_override(keystroke_sample)
                    behavioral["recovery_status"] = recovery_status
                else:
                    behavioral["recovery_status"] = recovery_status

            if behavioral.get("accepted"):
                self.session_key = candidate_key
                self.session.set_session_key(self.session_key)
                self.failed_password_attempts = 0
                log("[AUTH] Authentication successful", level="DEBUG")
                return True, behavioral.get("message", "Authentication successful"), behavioral

            log("[AUTH] Authentication failed", level="ERROR")
            return False, behavioral.get("message", "Authentication failed"), behavioral
        except Exception as exc:
            error_msg = f"Authentication error: {exc}"
            log_exception(f"[AUTH] {error_msg}", exc)
            return False, error_msg, self.rhythm_profile.get_status()

    def authenticate_visual_recovery(self, recovery_payload):
        """Authenticate using visual recovery without a password."""
        try:
            gate_status = self._recovery_gate_status()
            if not gate_status["visual_recovery_allowed"]:
                self.visual_recovery_trigger_attempts += 1
                gate_status["visual_recovery"] = self.visual_recovery.get_status()
                if not gate_status.get("visual_recovery", {}).get("configured"):
                    return False, "Visual recovery is not enrolled", gate_status
                required = gate_status.get("visual_recovery_min_failed_attempts", 0)
                return (
                    False,
                    f"Visual recovery becomes available after {required} failed master key attempt(s)",
                    gate_status,
                )

            recovery_status = self.visual_recovery.verify(
                recovery_payload.get("face_image"),
                recovery_payload.get("gesture_image"),
            )
            if not recovery_status.get("accepted"):
                self.visual_recovery_trigger_attempts += 1
                recovery_status.update(gate_status)
                recovery_status["visual_recovery"] = self.visual_recovery.get_status()
                return False, recovery_status.get("message", "Visual recovery mismatch"), recovery_status

            master_hash = recovery_status.get("master_hash")
            if not master_hash:
                raise ValueError("Recovery profile is missing the enrolled master hash")

            self.session_key = self.key_derivation.derive_key(master_hash)
            self.session.set_session_key(self.session_key)
            self.failed_password_attempts = 0
            behavioral = self.rhythm_profile.accept_recovery_override(None)
            behavioral["recovery_status"] = recovery_status
            behavioral["visual_recovery"] = self.visual_recovery.get_status()
            behavioral.update(self._recovery_gate_status())
            return True, "Visual recovery session established", behavioral
        except Exception as exc:
            error_msg = f"Visual recovery error: {exc}"
            log_exception(f"[AUTH] {error_msg}", exc)
            status = self.get_behavioral_status()
            return False, error_msg, status

    def get_session_key(self):
        """Get derived session key."""
        return self.session_key

    def get_behavioral_status(self):
        """Get the current Rhythm Lock state."""
        status = self.rhythm_profile.get_status()
        status["visual_recovery"] = self.visual_recovery.get_status(self.session_key)
        status.update(self._recovery_gate_status())
        return status

    def update_rhythm_policy(self, minimum_training_samples=None, threshold=None):
        """Update Rhythm Lock configuration."""
        status = self.rhythm_profile.update_policy(minimum_training_samples, threshold)
        status["visual_recovery"] = self.visual_recovery.get_status(self.session_key)
        return status

    def enroll_visual_recovery(self, face_image, gesture_image, gesture_label):
        """Enroll the visual recovery signature using the active session key."""
        if not self.session_key:
            raise ValueError("Authentication required")
        return self.visual_recovery.enroll(
            self.rhythm_profile.get_master_hash(),
            face_image,
            gesture_image,
            gesture_label,
        )

    def delete_visual_recovery(self):
        """Delete the enrolled visual recovery signature."""
        return self.visual_recovery.delete_profile()

    def rotate_master_key(self, current_password_hash, new_password_hash):
        """Rotate the master key and reset behavioral training."""
        if not self.session_key:
            raise ValueError("Authentication required")

        success, response = self.rhythm_profile.rotate_identity(
            current_password_hash,
            new_password_hash,
            reset_samples=True,
        )
        if not success:
            return False, response

        old_key = self.session_key
        new_key = self.key_derivation.derive_key(new_password_hash)
        self.visual_recovery.rotate_master_hash(current_password_hash, new_password_hash)
        self.session_key = new_key
        self.session.set_session_key(new_key)
        return True, {
            "message": response.get("message"),
            "old_key": old_key,
            "new_key": new_key,
            "status": self.get_behavioral_status(),
        }

    def logout(self):
        """Clear authentication."""
        self.session_key = None
        self.session.reset()

    def _recovery_gate_status(self):
        configured = self.visual_recovery.get_status().get("configured", False)
        min_failed_attempts = int(self.visual_recovery_min_failed_attempts or 0)
        allowed = bool(configured) and (self.failed_password_attempts >= min_failed_attempts)
        return {
            "failed_password_attempts": self.failed_password_attempts,
            "visual_recovery_min_failed_attempts": min_failed_attempts,
            "visual_recovery_allowed": allowed,
            "visual_recovery_trigger_attempts": self.visual_recovery_trigger_attempts,
        }
