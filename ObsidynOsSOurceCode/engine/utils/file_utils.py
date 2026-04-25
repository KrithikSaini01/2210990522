"""File operation utilities."""
import json
import os
import tempfile
from datetime import datetime


class FileUtils:
    """File operation utilities."""

    @staticmethod
    def read_file(file_path):
        """Read file as bytes."""
        with open(file_path, 'rb') as file_handle:
            return file_handle.read()

    @staticmethod
    def write_file(file_path, data):
        """Write bytes to file atomically."""
        directory = os.path.dirname(file_path) or "."
        os.makedirs(directory, exist_ok=True)

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(dir=directory, delete=False) as temp_file:
                temp_file.write(data)
                temp_file.flush()
                os.fsync(temp_file.fileno())
                temp_path = temp_file.name

            os.replace(temp_path, file_path)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    @staticmethod
    def write_json(file_path, data):
        """Write JSON atomically with binary obfuscation to bluff non-obsidyn readers."""
        payload = json.dumps(data, indent=2).encode('utf-8')
        key = b'OBSIDYN_SECURE_OBFUSCATION_BLUFF_KEY_99'
        obscured = bytearray(payload)
        for i in range(len(obscured)):
            obscured[i] ^= key[i % len(key)]
        
        # Prepend a bluff header to make it look like a system cache or memory dump file
        bluff_header = b'MSCF\x00\x00\x00\x00\x12\x34\x56\x78'
        final_payload = bluff_header + obscured
        FileUtils.write_file(file_path, final_payload)

    @staticmethod
    def read_json(file_path):
        """Read obfuscated JSON (and fallback to plain text if needed)."""
        actual_path = file_path
        if not os.path.exists(actual_path):
            if actual_path.endswith('.sys'):
                fallback_path = actual_path[:-4] + '.json'
                if os.path.exists(fallback_path):
                    actual_path = fallback_path
                else:
                    return None
            else:
                return None
            
        with open(actual_path, 'rb') as f:
            data = f.read()
        
        if not data:
            return None

        bluff_header = b'MSCF\x00\x00\x00\x00\x12\x34\x56\x78'
        if data.startswith(bluff_header):
            obscured = data[len(bluff_header):]
            key = b'OBSIDYN_SECURE_OBFUSCATION_BLUFF_KEY_99'
            plain = bytearray(obscured)
            for i in range(len(plain)):
                plain[i] ^= key[i % len(key)]
            try:
                return json.loads(plain.decode('utf-8'))
            except Exception:
                return None
        else:
            try:
                return json.loads(data.decode('utf-8'))
            except Exception:
                return None

    @staticmethod
    def get_timestamp(milliseconds=False):
        """Get current timestamp string."""
        return datetime.now().isoformat(timespec='milliseconds' if milliseconds else 'seconds')

    @staticmethod
    def count_folder_contents(folder_path):
        """Count files and total size in folder."""
        total_files = 0
        total_size = 0

        for root, _, files in os.walk(folder_path):
            for file_name in files:
                file_path = os.path.join(root, file_name)
                total_files += 1
                total_size += os.path.getsize(file_path)

        return total_files, total_size

    @staticmethod
    def safe_extract_zip(zip_file, target_dir):
        """Extract a zip archive without allowing path traversal."""
        root_dir = os.path.abspath(target_dir)
        os.makedirs(root_dir, exist_ok=True)

        for member in zip_file.infolist():
            member_path = os.path.abspath(os.path.join(root_dir, member.filename))
            if not member_path.startswith(root_dir + os.sep) and member_path != root_dir:
                raise ValueError("Archive contains an invalid path")

        zip_file.extractall(root_dir)
