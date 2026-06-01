# Mermaid Forge

Turn Mermaid diagrams into **editable** PowerPoint and Visio files.

Most Mermaid tools export your diagram as a flat PNG or SVG — you paste
it into PowerPoint and you can't change anything without going back to
the source. Mermaid Forge generates real, native shapes. Open the
`.pptx` in PowerPoint or the `.vsdx` in Visio and every box, diamond,
and arrow is a normal object you can move, restyle, or edit like
anything else.

## What it does

- **Live preview editor** — write Mermaid on the left, see the diagram
  render on the right as you type.
- **Native PowerPoint export** — flowcharts come out as editable shapes,
  not embedded images.
- **Native Visio export** — same idea, written against a Visio shape
  template so it opens cleanly in Visio.
- **PNG and SVG export** — for the diagram types where native export
  isn't supported, you can still export an image.
- **28 starter templates** across 6 categories so you don't have to
  start from a blank editor.
- **Multiple windows** — open as many diagrams as you want side by side.
- **Light and dark themes** for the preview pane.
- **Resizable split** between the code pane and the diagram pane.
- **Offline** — Mermaid is bundled locally, no network calls.
- **Native Windows menus and shortcuts** — Open (Ctrl+O), Save (Ctrl+S),
  Save As (Ctrl+Shift+S), New window (Ctrl+N).

## Supported diagrams

All Mermaid v11 diagram types render in the preview pane. The category
breakdown in the template sidebar:

| Category | Templates |
|---|---|
| Flow & Process | Basic flowchart, ELK flowchart, decision tree, cyclic process, block diagram, git graph |
| UML | Sequence, class, state, requirement |
| C4 Architecture | Context, container, component, deployment, dynamic |
| Data Visualization | ER, pie, quadrant, radar, sankey, XY chart |
| Planning & Time | Gantt, journey, kanban, timeline |
| Specialized | Architecture, mindmap, packet |

## Install

There are no prebuilt releases yet — for now, build from source. See
[BUILDING.md](BUILDING.md) for prerequisites and step-by-step build
instructions. The output is a standard Windows `.msi` installer.

## Using the app

1. Pick a template from the left sidebar, or start typing Mermaid into
   the code pane.
2. Watch the preview render on the right.
3. **File → Open** (`Ctrl+O`) loads a `.mmd` source file.
   **File → Save** (`Ctrl+S`) writes it back.
4. **Export → PowerPoint (.pptx)** for editable PowerPoint shapes (flowcharts).
   **Export → Visio (.vsdx)** for editable Visio shapes (acyclic flowcharts).
   **Export → PNG** or **Export → SVG** for any diagram type.
5. **File → New** (`Ctrl+N`) opens a second window so you can work on
   multiple diagrams at once.

## Known limitations

- **Native PowerPoint and Visio export only support flowchart-family
  diagrams.** Sequence, class, ER, Gantt, mindmap, etc. render in the
  preview but the PPTX/VSDX export buttons are disabled for them — use
  the PNG or SVG export instead.
- **Visio export does not support cyclic diagrams.** Mermaid Forge
  detects the cycle before invoking the export and shows a clear
  message. PowerPoint export handles cycles fine.
- **Windows 11 only.** macOS and Linux builds are not provided.

## Tech stack

- [Tauri 2.x](https://tauri.app/) for the desktop shell (Rust + WebView2).
- [Mermaid.js v11](https://mermaid.js.org/) for diagram rendering, bundled
  locally (no CDN).
- Python sidecar built with PyInstaller for the PPTX and VSDX engines
  (`python-pptx` plus a custom VSDX shape-XML generator).

## Building from source

See [BUILDING.md](BUILDING.md).

## License

[MIT](LICENSE) © 2026 Ardhivipala.
