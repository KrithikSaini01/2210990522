"""Main entry point."""
import json
import sys

from core.application import Application
from steganography.steganography_engine import SteganographyEngine
from utils.logger import log, log_exception


def write_response(payload):
    """Write a JSON response to stdout."""
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main():
    """Main application loop."""
    log("[ENGINE] Initializing OBSIDYN core", level="DEBUG")

    app = Application()
    app.initialize()

    while True:
        try:
            raw_line = sys.stdin.readline()
            if not raw_line:
                log("[ENGINE] stdin closed, exiting", level="DEBUG")
                break
            
            raw_line = raw_line.strip()
            if not raw_line:
                continue

            try:
                cmd = json.loads(raw_line)
            except json.JSONDecodeError:
                log("[ENGINE] Invalid JSON command", level="ERROR")
                continue

            action = cmd.get("action")
            payload = cmd.get("payload", {})
            vault = app.get_vault_manager()

            if action == "AUTH":
                mfa_req = app.config.get("pvs_mfa_required", False)
                pvs_verified = getattr(app.session, "pvs_verified", False)

                if mfa_req and not pvs_verified:
                    write_response(
                        {
                            "status": "AUTH_FAIL",
                            "action": "AUTH",
                            "data": {"message": "Multi-Factor Authentication enabled. Please verify your Carrier Image via 'PVS-pass Bypass' first.", "behavioral": {}},
                        }
                    )
                    continue

                pwd_hash = payload.get("password_hash")
                is_pure_pvs_bypass = pvs_verified and not mfa_req and not pwd_hash

                if is_pure_pvs_bypass:
                    # MFA OFF + PVS verified + no password typed:
                    # Retrieve stored master hash and grant session directly,
                    # skipping Rhythm Lock (no keystroke to evaluate).
                    stored_hash = app.authenticator.rhythm_profile.get_master_hash()
                    if not stored_hash:
                        write_response({
                            "status": "AUTH_FAIL", "action": "AUTH",
                            "data": {"message": "No master identity enrolled. Enter your master key to register.", "behavioral": {}}
                        })
                        continue
                    try:
                        from crypto.key_derivation import KeyDerivation
                        session_key = KeyDerivation().derive_key(stored_hash)
                        app.session.set_authenticated(True)
                        app.session.set_session_key(session_key)
                        app.authenticator.session_key = session_key
                        from vault.vault_manager import VaultManager
                        app.vault_manager = VaultManager(session_key)
                        behavioral = app._decorate_behavioral_status(
                            app.authenticator.rhythm_profile.get_status()
                        )
                        behavioral["pvs_bypass"] = True
                        write_response({
                            "status": "AUTH_SUCCESS", "action": "AUTH",
                            "data": {"message": "PVS-pass session established.", "behavioral": behavioral}
                        })
                    except Exception as e:
                        log(f"[AUTH] PVS bypass session error: {e}", level="ERROR")
                        write_response({
                            "status": "AUTH_FAIL", "action": "AUTH",
                            "data": {"message": f"PVS bypass failed: {e}", "behavioral": {}}
                        })
                    continue

                if not pwd_hash:
                    write_response(
                        {
                            "status": "AUTH_FAIL",
                            "action": "AUTH",
                            "data": {"message": "No password provided", "behavioral": {}},
                        }
                    )
                    continue

                success, message, behavioral = app.authenticate(
                    pwd_hash,
                    payload.get("keystroke_sample"),
                    payload.get("recovery_payload"),
                )
                write_response(
                    {
                        "status": "AUTH_SUCCESS" if success else "AUTH_FAIL",
                        "action": "AUTH",
                        "data": {
                            "message": "Session established" if success else message,
                            "behavioral": behavioral,
                        },
                    }
                )
                continue

            if action == "GET_AUTH_STATUS":
                write_response(
                    {"status": "OK", "action": "GET_AUTH_STATUS", "data": app.get_auth_status()}
                )
                continue

            if action == "AUTH_VISUAL_RECOVERY":
                success, message, behavioral = app.authenticate_visual_recovery(
                    payload.get("recovery_payload")
                )
                write_response(
                    {
                        "status": "AUTH_SUCCESS" if success else "AUTH_FAIL",
                        "action": "AUTH_VISUAL_RECOVERY",
                        "data": {
                            "message": "Visual recovery session established" if success else message,
                            "behavioral": behavioral,
                        },
                    }
                )
                continue

            if action == "VERIFY_PVS_PASS":
                carrier_path = payload.get("carrier_image_path")
                try:
                    import hashlib, os, tempfile
                    steg = SteganographyEngine()
                    
                    stored_hash = app.config.get("pvs_pass_hash")
                    if not stored_hash:
                        write_response({"status": "AUTH_FAIL", "action": "VERIFY_PVS_PASS", "data": "PVS-pass is not configured. Please enroll it in Settings first."})
                        continue
                    
                    # Write extracted data to a safe temp dir to avoid path issues
                    tmp_dir = tempfile.gettempdir()
                    tmp_out = os.path.join(tmp_dir, "pvs_extracted.bin")
                    extract_res = steg.extract_data(carrier_path, output_path=tmp_out)
                    
                    if extract_res.get("status") == "SUCCESS":
                        extracted_text = ""
                        if os.path.exists(tmp_out):
                            with open(tmp_out, 'rb') as f:
                                extracted_bytes = f.read()
                            try:
                                extracted_text = extracted_bytes.decode('utf-8')
                            except UnicodeDecodeError:
                                extracted_text = extracted_bytes.decode('latin-1', errors='ignore')
                            extracted_text = extracted_text.replace('\ufeff', '').strip()
                            try:
                                os.remove(tmp_out)
                            except Exception:
                                pass
                        
                        extracted_hash = hashlib.sha256(extracted_text.encode('utf-8')).hexdigest()
                        
                        mfa_req = app.config.get("pvs_mfa_required", False)
                        if extracted_hash != stored_hash:
                            log(f"[PVS-PASS] Hash mismatch. Extracted: {len(extracted_text)} chars", level="ERROR")
                            write_response({"status": "AUTH_FAIL", "action": "VERIFY_PVS_PASS", "data": "The hidden text in the image does not match your saved PVS-pass."})
                        else:
                            app.session.pvs_verified = True
                            write_response({
                                "status": "SUCCESS",
                                "action": "VERIFY_PVS_PASS",
                                "data": {"message": "PVS-pass Image Verified"},
                            })
                    else:
                        error_msg = extract_res.get('data', 'Invalid Carrier Image')
                        if "not a zip file" in str(error_msg).lower():
                            error_msg = "Image does not contain a valid OBSIDYN PVS-pass payload."
                        write_response({"status": "AUTH_FAIL", "action": "VERIFY_PVS_PASS", "data": error_msg})
                except Exception as e:
                    log(f"[PVS-PASS] Exception: {e}", level="ERROR")
                    write_response({"status": "AUTH_FAIL", "action": "VERIFY_PVS_PASS", "data": f"Error: {e}"})
                continue

            if action == "REVEAL_PVS_PASS":
                pwd_hash = payload.get("password_hash", "")
                if app.authenticator.rhythm_profile.master_hash_matches(pwd_hash):
                    pvs_text = app.config.get("pvs_pass_text", "")
                    if pvs_text:
                        write_response({"status": "SUCCESS", "action": "REVEAL_PVS_PASS", "data": pvs_text})
                    else:
                        write_response({"status": "ERROR", "action": "REVEAL_PVS_PASS", "data": "No PVS-pass text is currently stored."})
                else:
                    write_response({"status": "ERROR", "action": "REVEAL_PVS_PASS", "data": "Access Denied: Invalid Master Key."})
                continue

            if action == "GET_APP_SETTINGS":
                response = app.get_app_settings()
                response["action"] = "GET_APP_SETTINGS"
                write_response(response)
                continue

            if action == "LOGOUT":
                app.logout()
                app.session.pvs_verified = False
                write_response(
                    {
                        "status": "LOGOUT_SUCCESS",
                        "action": "LOGOUT",
                        "data": "Session terminated",
                    }
                )
                continue

            if not app.is_authenticated():
                write_response({"status": "ERROR", "data": "Not authenticated", "action": action})
                continue

            if action == "PING":
                response = {"status": "PONG", "data": None}
            elif action == "GET_STATUS":
                response = {
                    "status": "OK",
                    "data": {
                        "authenticated": app.is_authenticated(),
                        "vault_items": len(vault.get_vault_list().get("data", [])) if vault else 0,
                    },
                }
            elif action == "GET_OPERATOR_PROFILE":
                response = app.get_operator_profile()
            elif action == "SAVE_OPERATOR_PROFILE":
                response = app.save_operator_profile(
                    payload.get("profile", {}),
                    payload.get("note_passcode"),
                )
            elif action == "GET_OPERATOR_NOTES":
                response = app.unlock_operator_notes(payload.get("passcode"))
            elif action == "SAVE_OPERATOR_NOTES":
                response = app.save_operator_notes(
                    payload.get("passcode"),
                    payload.get("note_title"),
                    payload.get("note_content"),
                    payload.get("note_id"),
                )
            elif action == "ROTATE_OPERATOR_NOTE_PASSCODE":
                response = app.rotate_operator_note_passcode(
                    payload.get("current_passcode"),
                    payload.get("new_passcode"),
                )
            elif action == "UPDATE_APP_SETTINGS":
                response = app.update_app_settings(payload)
            elif action == "UPDATE_RHYTHM_POLICY":
                response = app.update_rhythm_policy(
                    payload.get("minimum_training_samples"),
                    payload.get("threshold"),
                )
            elif action == "ENROLL_VISUAL_RECOVERY":
                response = app.enroll_visual_recovery(
                    payload.get("face_image"),
                    payload.get("gesture_image"),
                    payload.get("gesture_label"),
                )
            elif action == "DELETE_VISUAL_RECOVERY":
                response = app.delete_visual_recovery()
            elif action == "ROTATE_MASTER_KEY":
                response = app.rotate_master_key(
                    payload.get("current_password_hash"),
                    payload.get("new_password_hash"),
                )
            elif action == "LOCK_FILE":
                response = (
                    vault.lock_file(payload.get("path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "LOCK_FOLDER":
                response = (
                    vault.lock_folder(payload.get("path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "UNLOCK_FILE":
                response = (
                    vault.unlock_file(payload.get("container"), payload.get("restore_path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "UNLOCK_FOLDER":
                response = (
                    vault.unlock_folder(payload.get("container"), payload.get("restore_path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "DELETE_VAULT_ITEM":
                response = (
                    vault.delete_item(payload.get("container"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "GET_VAULT_LIST":
                response = (
                    vault.get_vault_list()
                    if vault
                    else {"status": "OK", "data": [], "total_count": 0}
                )
            elif action == "CREATE_DECOY_VAULT":
                response = app.create_decoy_vault(
                    payload.get("target_dir"),
                    payload.get("profile", "operations"),
                    int(payload.get("file_count", 3) or 3),
                )
            elif action == "GET_DECOY_STATUS":
                response = app.get_decoy_status()
            elif action == "CLEAR_ALL_DECOYS":
                response = app.clear_all_decoys()
            elif action == "CLEAR_DECOY_HISTORY":
                response = app.clear_decoy_history()
            elif action == "EXPORT_DECOY_MEMORY_LOG":
                response = app.export_decoy_memory_log()
            elif action == "START_MONITORING":
                response = app.start_monitoring()
            elif action == "STOP_MONITORING":
                response = app.stop_monitoring()
            elif action == "GET_MONITOR_STATUS":
                response = app.get_monitor_status()
            elif action == "CLEAR_MONITOR_EVENTS":
                app.system_monitor.clear_events()
                response = app.get_monitor_status()  # return fresh (empty) state
            elif action == "HIDE_DATA":
                steg_key = vault.session_key if vault else None
                steg = SteganographyEngine(steg_key)
                response = steg.hide_data(
                    payload.get("data_file"),
                    payload.get("image_file"),
                    payload.get("output_path"),
                    payload.get("password"),
                )
            elif action == "EXTRACT_DATA":
                steg_key = vault.session_key if vault else None
                steg = SteganographyEngine(steg_key)
                response = steg.extract_data(
                    payload.get("image_file"),
                    payload.get("output_path"),
                    payload.get("password"),
                )
            elif action == "SCAN_IMAGE":
                response = SteganographyEngine().scan_image(payload.get("image_file"))
            elif action == "SANITIZE_IMAGE":
                response = SteganographyEngine().sanitize_image(
                    payload.get("image_file"),
                    payload.get("output_path")
                )
            elif action == "PC_CONTROL":
                import subprocess, os
                cmd_str = payload.get("cmd", "")
                try:
                    if cmd_str.startswith("ms-settings:") or cmd_str.startswith("windowsdefender:"):
                        os.startfile(cmd_str)
                    else:
                        subprocess.Popen(cmd_str, shell=True)
                    response = {"status": "SUCCESS", "data": f"Command executed"}
                except Exception as e:
                    response = {"status": "ERROR", "data": str(e)}
            elif action == "SHRED_FILE":
                from security.secure_deleter import SecureDeleter

                deleter = SecureDeleter()
                success = deleter.secure_delete(payload.get("path"))
                response = {
                    "status": "SUCCESS" if success else "ERROR",
                    "data": "File permanently destroyed" if success else "Shred failed",
                }
            else:
                response = {"status": "ERROR", "data": f"Unknown action: {action}"}

            if isinstance(response, dict) and "action" not in response:
                response["action"] = action

            write_response(response)
        except Exception as exc:
            log_exception(f"[ENGINE] Critical error: {exc}", exc)
            write_response({"status": "ERROR", "data": f"System error: {exc}"})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("[ENGINE] Shutdown requested", level="DEBUG")
    except Exception as exc:
        log_exception(f"[ENGINE] Fatal error: {exc}", exc)





