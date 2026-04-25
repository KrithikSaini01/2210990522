"""Behavioral keystroke profile management for Rhythm Lock."""
import hmac
import math
import os
from datetime import datetime

from utils.file_utils import FileUtils
from utils.logger import log_exception


class RhythmProfile:
    """Stores and evaluates keystroke dynamics for the master identity."""

    MINIMUM_TRAINING_SAMPLES = 5
    MAX_SAMPLES = 20
    THRESHOLD = 1.5
    METRIC_KEYS = (
        "dwell_mean",
        "dwell_std",
        "flight_mean",
        "flight_std",
        "total_duration",
        "correction_ratio",
    )

    def __init__(self):
        self.profile_path = self._get_profile_path()
        self.profile = self._load_profile()

    def _get_profile_path(self):
        data_dir = os.environ.get('OBSIDYN_DATA_DIR')
        if data_dir:
            return os.path.join(data_dir, "config", "auth_profile.sys")
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "config", "auth_profile.sys")

    def _default_profile(self):
        return {
            "master_hash": None,
            "created_at": None,
            "updated_at": None,
            "lock_name": "Rhythm Lock",
            "keystroke_profile": {
                "samples": [],
                "sample_count": 0,
                "last_score": None,
                "last_result": "UNINITIALIZED",
                "threshold": self.THRESHOLD,
                "minimum_training_samples": self.MINIMUM_TRAINING_SAMPLES,
            },
        }

    def _load_profile(self):
        try:
            parsed = FileUtils.read_json(self.profile_path)
            if parsed is None:
                return self._default_profile()
            profile = self._default_profile()
            if isinstance(parsed, dict):
                profile.update(parsed)
                if isinstance(parsed.get("keystroke_profile"), dict):
                    profile["keystroke_profile"].update(parsed["keystroke_profile"])
            return profile
        except Exception as exc:
            log_exception(f"[RHYTHM] Error loading profile: {exc}", exc)
            return self._default_profile()

    def _save_profile(self):
        self.profile["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        FileUtils.write_json(self.profile_path, self.profile)

    def has_master_identity(self):
        return bool(self.profile.get("master_hash"))

    def get_master_hash(self):
        """Return the currently enrolled master hash."""
        return self.profile.get("master_hash")

    def get_status(self):
        key_profile = self.profile["keystroke_profile"]
        return {
            "configured": self.has_master_identity(),
            "lock_name": self.profile.get("lock_name", "Rhythm Lock"),
            "sample_count": key_profile.get("sample_count", 0),
            "minimum_training_samples": key_profile.get(
                "minimum_training_samples", self.MINIMUM_TRAINING_SAMPLES
            ),
            "enforcement_ready": key_profile.get("sample_count", 0)
            >= key_profile.get("minimum_training_samples", self.MINIMUM_TRAINING_SAMPLES),
            "last_score": key_profile.get("last_score"),
            "last_result": key_profile.get("last_result"),
            "threshold": key_profile.get("threshold", self.THRESHOLD),
        }

    def enroll_identity(self, password_hash, keystroke_sample=None):
        """Create the initial master identity and first training sample."""
        if not self.has_master_identity():
            self.profile["master_hash"] = password_hash
            self.profile["created_at"] = datetime.utcnow().isoformat(timespec="seconds")
            result = self._record_training_sample(keystroke_sample, "ENROLLED")
            self._save_profile()
            return result
        raise ValueError("Master identity already exists")

    def master_hash_matches(self, password_hash):
        """Check whether the supplied hash matches the enrolled master identity."""
        stored_hash = self.profile.get("master_hash")
        if not stored_hash:
            return False
        return hmac.compare_digest(stored_hash, password_hash)

    def reject_master_hash(self):
        """Build a master key rejection payload."""
        return {
            "accepted": False,
            "message": "Master key mismatch",
            "behavioral_result": "MASTER_KEY_REJECTED",
            **self.get_status(),
        }

    def evaluate_sample(self, sample):
        """Evaluate an input keystroke sample against the profile."""
        return self._evaluate_sample(sample)

    def accept_recovery_override(self, sample):
        """Accept a visual-recovery override and fold the sample back into training."""
        key_profile = self.profile["keystroke_profile"]
        summary = self._summarize_sample(sample)
        if summary:
            samples = key_profile.get("samples", [])
            samples.append(summary)
            key_profile["samples"] = samples[-self.MAX_SAMPLES :]
            key_profile["sample_count"] = len(key_profile["samples"])

        key_profile["last_result"] = "RECOVERY_OVERRIDE"
        key_profile["last_score"] = None
        self._save_profile()
        return {
            "accepted": True,
            "message": "Visual recovery override accepted",
            "behavioral_result": "RECOVERY_OVERRIDE",
            **self.get_status(),
        }

    def update_policy(self, minimum_training_samples=None, threshold=None):
        """Update Rhythm Lock training controls."""
        key_profile = self.profile["keystroke_profile"]
        if minimum_training_samples is not None:
            key_profile["minimum_training_samples"] = max(
                3, min(int(minimum_training_samples), 15)
            )
        if threshold is not None:
            key_profile["threshold"] = round(max(1.0, min(float(threshold), 8.0)), 2)
        self._save_profile()
        return self.get_status()

    def rotate_identity(self, current_hash, new_hash, reset_samples=True):
        """Change the enrolled master identity."""
        if not self.master_hash_matches(current_hash):
            return False, self.reject_master_hash()

        self.profile["master_hash"] = new_hash
        if reset_samples:
            key_profile = self.profile["keystroke_profile"]
            key_profile["samples"] = []
            key_profile["sample_count"] = 0
            key_profile["last_score"] = None
            key_profile["last_result"] = "RESET_FOR_NEW_MASTER_KEY"
        self._save_profile()
        return True, {
            "accepted": True,
            "message": "Master key rotated. Rhythm Lock retraining required.",
            "behavioral_result": self.profile["keystroke_profile"]["last_result"],
            **self.get_status(),
        }

    def _summarize_sample(self, sample):
        if not sample or not isinstance(sample, dict):
            return None

        dwell = [float(value) for value in sample.get("dwell_times", []) if value is not None]
        flight = [float(value) for value in sample.get("flight_times", []) if value is not None]
        total_duration = float(sample.get("total_duration", 0) or 0)
        key_count = int(sample.get("key_count", 0) or 0)
        correction_count = int(sample.get("correction_count", 0) or 0)

        if key_count <= 1 or total_duration <= 0:
            return None

        return {
            "dwell_mean": self._mean(dwell),
            "dwell_std": self._std(dwell),
            "flight_mean": self._mean(flight),
            "flight_std": self._std(flight),
            "total_duration": total_duration,
            "key_count": key_count,
            "correction_ratio": correction_count / max(key_count, 1),
            "captured_at": datetime.utcnow().isoformat(timespec="seconds"),
        }

    def _record_training_sample(self, sample, result_label):
        summary = self._summarize_sample(sample)
        if summary:
            samples = self.profile["keystroke_profile"]["samples"]
            samples.append(summary)
            self.profile["keystroke_profile"]["samples"] = samples[-self.MAX_SAMPLES :]
            self.profile["keystroke_profile"]["sample_count"] = len(
                self.profile["keystroke_profile"]["samples"]
            )

        self.profile["keystroke_profile"]["last_result"] = result_label
        return {
            "accepted": True,
            "message": "Master key enrolled"
            if result_label == "ENROLLED"
            else "Behavioral profile training updated",
            "behavioral_result": result_label,
            **self.get_status(),
        }

    def _evaluate_sample(self, sample):
        key_profile = self.profile["keystroke_profile"]
        sample_count = key_profile.get("sample_count", 0)

        if sample_count < key_profile.get(
            "minimum_training_samples", self.MINIMUM_TRAINING_SAMPLES
        ):
            result = self._record_training_sample(sample, "TRAINING")
            self._save_profile()
            result["message"] = (
                f"Rhythm Lock training {result['sample_count']}/"
                f"{result['minimum_training_samples']}"
            )
            return result

        summary = self._summarize_sample(sample)
        if not summary:
            return {
                "accepted": False,
                "message": "No keystroke sample captured",
                "behavioral_result": "NO_SAMPLE",
                **self.get_status(),
            }

        score = self._score_sample(summary)
        accepted = score <= key_profile.get("threshold", self.THRESHOLD)
        key_profile["last_score"] = round(score, 3)
        key_profile["last_result"] = "VERIFIED" if accepted else "REJECTED"

        if accepted:
            samples = key_profile["samples"]
            samples.append(summary)
            key_profile["samples"] = samples[-self.MAX_SAMPLES :]
            key_profile["sample_count"] = len(key_profile["samples"])

        self._save_profile()
        return {
            "accepted": accepted,
            "message": "Rhythm Lock verified"
            if accepted
            else "Behavioral mismatch detected",
            "behavioral_result": key_profile["last_result"],
            **self.get_status(),
        }

    def _score_sample(self, summary):
        key_profile = self.profile["keystroke_profile"]
        samples = key_profile.get("samples", [])
        if not samples:
            return 0.0

        score_total = 0.0
        for metric in self.METRIC_KEYS:
            baseline = [entry.get(metric, 0.0) for entry in samples]
            mean = self._mean(baseline)
            actual_std = self._std(baseline)
            
            # Enforce strict rhythm sensitivity: cap the allowed standard deviation 
            # to at most 15% of the mean so sloppy training doesn't permanently loosen the lock.
            max_allowed_std = max(mean * 0.15, 10.0)
            capped_std = min(actual_std, max_allowed_std)
            
            # Also set a tight minimum floor so it's perfectly sensitive
            std = max(capped_std, mean * 0.04, 3.0 if "duration" in metric else 1.0)
            
            score_total += abs(summary.get(metric, 0.0) - mean) / std

        expected_keys = self._mean([entry.get("key_count", 0) for entry in samples])
        # Massive penalty for typing a different number of keys (e.g. backspaces)
        key_penalty = abs(summary.get("key_count", 0) - expected_keys) * 3.0
        return (score_total / len(self.METRIC_KEYS)) + key_penalty

    @staticmethod
    def _mean(values):
        if not values:
            return 0.0
        return sum(values) / len(values)

    @staticmethod
    def _std(values):
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        return math.sqrt(variance)
