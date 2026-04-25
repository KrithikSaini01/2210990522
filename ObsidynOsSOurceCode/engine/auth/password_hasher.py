"""Password hashing utilities"""
import hashlib

class PasswordHasher:
    """Handles password hashing"""
    
    @staticmethod
    def hash_password(password):
        """Hash password using SHA-256"""
        return hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    @staticmethod
    def verify_password(password, hash_value):
        """Verify password against hash"""
        return hashlib.sha256(password.encode('utf-8')).hexdigest() == hash_value