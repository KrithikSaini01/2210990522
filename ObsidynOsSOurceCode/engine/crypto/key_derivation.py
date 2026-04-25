"""Key derivation using Argon2id."""
from argon2.low_level import Type, hash_secret_raw
from .salt_manager import SaltManager
from utils.logger import log, log_exception


class KeyDerivation:
    """Derives encryption keys from passwords."""

    def __init__(self):
        self.time_cost = 3
        self.memory_cost = 65536
        self.parallelism = 4
        self.hash_len = 32
        self.salt_manager = SaltManager()

    def derive_key(self, password_hash):
        """Derive a deterministic 32-byte key from the supplied password hash."""
        try:
            key = hash_secret_raw(
                secret=password_hash.encode('utf-8'),
                salt=self.salt_manager.get_salt_bytes(),
                time_cost=self.time_cost,
                memory_cost=self.memory_cost,
                parallelism=self.parallelism,
                hash_len=self.hash_len,
                type=Type.ID,
            )
            log("[KEY_DERIVATION] Key derived successfully", level="DEBUG")
            return key
        except Exception as exc:
            log_exception(f"[KEY_DERIVATION] Key derivation failed: {exc}", exc)
            raise
