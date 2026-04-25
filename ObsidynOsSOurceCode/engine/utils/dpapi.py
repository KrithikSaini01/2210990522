"""Windows DPAPI helpers for machine-local secret storage."""
import ctypes
from ctypes import wintypes


crypt32 = ctypes.windll.crypt32
kernel32 = ctypes.windll.kernel32


class DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def _to_blob(data):
    buffer = ctypes.create_string_buffer(data)
    blob = DATA_BLOB(
        len(data),
        ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)),
    )
    return blob, buffer


def protect_bytes(data, description="OBSIDYN"):
    """Encrypt bytes using the current Windows user context."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("protect_bytes expects raw bytes")

    input_blob, input_buffer = _to_blob(bytes(data))
    output_blob = DATA_BLOB()

    if not crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        description,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()

    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        if output_blob.pbData:
            kernel32.LocalFree(output_blob.pbData)


def unprotect_bytes(data):
    """Decrypt bytes protected by the current Windows user context."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("unprotect_bytes expects raw bytes")

    input_blob, input_buffer = _to_blob(bytes(data))
    output_blob = DATA_BLOB()

    if not crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()

    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        if output_blob.pbData:
            kernel32.LocalFree(output_blob.pbData)
