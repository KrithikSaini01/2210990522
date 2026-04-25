"""Main steganography orchestration."""
import hashlib
import io
import os
import zipfile
from .lsb_encoder import LSBEncoder
from .lsb_decoder import LSBDecoder
from .image_utils import ImageUtils
from crypto.cipher import Cipher
from utils.file_utils import FileUtils
from utils.logger import log, log_exception


class SteganographyEngine:
    """Main steganography engine."""

    def __init__(self, session_key=None):
        self.encoder = LSBEncoder()
        self.decoder = LSBDecoder()
        self.image_utils = ImageUtils()
        self.session_key = session_key

    def hide_data(self, data_file_path, image_path, output_path=None, password=None):
        """Hide any file inside an image."""
        try:
            if not os.path.exists(data_file_path):
                return {"status": "ERROR", "data": "Data file not found"}
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Carrier image not found"}

            data = FileUtils.read_file(data_file_path)
            compressed_data = self._compress_data(data)

            if password and password.strip():
                encrypted_data = Cipher.encrypt(self._get_key(password), compressed_data.decode('latin-1'))
                final_data = encrypted_data.encode('latin-1')
            else:
                final_data = compressed_data

            payload = b'OBS' + len(final_data).to_bytes(4, 'big') + b'\x01' + final_data
            capacity = self.image_utils.get_capacity(image_path)
            if len(payload) > capacity:
                return {"status": "ERROR", "data": f"Payload too large. Max: {capacity} bytes, Needed: {len(payload)} bytes"}

            if output_path is None:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                output_path = os.path.join(os.path.dirname(image_path), f"{base_name}_hidden.png")

            os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
            self.encoder.encode(image_path, payload, output_path)
            log("[STEG] Data hidden successfully", level="DEBUG")
            return {
                "status": "SUCCESS",
                "data": f"Data hidden in {os.path.basename(output_path)}",
                "output_path": output_path,
                "original_size": len(data),
                "compressed_size": len(compressed_data),
                "output_size": os.path.getsize(output_path),
            }
        except Exception as exc:
            log_exception(f"[STEG] Hide failed: {exc}", exc)
            return {"status": "ERROR", "data": f"Hide failed: {exc}"}

    def extract_data(self, image_path, output_path=None, password=None):
        """Extract hidden data from image."""
        try:
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Image not found"}

            payload = self.decoder.decode(image_path)
            if not payload:
                return {"status": "ERROR", "data": "No hidden data found in this image"}
            if len(payload) < 8 or payload[:3] != b'OBS':
                return {"status": "ERROR", "data": "Not an OBSIDYN steganography image"}

            data_length = int.from_bytes(payload[3:7], 'big')
            encrypted_data = payload[8:8 + data_length]

            if password and password.strip():
                try:
                    compressed_data = Cipher.decrypt(self._get_key(password), encrypted_data.decode('latin-1')).encode('latin-1')
                except Exception:
                    return {"status": "ERROR", "data": "Wrong password or corrupted data"}
            else:
                compressed_data = encrypted_data

            data = self._decompress_data(compressed_data)
            if output_path is None:
                output_path = os.path.join(os.path.dirname(image_path), "extracted_data.bin")

            FileUtils.write_file(output_path, data)
            log("[STEG] Data extracted successfully", level="DEBUG")
            return {
                "status": "SUCCESS",
                "data": f"Data extracted: {os.path.basename(output_path)}",
                "output_path": output_path,
                "extracted_size": len(data),
            }
        except Exception as exc:
            log_exception(f"[STEG] Extract failed: {exc}", exc)
            return {"status": "ERROR", "data": f"Extract failed: {exc}"}

    def scan_image(self, image_path):
        """Check if image contains hidden OBSIDYN data."""
        try:
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Image not found"}

            info = self.image_utils.get_image_info(image_path)
            payload = self.decoder.decode(image_path)
            result = {
                "status": "OK",
                "action": "SCAN_IMAGE",
                "data": {
                    "image_info": info,
                    "has_hidden_data": False,
                    "is_obsidyn": False,
                    "message": "No hidden data detected",
                },
            }

            if payload and len(payload) >= 8:
                if payload[:3] == b'OBS':
                    data_length = int.from_bytes(payload[3:7], 'big')
                    version = payload[7]
                    result["data"] = {
                        "image_info": info,
                        "has_hidden_data": True,
                        "is_obsidyn": True,
                        "version": version,
                        "hidden_data_size": data_length,
                        "password_protected": "Unknown (try extraction)",
                        "message": f"OBSIDYN data detected ({data_length} bytes)",
                    }
                else:
                    result["data"] = {
                        "image_info": info,
                        "has_hidden_data": True,
                        "is_obsidyn": False,
                        "message": "Hidden data found but not OBSIDYN format",
                    }

            return result
        except Exception as exc:
            log_exception(f"[STEG] Scan failed: {exc}", exc)
            return {"status": "ERROR", "data": f"Scan failed: {exc}"}

    def sanitize_image(self, image_path, output_path=None):
        """Strip hidden LSB steganographic data from image."""
        try:
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Image not found"}
                
            from PIL import Image
            import numpy as np
            
            image = Image.open(image_path).convert('RGB')
            pixels = np.array(image, dtype=np.uint8)
            
            # Zero out the least significant bit of every pixel
            pixels = pixels & 254
            
            output_image = Image.fromarray(pixels, mode='RGB')
            
            if output_path is None:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                output_path = os.path.join(os.path.dirname(image_path), f"{base_name}_sanitized.png")
                
            os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
            output_image.save(output_path, 'PNG', compress_level=0)
            
            log("[STEG] Image sanitized successfully", level="DEBUG")
            return {
                "status": "SUCCESS",
                "data": f"Image sanitized and saved to {os.path.basename(output_path)}",
                "output_path": output_path
            }
        except Exception as exc:
            log_exception(f"[STEG] Sanitize failed: {exc}", exc)
            return {"status": "ERROR", "data": f"Sanitize failed: {exc}"}

    def _compress_data(self, data):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zip_file:
            zip_file.writestr('data.bin', data)
        return buffer.getvalue()

    def _decompress_data(self, compressed_data):
        buffer = io.BytesIO(compressed_data)
        with zipfile.ZipFile(buffer, 'r') as zip_file:
            return zip_file.read('data.bin')

    def _get_key(self, password):
        if password and password.strip():
            return hashlib.sha256(password.encode('utf-8')).digest()[:32]
        if self.session_key:
            return self.session_key
        raise ValueError('No encryption key available')
