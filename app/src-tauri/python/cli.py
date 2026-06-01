"""
cli.py — Mermaid Forge sidecar entry point.

Pillow exclusion stub: python-pptx imports PIL.Image unconditionally in
pptx/parts/image.py at module load time, but Mermaid Forge never adds
images to slides — only native shapes and text. We stub PIL in sys.modules
before importing pptx so PyInstaller can exclude Pillow entirely. numpy
is excluded transitively (only Pillow reached it).

If image features are ever needed, this stub must be removed and Pillow
(and numpy) restored as runtime dependencies.
"""
import sys
import types


def _install_pil_stub():
    """Make `from PIL import Image` and `from PIL import ImageFont` succeed
    with no-op stubs. python-pptx imports both at module load time
    (parts/image.py and text/layout.py respectively); neither is actually
    exercised by Mermaid Forge's diagram pipeline.
    """
    def _raise_disabled(name):
        def _stub(*args, **kwargs):
            raise RuntimeError(
                f'PIL/Pillow is intentionally excluded from the Mermaid Forge '
                f'sidecar bundle (call to PIL.{name} attempted). Image and text-'
                f'autofit features are not supported. If you see this error, '
                f'the engine is doing something it should not.'
            )
        return _stub

    _pil = types.ModuleType('PIL')
    _pil.__path__ = []  # mark as a package

    _pil_image = types.ModuleType('PIL.Image')
    _pil_image.open = _raise_disabled('Image.open')
    _pil_image.Image = type('Image', (), {})

    _pil_imagefont = types.ModuleType('PIL.ImageFont')
    _pil_imagefont.truetype = _raise_disabled('ImageFont.truetype')
    _pil_imagefont.ImageFont = type('ImageFont', (), {})

    sys.modules['PIL'] = _pil
    sys.modules['PIL.Image'] = _pil_image
    sys.modules['PIL.ImageFont'] = _pil_imagefont
    _pil.Image = _pil_image
    _pil.ImageFont = _pil_imagefont


_install_pil_stub()


# ============================================================
# Original cli.py content below this line
# ============================================================

import argparse
import os
import shutil


def _ensure_graphviz_on_path():
    if shutil.which("dot"):
        return
    candidates = [
        r"C:\Program Files\Graphviz\bin",
        r"C:\Program Files (x86)\Graphviz\bin",
    ]
    for d in candidates:
        if os.path.isfile(os.path.join(d, "dot.exe")):
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
            return
    sys.stderr.write(
        "ERROR: Graphviz 'dot' not found on PATH or in standard install dirs.\n"
    )
    sys.exit(2)


_ensure_graphviz_on_path()

from mermaid_to_pptx import generate_pptx


def _vsdx_template_path():
    """Find template_manual_ref.vsdx whether running from source or
    frozen by PyInstaller. PyInstaller unpacks data files under
    sys._MEIPASS; from source it sits next to this module."""
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, 'template_manual_ref.vsdx')


def _export_vsdx(mermaid_code, output_path):
    # Rebind the engine's TEMPLATE to the PyInstaller-bundled copy so it
    # resolves correctly inside the frozen exe.
    import mermaid_to_vsdx_generator as vsdx_mod
    vsdx_mod.TEMPLATE = _vsdx_template_path()
    result = vsdx_mod.generate_vsdx(mermaid_code, output_path)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Path to .mmd source file')
    parser.add_argument('--output', required=True, help='Output file path')
    parser.add_argument(
        '--format',
        choices=['pptx', 'vsdx'],
        default='pptx',
        help='Output format (default: pptx)',
    )
    parser.add_argument('--theme', default='clean')
    args = parser.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        mermaid_code = f.read()

    if args.format == 'pptx':
        generate_pptx(mermaid_code, args.output, theme=args.theme)
        print(f'OK {args.output}')
    elif args.format == 'vsdx':
        result = _export_vsdx(mermaid_code, args.output)
        print(
            f'OK {args.output} nodes={result["nodes"]} '
            f'edges={result["edges"]} size={result["file_size"]}'
        )


if __name__ == '__main__':
    main()
