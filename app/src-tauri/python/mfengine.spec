# -*- mode: python ; coding: utf-8 -*-
# mfengine.spec — PyInstaller spec for the Mermaid Forge sidecar.
#
# Excludes Pillow and numpy (and the Intel MKL stack numpy drags in)
# because Mermaid Forge never adds images to slides and never executes
# numpy. python-pptx imports PIL at module load time only; cli.py
# installs a sys.modules stub before importing pptx so those imports
# resolve to no-op stubs.
#
# If you ever add image features or numerical work to the engine, both
# the PIL stub in cli.py AND these exclusions must come out, and the
# bundle size budget must be revisited.


a = Analysis(
    ['cli.py'],
    pathex=[],
    binaries=[],
    # Bundle the VSDX template next to the frozen exe so the engine can
    # find it via sys._MEIPASS at runtime.
    datas=[('template_manual_ref.vsdx', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Pillow + native imaging machinery
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        'PIL.ImageFile',
        'PIL._imaging',
        'PIL._imagingft',
        'Pillow',
        # numpy is only reachable via Pillow; nothing in our code paths uses it
        'numpy',
        'numpy.core',
        # Intel MKL ships transitively with miniconda's numpy
        'mkl',
        'mkl_service',
        # scipy: confirmed unused at runtime (zero modules loaded by full
        # export); defense-in-depth in case PyInstaller's analyzer reaches it
        'scipy',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='mfengine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
