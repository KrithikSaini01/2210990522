"""LSB Decoding for extracting data from images."""
import numpy as np
from PIL import Image
from utils.logger import log, log_exception


class LSBDecoder:
    """Decodes data from image using LSB steganography."""

    def decode(self, image_path):
        """Decode hidden data from image."""
        try:
            log("[LSB] Decoding image", level="DEBUG")
            image = Image.open(image_path).convert('RGB')
            pixels = np.array(image, dtype=np.uint8)
            flat_pixels = pixels.flatten().astype(np.uint8)
            binary_string = ''.join(str(int(pixel) & 1) for pixel in flat_pixels)

            end_marker = '1111111111111110'
            end_index = binary_string.find(end_marker)
            if end_index == -1:
                log("[LSB] No end marker found", level="DEBUG")
                return None

            binary_data = binary_string[:end_index]
            data = self._binary_to_bytes(binary_data)
            log(f"[LSB] Decoded {len(data)} bytes", level="DEBUG")
            return data
        except Exception as exc:
            log_exception(f"[LSB] Decoding failed: {exc}", exc)
            return None

    def _binary_to_bytes(self, binary_string):
        if not binary_string:
            return b''

        padding = (8 - len(binary_string) % 8) % 8
        binary_string = '0' * padding + binary_string
        byte_array = bytearray()
        for index in range(0, len(binary_string), 8):
            byte_array.append(int(binary_string[index:index + 8], 2) & 255)
        return bytes(byte_array)
