"""SMTP email notifications for decoy alerts."""
import smtplib
from email.message import EmailMessage

from utils.logger import log_exception


class EmailNotifier:
    """Sends decoy alert emails when SMTP is configured."""

    def __init__(self, config_manager):
        self.config = config_manager

    def is_configured(self):
        return bool(
            self.config.get("decoy_email_enabled", False)
            and self.config.get("decoy_email_recipient")
            and self.config.get("decoy_email_sender")
            and self.config.get("decoy_email_app_password")
        )

    def send_decoy_alert(self, alert):
        if not self.is_configured():
            return {"sent": False, "reason": "email alerts not configured"}

        sender = self.config.get("decoy_email_sender")
        recipient = self.config.get("decoy_email_recipient")
        password = self.config.get("decoy_email_app_password")
        host = self.config.get("decoy_email_smtp_host", "smtp.gmail.com")
        port = int(self.config.get("decoy_email_smtp_port", 587))
        use_tls = bool(self.config.get("decoy_email_use_tls", True))

        message = EmailMessage()
        message["Subject"] = f"OBSIDYN Honey Alert | {alert.get('kind', 'EVENT')}"
        message["From"] = sender
        message["To"] = recipient
        message.set_content(
            "\n".join(
                [
                    "OBSIDYN decoy alert triggered.",
                    f"Type: {alert.get('kind', 'UNKNOWN')}",
                    f"Vault: {alert.get('vault', 'Unknown')}",
                    f"File: {alert.get('file', 'Unknown')}",
                    f"Time: {alert.get('timestamp', 'Unknown')}",
                    "",
                    f"Detail: {alert.get('message', 'No detail available')}",
                ]
            )
        )

        try:
            with smtplib.SMTP(host, port, timeout=12) as server:
                if use_tls:
                    server.starttls()
                server.login(sender, password)
                server.send_message(message)
            return {"sent": True}
        except Exception as exc:
            log_exception(f"[EMAIL] Failed to send decoy alert email: {exc}", exc)
            return {"sent": False, "reason": str(exc)}
