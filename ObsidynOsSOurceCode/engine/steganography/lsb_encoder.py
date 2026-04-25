"""LSB Encoding for hiding data in images."""
import numpy as np
from PIL import Image
from utils.logger import log, log_exception


class LSBEncoder:
    """Encodes data into image using LSB steganography."""

    def encode(self, image_path, data, output_path):
        """Encode data into image using LSB."""
        try:
            log(f"[LSB] Encoding {len(data)} bytes into image", level="DEBUG")
            image = Image.open(image_path).convert('RGB')
            pixels = np.array(image, dtype=np.uint8)
            original_shape = pixels.shape
            flat_pixels = pixels.flatten().astype(np.uint8)

            binary_data = self._bytes_to_binary(data) + '1111111111111110'
            if len(binary_data) > len(flat_pixels):
                raise ValueError(f"Data too large. Need {len(binary_data)} bits, have {len(flat_pixels)}")

            for index, bit_char in enumerate(binary_data):
                bit = int(bit_char)
                pixel_value = int(flat_pixels[index]) & 254
                flat_pixels[index] = np.uint8((pixel_value | bit) & 255)

            modified_pixels = flat_pixels.reshape(original_shape).astype(np.uint8)
            output_image = Image.fromarray(modified_pixels, mode='RGB')
            output_image.save(output_path, 'PNG', compress_level=0)
            log("[LSB] Encoding complete", level="DEBUG")
            return True
        except Exception as exc:
            log_exception(f"[LSB] Encoding failed: {exc}", exc)
            raise

    def _bytes_to_binary(self, data):
        return ''.join(format(byte, '08b') for byte in data)
