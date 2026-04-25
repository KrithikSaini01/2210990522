"""Image utilities for steganography."""
import os
from PIL import Image
from utils.logger import log, log_exception


class ImageUtils:
    """Image processing utilities."""

    def get_capacity(self, image_path):
        """Get maximum data capacity of image in bytes."""
        try:
            image = Image.open(image_path)
            if image.mode != 'RGB':
                image = image.convert('RGB')

            pixels = image.width * image.height * 3
            bits = pixels
            bytes_capacity = bits // 8
            usable_capacity = max(bytes_capacity - 8, 0)
            log(f"[IMAGE] Capacity: {usable_capacity} bytes", level="DEBUG")
            return usable_capacity
        except Exception as exc:
            log_exception(f"[IMAGE] Capacity check failed: {exc}", exc)
            return 0

    def get_image_info(self, image_path):
        """Get image information."""
        try:
            image = Image.open(image_path)
            return {
                "width": image.width,
                "height": image.height,
                "mode": image.mode,
                "format": image.format,
                "size_bytes": os.path.getsize(image_path),
                "capacity_bytes": self.get_capacity(image_path),
            }
        except Exception as exc:
            return {"error": str(exc)}

    def validate_image(self, image_path):
        """Validate image for steganography."""
        if not os.path.exists(image_path):
            return False, "Image not found"

        try:
            image = Image.open(image_path)
            if image.format not in ['PNG', 'BMP', 'JPEG']:
                return False, f"Unsupported format: {image.format}"

            capacity = self.get_capacity(image_path)
            if capacity < 100:
                return False, "Image too small"

            return True, ""
        except Exception as exc:
            return False, f"Invalid image: {exc}"
