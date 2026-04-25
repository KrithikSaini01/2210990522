"""Visual recovery fallback using face and hand-signature captures."""
import base64
import json
import os
import sys

import numpy as np
try:
    import cv2
except Exception:  # pragma: no cover - handled at runtime when dependency is missing
    cv2 = None

from utils.dpapi import protect_bytes, unprotect_bytes
from utils.file_utils import FileUtils
from utils.logger import log_exception


def _get_frozen_dir():
    """Return the base directory whether running frozen (PyInstaller) or as a script."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class VisualRecoveryManager:
    """Stores and verifies the visual recovery signature."""

    FACE_THRESHOLD = 0.64
    GESTURE_THRESHOLD = 0.52
    COMBINED_THRESHOLD = 0.60

    def __init__(self):
        self.profile_path = self._get_profile_path()
        self.face_detector = None
        if cv2 is not None:
            cascade_path = self._resolve_cascade()
            if cascade_path:
                self.face_detector = cv2.CascadeClassifier(cascade_path)

    @staticmethod
    def _resolve_cascade():
        """Find the Haar Cascade XML whether running frozen or as a script."""
        # PyInstaller bundles cv2/data alongside the exe
        if getattr(sys, 'frozen', False):
            base = sys._MEIPASS  # noqa: SLF001 - PyInstaller temp dir
            candidate = os.path.join(base, 'cv2', 'data', 'haarcascade_frontalface_default.xml')
            if os.path.exists(candidate):
                return candidate
        # Normal (unfrozen) path via cv2 attribute
        try:
            return os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
        except Exception:
            return None

    def _get_profile_path(self):
        # Allow override via environment variable (set by Electron in packaged mode)
        data_dir = os.environ.get('OBSIDYN_DATA_DIR')
        if data_dir:
            config_dir = os.path.join(data_dir, 'config')
            os.makedirs(config_dir, exist_ok=True)
            return os.path.join(config_dir, 'visual_recovery.sys')
        # Dev / unfrozen: walk up from __file__
        engine_dir = _get_frozen_dir()
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, 'config', 'visual_recovery.sys')

    def _read_payload(self):
        try:
            loaded = FileUtils.read_json(self.profile_path)
            if isinstance(loaded, dict):
                return {
                    "version": loaded.get("version", 1),
                    "ciphertext": loaded.get("ciphertext"),
                    "updated_at": loaded.get("updated_at"),
                }
        except Exception as exc:
            log_exception(f"[RECOVERY] Failed to read recovery profile: {exc}", exc)
        return {"version": 1, "ciphertext": None, "updated_at": None}

    def get_status(self, session_key=None):
        """Return recovery enrollment status."""
        payload = self._read_payload()
        status = {
            "configured": False,
            "updated_at": payload.get("updated_at"),
            "gesture_label": None,
            "backend_available": cv2 is not None,
        }
        if payload.get("ciphertext"):
            try:
                profile = self._decrypt_profile()
                status["configured"] = True
                status["gesture_label"] = profile.get("gesture_label")
            except Exception:
                status["updated_at"] = None
        return status

    def enroll(self, master_hash, face_image, gesture_image, gesture_label):
        """Enroll a face + gesture signature."""
        self._ensure_backend()
        face_signature = self._extract_face_signature(face_image)
        gesture_signature = self._extract_gesture_signature(gesture_image)

        profile = {
            "master_hash": master_hash,
            "gesture_label": (gesture_label or "Custom signature").strip()[:64],
            "face_signature": face_signature,
            "gesture_signature": gesture_signature,
            "updated_at": FileUtils.get_timestamp(),
        }
        encrypted = base64.b64encode(
            protect_bytes(json.dumps(profile).encode("utf-8"), "OBSIDYN Visual Recovery")
        ).decode("utf-8")
        FileUtils.write_json(
            self.profile_path,
            {
                "version": 1,
                "ciphertext": encrypted,
                "updated_at": profile["updated_at"],
            },
        )
        return {
            "configured": True,
            "gesture_label": profile["gesture_label"],
            "updated_at": profile["updated_at"],
            "backend_available": cv2 is not None,
        }

    def verify(self, face_image, gesture_image):
        """Verify a live visual recovery capture."""
        self._ensure_backend()
        profile = self._decrypt_profile()
        face_signature = self._extract_face_signature(face_image)
        gesture_signature = self._extract_gesture_signature(gesture_image)

        face_score = self._compare_signature(
            profile.get("face_signature", {}),
            face_signature,
        )
        gesture_score = self._compare_signature(
            profile.get("gesture_signature", {}),
            gesture_signature,
        )
        combined = round((face_score + gesture_score) / 2, 3)
        accepted = (
            face_score >= self.FACE_THRESHOLD
            and gesture_score >= self.GESTURE_THRESHOLD
            and combined >= self.COMBINED_THRESHOLD
        )
        return {
            "accepted": accepted,
            "message": "Visual recovery verified" if accepted else "Visual recovery mismatch",
            "face_score": round(face_score, 3),
            "gesture_score": round(gesture_score, 3),
            "combined_score": combined,
            "gesture_label": profile.get("gesture_label"),
            "master_hash": profile.get("master_hash") if accepted else None,
        }

    def rotate_master_hash(self, current_hash, new_hash):
        """Update the enrolled master hash in the recovery profile."""
        payload = self._read_payload()
        if not payload.get("ciphertext"):
            return

        profile = self._decrypt_profile()
        if profile.get("master_hash") != current_hash:
            raise ValueError("Recovery profile is out of sync with the current master key")
        profile["master_hash"] = new_hash
        profile["updated_at"] = FileUtils.get_timestamp()
        encrypted = base64.b64encode(
            protect_bytes(json.dumps(profile).encode("utf-8"), "OBSIDYN Visual Recovery")
        ).decode("utf-8")
        FileUtils.write_json(
            self.profile_path,
            {
                "version": payload.get("version", 1),
                "ciphertext": encrypted,
                "updated_at": profile.get("updated_at"),
            },
        )

    def delete_profile(self):
        """Delete the enrolled visual recovery profile."""
        try:
            if os.path.exists(self.profile_path):
                os.remove(self.profile_path)
        except Exception as exc:
            log_exception(f"[RECOVERY] Failed to delete recovery profile: {exc}", exc)
            raise
        return {
            "configured": False,
            "updated_at": None,
            "gesture_label": None,
            "backend_available": cv2 is not None,
        }

    def _decrypt_profile(self):
        payload = self._read_payload()
        if not payload.get("ciphertext"):
            raise ValueError("Visual recovery is not configured")
        protected_bytes = base64.b64decode(payload["ciphertext"])
        decrypted = unprotect_bytes(protected_bytes)
        profile = json.loads(decrypted.decode("utf-8"))
        if not isinstance(profile, dict):
            raise ValueError("Invalid visual recovery profile")
        return profile

    def _extract_face_signature(self, image_input):
        image = self._decode_image(image_input)
        grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = self.face_detector.detectMultiScale(grayscale, scaleFactor=1.1, minNeighbors=5)
        if len(faces) == 0:
            raise ValueError("No face detected in capture")

        x, y, width, height = max(faces, key=lambda item: item[2] * item[3])
        face = grayscale[y : y + height, x : x + width]
        normalized = cv2.equalizeHist(cv2.resize(face, (96, 96)))
        thumbnail = cv2.resize(normalized, (24, 24)).astype(np.float32) / 255.0
        histogram = cv2.calcHist([normalized], [0], None, [16], [0, 256]).flatten()
        histogram = histogram / max(float(histogram.sum()), 1.0)
        return {
            "thumbnail": thumbnail.flatten().tolist(),
            "histogram": histogram.tolist(),
        }

    def _extract_gesture_signature(self, image_input):
        image = self._decode_image(image_input)
        grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        height, width = grayscale.shape
        pad_y = int(height * 0.1)
        pad_x = int(width * 0.1)
        focus = grayscale[pad_y : height - pad_y, pad_x : width - pad_x]

        blurred = cv2.GaussianBlur(focus, (5, 5), 0)
        _, binary = cv2.threshold(
            blurred,
            0,
            255,
            cv2.THRESH_BINARY + cv2.THRESH_OTSU,
        )
        inverse = cv2.bitwise_not(binary)
        binary = self._choose_binary_mask(binary, inverse)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contour = max(contours, key=cv2.contourArea) if contours else None
        if contour is not None and cv2.contourArea(contour) > 800:
            x, y, box_width, box_height = cv2.boundingRect(contour)
            region = binary[y : y + box_height, x : x + box_width]
            moments = cv2.HuMoments(cv2.moments(contour)).flatten()
            hu_values = [
                float(-np.sign(value) * np.log10(abs(value))) if value != 0 else 0.0
                for value in moments
            ]
        else:
            region = binary
            hu_values = [0.0] * 7

        normalized = cv2.resize(region, (96, 96)).astype(np.float32) / 255.0
        thumbnail = cv2.resize(normalized, (24, 24))
        return {
            "thumbnail": thumbnail.flatten().tolist(),
            "hu_moments": hu_values,
        }

    @staticmethod
    def _choose_binary_mask(binary, inverse):
        binary_ratio = float(np.count_nonzero(binary)) / binary.size
        inverse_ratio = float(np.count_nonzero(inverse)) / inverse.size
        binary_distance = abs(binary_ratio - 0.3)
        inverse_distance = abs(inverse_ratio - 0.3)
        return binary if binary_distance <= inverse_distance else inverse

    @staticmethod
    def _compare_signature(reference, candidate):
        reference_thumb = np.array(reference.get("thumbnail", []), dtype=np.float32)
        candidate_thumb = np.array(candidate.get("thumbnail", []), dtype=np.float32)
        if reference_thumb.size == 0 or candidate_thumb.size == 0:
            return 0.0

        pixel_score = 1.0 - float(np.mean(np.abs(reference_thumb - candidate_thumb)))
        reference_hist = np.array(
            reference.get("histogram", reference.get("hu_moments", [])),
            dtype=np.float32,
        )
        candidate_hist = np.array(
            candidate.get("histogram", candidate.get("hu_moments", [])),
            dtype=np.float32,
        )
        if reference_hist.size and candidate_hist.size and reference_hist.size == candidate_hist.size:
            distance = float(np.mean(np.abs(reference_hist - candidate_hist)))
            structural_score = 1.0 / (1.0 + distance)
        else:
            structural_score = pixel_score
        return max(0.0, min(1.0, (pixel_score * 0.7) + (structural_score * 0.3)))

    @staticmethod
    def _decode_image(image_input):
        try:
            encoded = image_input.split(",", 1)[1] if "," in image_input else image_input
            payload = base64.b64decode(encoded)
            buffer = np.frombuffer(payload, dtype=np.uint8)
            image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError("Unable to decode image capture")
            return image
        except Exception as exc:
            log_exception(f"[RECOVERY] Failed to decode image: {exc}", exc)
            raise ValueError("Invalid recovery capture provided") from exc

    def _ensure_backend(self):
        if cv2 is None or self.face_detector is None:
            raise ValueError("Visual recovery backend unavailable. Install OpenCV first.")
