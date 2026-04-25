"""Encrypted operator dossier and note-vault storage."""
import hashlib
import json
import os
import uuid

from crypto.cipher import Cipher
from utils.file_utils import FileUtils
from utils.logger import log_exception


class OperatorProfileManager:
    """Stores operator dossier data encrypted under the session key."""

    DEFAULT_PROFILE = {
        "call_sign": "",
        "full_name": "",
        "organization": "",
        "designation": "",
        "email": "",
        "phone": "",
        "location": "",
        "recovery_phrase_hint": "",
        "operator_image_data": None,
        "created_at": None,
        "updated_at": None,
        "note_lock_enabled": False,
        "note_passcode_hash": None,
        "note_vault_ciphertext": None,
        "note_entries_count": 0,
        "note_timeline": [],
    }

    DEFAULT_NOTE_VAULT = {
        "entries": [],
        "updated_at": None,
        "last_unlocked_at": None,
    }

    TIMELINE_LIMIT = 40

    def __init__(self):
        self.profile_path = self._get_profile_path()

    def _get_profile_path(self):
        data_dir = os.environ.get('OBSIDYN_DATA_DIR')
        if data_dir:
            return os.path.join(data_dir, "config", "operator_profile.sys")
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "config", "operator_profile.sys")

    def _default_payload(self):
        return {
            "version": 2,
            "ciphertext": None,
            "updated_at": None,
        }

    def _read_payload(self):
        try:
            loaded = FileUtils.read_json(self.profile_path)
            if isinstance(loaded, dict):
                payload = self._default_payload()
                payload.update(loaded)
                return payload
        except Exception as exc:
            log_exception(f"[IDENTITY] Failed to read operator profile: {exc}", exc)

        return self._default_payload()

    def _read_profile(self, session_key):
        payload = self._read_payload()
        ciphertext = payload.get("ciphertext")
        if not ciphertext:
            return dict(self.DEFAULT_PROFILE)

        try:
            decrypted = Cipher.decrypt(session_key, ciphertext)
            parsed = json.loads(decrypted)
            if isinstance(parsed, dict):
                profile = dict(self.DEFAULT_PROFILE)
                profile.update(parsed)
                profile["note_timeline"] = list(parsed.get("note_timeline", []))[-self.TIMELINE_LIMIT :]
                return profile
        except Exception as exc:
            log_exception(f"[IDENTITY] Failed to decrypt operator profile: {exc}", exc)
            raise ValueError("Unable to decrypt operator profile") from exc

        return dict(self.DEFAULT_PROFILE)

    def _write_profile(self, session_key, profile):
        profile["note_timeline"] = list(profile.get("note_timeline", []))[-self.TIMELINE_LIMIT :]
        encrypted = Cipher.encrypt(session_key, json.dumps(profile))
        FileUtils.write_json(
            self.profile_path,
            {
                "version": 2,
                "ciphertext": encrypted,
                "updated_at": profile.get("updated_at"),
            },
        )

    @staticmethod
    def _hash_passcode(passcode):
        return hashlib.sha256(f"OBSIDYN_NOTE::{passcode}".encode("utf-8")).hexdigest()

    @staticmethod
    def _derive_note_key(passcode):
        return hashlib.sha256(f"OBSIDYN_NOTE_KEY::{passcode}".encode("utf-8")).digest()

    @staticmethod
    def _make_note_entry(title, content, created_at=None, updated_at=None, entry_id=None):
        title = str(title or "").strip() or "Untitled Note"
        content = str(content or "")
        timestamp = updated_at or created_at or FileUtils.get_timestamp()
        return {
            "id": entry_id or str(uuid.uuid4()),
            "title": title[:120],
            "content": content,
            "created_at": created_at or timestamp,
            "updated_at": updated_at or timestamp,
        }

    def _normalize_note_vault(self, note_payload):
        normalized = dict(self.DEFAULT_NOTE_VAULT)
        normalized.update(note_payload or {})

        entries = []
        for entry in normalized.get("entries", []) or []:
            if not isinstance(entry, dict):
                continue
            entries.append(
                self._make_note_entry(
                    entry.get("title"),
                    entry.get("content"),
                    created_at=entry.get("created_at"),
                    updated_at=entry.get("updated_at"),
                    entry_id=entry.get("id"),
                )
            )

        if not entries:
            legacy_mission = str((note_payload or {}).get("mission_notes") or "").strip()
            legacy_private = str((note_payload or {}).get("private_notes") or "").strip()
            if legacy_mission:
                entries.append(self._make_note_entry("Mission Notes", legacy_mission))
            if legacy_private:
                entries.append(self._make_note_entry("Deep Storage Notes", legacy_private))

        normalized["entries"] = entries
        return normalized

    def _public_note_vault(self, note_payload, include_content=True):
        normalized = self._normalize_note_vault(note_payload)
        entries = []
        for entry in normalized.get("entries", []):
            public_entry = {
                "id": entry.get("id"),
                "title": entry.get("title") or "Untitled Note",
                "created_at": entry.get("created_at"),
                "updated_at": entry.get("updated_at"),
            }
            if include_content:
                public_entry["content"] = entry.get("content", "")
            entries.append(public_entry)

        return {
            "entries": entries,
            "updated_at": normalized.get("updated_at"),
            "last_unlocked_at": normalized.get("last_unlocked_at"),
        }

    def _append_timeline(self, profile, action, detail):
        timeline = list(profile.get("note_timeline", []))
        timeline.append(
            {
                "timestamp": FileUtils.get_timestamp(),
                "action": action,
                "detail": detail,
            }
        )
        profile["note_timeline"] = timeline[-self.TIMELINE_LIMIT :]

    def _build_public_profile(self, profile):
        return {
            "call_sign": profile.get("call_sign", ""),
            "full_name": profile.get("full_name", ""),
            "organization": profile.get("organization", ""),
            "designation": profile.get("designation", ""),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "location": profile.get("location", ""),
            "recovery_phrase_hint": profile.get("recovery_phrase_hint", ""),
            "operator_image_data": profile.get("operator_image_data"),
            "created_at": profile.get("created_at"),
            "updated_at": profile.get("updated_at"),
            "note_lock_enabled": bool(profile.get("note_lock_enabled")),
            "notes_configured": bool(profile.get("note_passcode_hash")),
            "notes_count": int(profile.get("note_entries_count") or 0),
            "note_timeline": list(profile.get("note_timeline", []))[-15:],
            "has_dossier": any(
                bool(profile.get(key))
                for key in (
                    "call_sign",
                    "full_name",
                    "organization",
                    "designation",
                    "email",
                    "phone",
                    "location",
                    "recovery_phrase_hint",
                )
            ) or bool(profile.get("created_at")),
        }

    def load_profile(self, session_key):
        """Load the public operator dossier state."""
        profile = self._read_profile(session_key)
        return self._build_public_profile(profile)

    def save_profile(self, session_key, profile_patch, note_passcode=None):
        """Persist operator dossier fields securely."""
        profile = self._read_profile(session_key)
        before_public = self._build_public_profile(profile)

        for key in (
            "call_sign",
            "full_name",
            "organization",
            "designation",
            "email",
            "phone",
            "location",
            "recovery_phrase_hint",
            "operator_image_data",
        ):
            if key in (profile_patch or {}):
                if key == "operator_image_data":
                    value = profile_patch.get(key)
                    profile[key] = str(value) if value else None
                else:
                    profile[key] = str(profile_patch.get(key) or "")

        timestamp = FileUtils.get_timestamp()
        if not profile.get("created_at"):
            profile["created_at"] = timestamp
            self._append_timeline(profile, "DOSSIER_CREATED", "Operator dossier initialized")
        elif any(
            before_public.get(field) != profile.get(field)
            for field in (
                "call_sign",
                "full_name",
                "organization",
                "designation",
                "email",
                "phone",
                "location",
                "recovery_phrase_hint",
                "operator_image_data",
            )
        ):
            self._append_timeline(profile, "DOSSIER_UPDATED", "Operator dossier fields updated")

        if note_passcode and not profile.get("note_passcode_hash"):
            profile["note_passcode_hash"] = self._hash_passcode(note_passcode)
            profile["note_lock_enabled"] = True
            default_vault = dict(self.DEFAULT_NOTE_VAULT)
            default_vault["updated_at"] = timestamp
            profile["note_vault_ciphertext"] = Cipher.encrypt(
                self._derive_note_key(note_passcode),
                json.dumps(default_vault),
            )
            profile["note_entries_count"] = 0
            self._append_timeline(profile, "NOTES_CODE_SET", "Notes access code created")

        profile["updated_at"] = timestamp
        self._write_profile(session_key, profile)
        return self._build_public_profile(profile)

    def unlock_notes(self, session_key, passcode):
        """Unlock note entries with the dedicated notes passcode."""
        profile = self._read_profile(session_key)
        if not profile.get("note_passcode_hash"):
            raise ValueError("Notes access code is not configured")
        if self._hash_passcode(passcode) != profile.get("note_passcode_hash"):
            raise ValueError("Invalid notes access code")

        note_payload = dict(self.DEFAULT_NOTE_VAULT)
        ciphertext = profile.get("note_vault_ciphertext")
        if ciphertext:
            decrypted = Cipher.decrypt(self._derive_note_key(passcode), ciphertext)
            parsed = json.loads(decrypted)
            if isinstance(parsed, dict):
                note_payload.update(parsed)

        note_payload = self._normalize_note_vault(note_payload)
        note_payload["last_unlocked_at"] = FileUtils.get_timestamp()
        profile["note_entries_count"] = len(note_payload.get("entries", []))
        profile["updated_at"] = FileUtils.get_timestamp()
        profile["note_vault_ciphertext"] = Cipher.encrypt(
            self._derive_note_key(passcode),
            json.dumps(note_payload),
        )
        self._append_timeline(profile, "NOTES_UNLOCKED", "Notes vault opened with access code")
        self._write_profile(session_key, profile)
        return {
            **self._public_note_vault(note_payload, include_content=True),
            "note_timeline": list(profile.get("note_timeline", []))[-15:],
        }

    def save_notes(self, session_key, passcode, note_title, note_content, note_id=None):
        """Save a sealed note entry using the note access code."""
        profile = self._read_profile(session_key)
        if not profile.get("note_passcode_hash"):
            profile["note_passcode_hash"] = self._hash_passcode(passcode)
            profile["note_lock_enabled"] = True
            self._append_timeline(profile, "NOTES_CODE_SET", "Notes access code created")
        elif self._hash_passcode(passcode) != profile.get("note_passcode_hash"):
            raise ValueError("Invalid notes access code")

        timestamp = FileUtils.get_timestamp()
        note_payload = dict(self.DEFAULT_NOTE_VAULT)
        ciphertext = profile.get("note_vault_ciphertext")
        if ciphertext:
            decrypted = Cipher.decrypt(self._derive_note_key(passcode), ciphertext)
            parsed = json.loads(decrypted)
            if isinstance(parsed, dict):
                note_payload.update(parsed)

        note_payload = self._normalize_note_vault(note_payload)
        entries = list(note_payload.get("entries", []))
        saved_entry = None

        if note_id:
            for index, entry in enumerate(entries):
                if entry.get("id") == note_id:
                    saved_entry = self._make_note_entry(
                        note_title,
                        note_content,
                        created_at=entry.get("created_at"),
                        updated_at=timestamp,
                        entry_id=note_id,
                    )
                    entries[index] = saved_entry
                    break

        if not saved_entry:
            saved_entry = self._make_note_entry(
                note_title,
                note_content,
                created_at=timestamp,
                updated_at=timestamp,
                entry_id=note_id,
            )
            entries.append(saved_entry)

        note_payload = {
            "entries": entries,
            "updated_at": timestamp,
            "last_unlocked_at": timestamp,
        }
        profile["note_vault_ciphertext"] = Cipher.encrypt(
            self._derive_note_key(passcode),
            json.dumps(note_payload),
        )
        profile["note_lock_enabled"] = True
        profile["note_entries_count"] = len(entries)
        if not profile.get("created_at"):
            profile["created_at"] = timestamp
        profile["updated_at"] = timestamp
        self._append_timeline(profile, "NOTE_SEALED", saved_entry.get("title") or "Untitled Note")
        self._write_profile(session_key, profile)
        return {
            **self._public_note_vault(note_payload, include_content=True),
            "saved_note_id": saved_entry.get("id"),
            "note_timeline": list(profile.get("note_timeline", []))[-15:],
        }

    def rotate_note_passcode(self, session_key, current_passcode, new_passcode):
        """Rotate the notes access code without losing notes."""
        profile = self._read_profile(session_key)
        if not profile.get("note_passcode_hash"):
            raise ValueError("Notes access code is not configured")
        if self._hash_passcode(current_passcode) != profile.get("note_passcode_hash"):
            raise ValueError("Current notes access code is invalid")

        note_payload = dict(self.DEFAULT_NOTE_VAULT)
        ciphertext = profile.get("note_vault_ciphertext")
        if ciphertext:
            decrypted = Cipher.decrypt(self._derive_note_key(current_passcode), ciphertext)
            parsed = json.loads(decrypted)
            if isinstance(parsed, dict):
                note_payload.update(parsed)

        note_payload = self._normalize_note_vault(note_payload)
        profile["note_passcode_hash"] = self._hash_passcode(new_passcode)
        profile["note_vault_ciphertext"] = Cipher.encrypt(
            self._derive_note_key(new_passcode),
            json.dumps(note_payload),
        )
        profile["note_lock_enabled"] = True
        profile["note_entries_count"] = len(note_payload.get("entries", []))
        profile["updated_at"] = FileUtils.get_timestamp()
        self._append_timeline(profile, "NOTES_CODE_ROTATED", "Notes access code changed")
        self._write_profile(session_key, profile)
        return self._build_public_profile(profile)

    def rotate_key(self, old_key, new_key):
        """Re-encrypt profile data under a new session key."""
        payload = self._read_payload()
        if not payload.get("ciphertext"):
            return

        profile = self._read_profile(old_key)
        self._write_profile(new_key, profile)
