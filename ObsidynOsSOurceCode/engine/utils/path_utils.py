"""Path operation utilities"""
import os

class PathUtils:
    """Path operation utilities"""
    
    @staticmethod
    def get_project_root():
        """Get project root directory"""
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    @staticmethod
    def get_engine_dir():
        """Get engine directory"""
        return os.path.dirname(os.path.abspath(__file__))
    
    @staticmethod
    def ensure_dir(dir_path):
        """Ensure directory exists"""
        os.makedirs(dir_path, exist_ok=True)