"""PyInstaller runtime hook for OBSIDYN engine.

Runs inside the frozen exe before any user code.
Ensures sys._MEIPASS is in sys.path so that internal packages
(core, auth, utils, etc.) are importable as top-level modules.
"""
import sys
import os

if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    _meipass = sys._MEIPASS  # noqa: SLF001
    # Insert at position 0 so our bundled modules take priority
    if _meipass not in sys.path:
        sys.path.insert(0, _meipass)

    # Also set OBSIDYN_DATA_DIR if not already set by the Electron wrapper
    # This lets the engine find user config in %APPDATA%\OBSIDYN\
    if 'OBSIDYN_DATA_DIR' not in os.environ:
        _appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        os.environ['OBSIDYN_DATA_DIR'] = os.path.join(_appdata, 'OBSIDYN')
