"""
Mermaid to VSDX generator - v8, FULL INHERITANCE SERIALIZATION.

Critical finding from diffing my v7 output vs user's manual Visio file:
Visio's own file writer includes ALL inherited cells/sections explicitly
with F='Inh' and cached V= values, not just overrides. Missing these
causes rendering artifacts on initial load ("messy, nudge to fix" symptom).

Changes from v7:
- Rectangle instances now include:
  * 6 Txt* cells (TxtPinX, TxtPinY, TxtWidth, TxtHeight, TxtLocPinX, TxtLocPinY)
  * Section N='Actions' (SetDefaultSize, ResizeWithText)
  * Section N='Connection' (all 4 connection points)
  * Section N='Geometry' IX='0' (5 rectangle geometry rows)
- Diamond (Decision) instances similar with decision-specific geometry
- Connector instances include 7 Txt* cells (including TxtAngle=0)
- Second instance of same master gets NameU='Process.2' etc
"""
import zipfile, shutil, re, os
from collections import defaultdict

# Default template path: alongside this module. The sidecar (cli.py)
# rebinds this at runtime to the PyInstaller-bundled copy.
TEMPLATE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'template_manual_ref.vsdx',
)

MASTER_PROCESS = 2
MASTER_DYNAMIC_CONNECTOR = 4
MASTER_DECISION = 5


def parse_mermaid(code):
    nodes = {}
    node_shapes = {}
    edges = []
    node_pattern = re.compile(
        r'([A-Za-z_][A-Za-z0-9_]*)\s*'
        r'(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})'
    )
    lines = [l.strip() for l in code.strip().split('\n')]
    lines = [l for l in lines if l and not l.startswith('%%')
             and not l.startswith('graph') and not l.startswith('flowchart')
             and not l.startswith('subgraph') and not l.startswith('direction')
             and l != 'end']
    for line in lines:
        for m in node_pattern.finditer(line):
            nid = m.group(1)
            if m.group(2) is not None:
                nodes[nid] = m.group(2); node_shapes[nid] = 'rect'
            elif m.group(3) is not None:
                nodes[nid] = m.group(3); node_shapes[nid] = 'round'
            elif m.group(4) is not None:
                nodes[nid] = m.group(4); node_shapes[nid] = 'rhombus'
    edge_re = re.compile(
        r'([A-Za-z_][A-Za-z0-9_]*)\s*-->\s*'
        r'(?:\|([^|]*)\|\s*)?'
        r'([A-Za-z_][A-Za-z0-9_]*)'
    )
    for line in lines:
        stripped = re.sub(r'\[[^\]]+\]|\([^)]+\)|\{[^}]+\}', '', line)
        pos = 0
        while True:
            m = edge_re.search(stripped, pos)
            if not m: break
            src, lbl, dst = m.group(1), m.group(2) or '', m.group(3)
            if src not in nodes:
                nodes[src] = src; node_shapes[src] = 'rect'
            if dst not in nodes:
                nodes[dst] = dst; node_shapes[dst] = 'rect'
            edges.append((src, dst, lbl))
            arrow = re.search(r'-->', stripped[m.end(1):])
            if arrow: pos = m.end(1) + arrow.end()
            else: break
    return nodes, edges, node_shapes


def compute_layout(nodes, edges, page_w=8.5, page_h=11.0):
    incoming = defaultdict(set)
    for s, d, _ in edges:
        incoming[d].add(s)
    roots = [n for n in nodes if not incoming[n]]
    if not roots: roots = [list(nodes.keys())[0]]
    level = {r: 0 for r in roots}
    for _ in range(len(nodes) + 5):
        updated = False
        for s, d, _ in edges:
            nl = level.get(s, 0) + 1
            if d not in level or level[d] < nl:
                level[d] = nl
                updated = True
        if not updated: break
    levels = defaultdict(list)
    order = {n: i for i, n in enumerate(nodes.keys())}
    for n in nodes:
        levels[level.get(n, 0)].append(n)
    for lvl in levels:
        levels[lvl].sort(key=lambda n: order[n])
    shape_w, shape_h = 1.6, 0.55
    v_gap, h_gap = 1.1, 0.5
    max_level = max(levels.keys()) if levels else 0
    total_h = (max_level + 1) * shape_h + max_level * v_gap
    top_margin = (page_h + total_h) / 2
    positions = {}
    for lvl, nl in sorted(levels.items()):
        row_top_y = top_margin - lvl * (shape_h + v_gap)
        center_y = row_top_y - shape_h / 2
        total_w = len(nl) * shape_w + (len(nl) - 1) * h_gap
        start_x = (page_w - total_w) / 2
        for i, n in enumerate(nl):
            center_x = start_x + i * (shape_w + h_gap) + shape_w / 2
            positions[n] = (center_x, center_y, shape_w, shape_h)
    return positions


def _escape(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _conn_point_index(shape_kind, direction):
    if shape_kind == 'rhombus':
        return {'bottom': 4, 'top': 3, 'left': 1, 'right': 2}[direction]
    return {'bottom': 3, 'top': 4, 'left': 1, 'right': 2}[direction]


def node_shape_xml(sid, shape_kind, cx, cy, w, h, text, instance_number):
    """Full Visio-style rectangle/diamond instance with all inherited cells explicit.
    
    Mirrors Visio's own serialization: lists all inherited cells with F='Inh'
    and cached V= values. This avoids initial-render artifacts.
    """
    if shape_kind == 'rhombus':
        master_id = MASTER_DECISION
        name = 'Decision'
        # Decision master connection points (per user's master3.xml):
        # IX=0: left (X=0, Y=H/2)
        # IX=1: right (X=W, Y=H/2)
        # IX=2: top (X=W/2, Y=H)
        # IX=3: bottom (X=W/2, Y=0)
        conn_rows = f'''<Row T='Connection' IX='0'><Cell N='X' V='0' F='Inh'/><Cell N='Y' V='{h/2}' F='Inh'/></Row>
<Row T='Connection' IX='1'><Cell N='X' V='{w}' F='Inh'/><Cell N='Y' V='{h/2}' F='Inh'/></Row>
<Row T='Connection' IX='2'><Cell N='X' V='{w/2}' F='Inh'/><Cell N='Y' V='{h}' F='Inh'/></Row>
<Row T='Connection' IX='3'><Cell N='X' V='{w/2}' F='Inh'/><Cell N='Y' V='0' F='Inh'/></Row>'''
        # Decision geometry: diamond path (4 points + close)
        geom_rows = f'''<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Inh'/><Cell N='Y' V='{h/2}' F='Inh'/></Row>
<Row T='LineTo' IX='2'><Cell N='X' V='{w/2}' F='Inh'/><Cell N='Y' V='{h}' F='Inh'/></Row>
<Row T='LineTo' IX='3'><Cell N='X' V='{w}' F='Inh'/><Cell N='Y' V='{h/2}' F='Inh'/></Row>
<Row T='LineTo' IX='4'><Cell N='X' V='{w/2}' F='Inh'/><Cell N='Y' V='0' F='Inh'/></Row>
<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Inh'/><Cell N='Y' V='{h/2}' F='Inh'/></Row>'''
    else:
        master_id = MASTER_PROCESS
        name = 'Process'
        # Process master connection points:
        # IX=0: left (X=0, Y=H/2)
        # IX=1: right (X=W, Y=H/2)
        # IX=2: bottom (X=W/2, Y=0)
        # IX=3: top (X=W/2, Y=H)
        conn_rows = f'''<Row T='Connection' IX='0'><Cell N='Y' V='{h/2}' F='Inh'/></Row>
<Row T='Connection' IX='1'><Cell N='X' V='{w}' F='Inh'/><Cell N='Y' V='{h/2}' F='Inh'/></Row>
<Row T='Connection' IX='2'><Cell N='X' V='{w/2}' F='Inh'/></Row>
<Row T='Connection' IX='3'><Cell N='X' V='{w/2}' F='Inh'/><Cell N='Y' V='{h}' F='Inh'/></Row>'''
        # Process geometry: rectangle (5 lines for closed path)
        geom_rows = f'''<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Inh'/><Cell N='Y' V='0' F='Inh'/></Row>
<Row T='LineTo' IX='2'><Cell N='X' V='{w}' F='Inh'/><Cell N='Y' V='0' F='Inh'/></Row>
<Row T='LineTo' IX='3'><Cell N='X' V='{w}' F='Inh'/><Cell N='Y' V='{h}' F='Inh'/></Row>
<Row T='LineTo' IX='4'><Cell N='X' V='0' F='Inh'/><Cell N='Y' V='{h}' F='Inh'/></Row>
<Row T='LineTo' IX='5'><Cell N='X' V='0' F='Inh'/><Cell N='Y' V='0' F='Inh'/></Row>'''
    
    # Auto-numbered name: first instance is "Process", subsequent "Process.2", ".3", etc.
    if instance_number == 1:
        name_u = name
    else:
        name_u = f'{name}.{instance_number}'
    
    t = _escape(text)
    
    return f'''<Shape ID='{sid}' NameU='{name_u}' Name='{name_u}' Type='Shape' Master='{master_id}'>
<Cell N='PinX' V='{cx}'/>
<Cell N='PinY' V='{cy}'/>
<Cell N='Width' V='{w}'/>
<Cell N='Height' V='{h}'/>
<Cell N='LocPinX' V='{w/2}' F='Inh'/>
<Cell N='LocPinY' V='{h/2}' F='Inh'/>
<Cell N='LayerMember' V=''/>
<Cell N='FillForegnd' V='#dbeafe'/>
<Cell N='LineWeight' V='0.013'/>
<Cell N='LineColor' V='#2563eb'/>
<Cell N='TxtPinX' V='{w/2}' F='Inh'/>
<Cell N='TxtPinY' V='{h/2}' F='Inh'/>
<Cell N='TxtWidth' V='{w}' F='Inh'/>
<Cell N='TxtHeight' V='{h}' F='Inh'/>
<Cell N='TxtLocPinX' V='{w/2}' F='Inh'/>
<Cell N='TxtLocPinY' V='{h/2}' F='Inh'/>
<Section N='Actions'>
<Row N='SetDefaultSize'><Cell N='Invisible' V='0' F='Inh'/></Row>
<Row N='ResizeWithText'><Cell N='Invisible' V='0' F='Inh'/></Row>
</Section>
<Section N='Connection'>
{conn_rows}
</Section>
<Section N='Geometry' IX='0'>
{geom_rows}
</Section>
<Text>{t}</Text>
</Shape>'''


def connector_shape_xml(sid, src_id, dst_id, src_kind, dst_kind, src_pos, dst_pos, label=''):
    """Connector with full Txt* inheritance serialization.
    
    For simple vertical connectors: Master=none (fully explicit, matching user's manual)
    For diagonal: will add this later - keeping simple for now to match test case
    """
    scx, scy, sw, sh = src_pos
    dcx, dcy, dw, dh = dst_pos
    src_cp = _conn_point_index(src_kind, 'bottom')
    dst_cp = _conn_point_index(dst_kind, 'top')
    
    bx_v = scx
    by_v = scy - sh / 2
    ex_v = dcx
    ey_v = dcy + dh / 2
    is_vertical = abs(ex_v - bx_v) < 0.01
    height_v = ey_v - by_v
    
    t = _escape(label)
    text_elem = f'<Text>{t}</Text>' if label else ''
    
    if is_vertical:
        width_v = 0.25
        pinx_v = bx_v
        piny_v = (by_v + ey_v) / 2
        locpinx_v = 0.125
        locpiny_v = height_v / 2
        
        # Text positioned slightly offset from midpoint so it's visible beside the line
        # Matches user's manual: TxtPinY = LocPinY + 0.1 (slightly toward Begin)
        txt_pin_x = locpinx_v
        txt_pin_y = locpiny_v + 0.1  # 0.1 inches above midpoint
        
        return f'''<Shape ID='{sid}' Type='Shape' LineStyle='0' FillStyle='0' TextStyle='0'>
<Cell N='PinX' V='{pinx_v}' F='GUARD((BeginX+EndX)/2)'/>
<Cell N='PinY' V='{piny_v}' F='GUARD((BeginY+EndY)/2)'/>
<Cell N='Width' V='{width_v}' F='GUARD(0.25DL)'/>
<Cell N='Height' V='{height_v}' F='GUARD(EndY-BeginY)'/>
<Cell N='LocPinX' V='{locpinx_v}' F='GUARD(Width*0.5)'/>
<Cell N='LocPinY' V='{locpiny_v}' F='GUARD(Height*0.5)'/>
<Cell N='Angle' V='0' F='GUARD(0DA)'/>
<Cell N='FlipX' V='0' F='GUARD(FALSE)'/>
<Cell N='FlipY' V='0' F='GUARD(FALSE)'/>
<Cell N='ResizeMode' V='0'/>
<Cell N='BeginX' V='{bx_v}' F='PAR(PNT(Sheet.{src_id}!Connections.X{src_cp},Sheet.{src_id}!Connections.Y{src_cp}))'/>
<Cell N='BeginY' V='{by_v}' F='PAR(PNT(Sheet.{src_id}!Connections.X{src_cp},Sheet.{src_id}!Connections.Y{src_cp}))'/>
<Cell N='EndX' V='{ex_v}' F='PAR(PNT(Sheet.{dst_id}!Connections.X{dst_cp},Sheet.{dst_id}!Connections.Y{dst_cp}))'/>
<Cell N='EndY' V='{ey_v}' F='PAR(PNT(Sheet.{dst_id}!Connections.X{dst_cp},Sheet.{dst_id}!Connections.Y{dst_cp}))'/>
<Cell N='NoAlignBox' V='1'/>
<Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.{src_id}!EventXFMod)'/>
<Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.{dst_id}!EventXFMod)'/>
<Cell N='ObjType' V='2'/>
<Cell N='LineWeight' V='0.013'/>
<Cell N='LineColor' V='#475569'/>
<Cell N='EndArrow' V='4'/>
<Cell N='TxtPinX' V='{txt_pin_x}'/>
<Cell N='TxtPinY' V='{txt_pin_y}'/>
<Cell N='TxtWidth' V='{width_v}' F='Width*1'/>
<Cell N='TxtHeight' V='{height_v}' F='Height*1'/>
<Cell N='TxtLocPinX' V='{locpinx_v}' F='TxtWidth*0.5'/>
<Cell N='TxtLocPinY' V='{locpiny_v}' F='TxtHeight*0.5'/>
<Cell N='TxtAngle' V='0'/>
<Section N='Geometry' IX='0'>
<Cell N='NoFill' V='1'/>
<Cell N='NoLine' V='0'/>
<Cell N='NoShow' V='0'/>
<Cell N='NoSnap' V='0'/>
<Cell N='NoQuickDrag' V='0'/>
<Row T='MoveTo' IX='1'><Cell N='X' V='{locpinx_v}'/><Cell N='Y' V='0'/></Row>
<Row T='LineTo' IX='2'><Cell N='X' V='{locpinx_v}'/><Cell N='Y' V='{height_v}'/></Row>
</Section>
{text_elem}
</Shape>'''
    
    else:
        # Diagonal connector with elbow routing
        width_v = ex_v - bx_v
        pinx_v = (bx_v + ex_v) / 2
        locpinx_v = width_v / 2
        piny_v = (by_v + ey_v) / 2
        locpiny_v = height_v / 2
        half_h = height_v / 2
        
        geom = f'''<Row T='LineTo' IX='2'><Cell N='X' V='0'/><Cell N='Y' V='{half_h}' F='Height*0.5'/></Row>
<Row T='LineTo' IX='3'><Cell N='X' V='{width_v}' F='Width'/><Cell N='Y' V='{half_h}' F='Height*0.5'/></Row>
<Row T='LineTo' IX='4'><Cell N='X' V='{width_v}' F='Width'/><Cell N='Y' V='{height_v}' F='Height'/></Row>'''
        
        # === TEXT POSITIONING for diagonal connectors ===
        # Critical fix: use POSITIVE STATIC TxtWidth/TxtHeight instead of inheriting
        # F='Width*1' pattern. Width is SIGNED — for leftward connectors (C→D),
        # Width=-1.05 which would make TxtWidth negative → text box inverts →
        # renders vertically (one char per line).
        #
        # TxtPinX/TxtPinY are placed at LocPin (signed) so text lands at page midpoint.
        # Different LocPin per connector means C→D and C→E text at different positions.
        if label:
            # Positive static dimensions — no inversion, no vertical-text bug
            txt_width = 0.5      # wide enough for "Yes"/"No" on one line
            txt_height = 0.2     # one line of text
            txt_locpinx = 0.25   # TxtWidth * 0.5
            txt_locpiny = 0.1    # TxtHeight * 0.5
            # TxtPin = LocPin places text at shape midpoint (Pin in page coords)
            # Signed values OK here — negative X is fine for the PIN location,
            # the text box itself has positive width (txt_width=0.5)
            txt_pinx = locpinx_v
            txt_piny = locpiny_v
            
            txt_cells = f'''<Cell N='TxtPinX' V='{txt_pinx}'/>
<Cell N='TxtPinY' V='{txt_piny}'/>
<Cell N='TxtWidth' V='{txt_width}'/>
<Cell N='TxtHeight' V='{txt_height}'/>
<Cell N='TxtLocPinX' V='{txt_locpinx}' F='TxtWidth*0.5'/>
<Cell N='TxtLocPinY' V='{txt_locpiny}' F='TxtHeight*0.5'/>
<Cell N='TxtAngle' V='0'/>'''
        else:
            txt_cells = ''
        
        return f'''<Shape ID='{sid}' Type='Shape' Master='{MASTER_DYNAMIC_CONNECTOR}'>
<Cell N='PinX' V='{pinx_v}' F='Inh'/>
<Cell N='PinY' V='{piny_v}' F='Inh'/>
<Cell N='Width' V='{width_v}' F='GUARD(EndX-BeginX)'/>
<Cell N='Height' V='{height_v}' F='GUARD(EndY-BeginY)'/>
<Cell N='LocPinX' V='{locpinx_v}' F='Inh'/>
<Cell N='LocPinY' V='{locpiny_v}' F='Inh'/>
<Cell N='BeginX' V='{bx_v}' F='PAR(PNT(Sheet.{src_id}!Connections.X{src_cp},Sheet.{src_id}!Connections.Y{src_cp}))'/>
<Cell N='BeginY' V='{by_v}' F='PAR(PNT(Sheet.{src_id}!Connections.X{src_cp},Sheet.{src_id}!Connections.Y{src_cp}))'/>
<Cell N='EndX' V='{ex_v}' F='PAR(PNT(Sheet.{dst_id}!Connections.X{dst_cp},Sheet.{dst_id}!Connections.Y{dst_cp}))'/>
<Cell N='EndY' V='{ey_v}' F='PAR(PNT(Sheet.{dst_id}!Connections.X{dst_cp},Sheet.{dst_id}!Connections.Y{dst_cp}))'/>
<Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.{src_id}!EventXFMod)'/>
<Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.{dst_id}!EventXFMod)'/>
<Cell N='LineColor' V='#475569'/>
<Cell N='LineWeight' V='0.013'/>
{txt_cells}
<Section N='Geometry' IX='0'>
<Cell N='NoFill' V='1' F='Inh'/>
<Cell N='NoLine' V='0' F='Inh'/>
<Cell N='NoShow' V='0' F='Inh'/>
<Cell N='NoSnap' V='0' F='Inh'/>
<Cell N='NoQuickDrag' V='0' F='Inh'/>
{geom}
</Section>
{text_elem}
</Shape>'''


def connect_link_xml(connector_id, src_id, dst_id, src_kind, dst_kind):
    src_cp = _conn_point_index(src_kind, 'bottom')
    dst_cp = _conn_point_index(dst_kind, 'top')
    return (
        f"<Connect FromSheet='{connector_id}' FromCell='EndX' FromPart='12' "
        f"ToSheet='{dst_id}' ToCell='Connections.X{dst_cp}' ToPart='{99 + dst_cp}'/>"
        f"<Connect FromSheet='{connector_id}' FromCell='BeginX' FromPart='9' "
        f"ToSheet='{src_id}' ToCell='Connections.X{src_cp}' ToPart='{99 + src_cp}'/>"
    )


def generate_vsdx(mermaid_code, output_path):
    nodes, edges, node_shapes = parse_mermaid(mermaid_code)
    positions = compute_layout(nodes, edges)
    shape_xmls = []
    connect_xmls = []
    node_id_map = {}
    next_id = 1
    
    # Track instance number per master type for auto-naming
    master_count = {'Process': 0, 'Decision': 0}
    
    for nid in nodes:
        node_id_map[nid] = next_id
        next_id += 1
    
    for nid in nodes:
        sid = node_id_map[nid]
        cx, cy, w, h = positions[nid]
        kind = node_shapes.get(nid, 'rect')
        mkey = 'Decision' if kind == 'rhombus' else 'Process'
        master_count[mkey] += 1
        shape_xmls.append(node_shape_xml(
            sid, kind, cx, cy, w, h, nodes[nid], master_count[mkey]
        ))
    
    for src, dst, lbl in edges:
        sid = next_id
        src_kind = node_shapes.get(src, 'rect')
        dst_kind = node_shapes.get(dst, 'rect')
        shape_xmls.append(connector_shape_xml(
            sid, node_id_map[src], node_id_map[dst],
            src_kind, dst_kind, positions[src], positions[dst], lbl
        ))
        connect_xmls.append(connect_link_xml(
            sid, node_id_map[src], node_id_map[dst], src_kind, dst_kind
        ))
        next_id += 1
    
    shapes_str = ''.join(shape_xmls)
    connects_str = ''.join(connect_xmls)
    connects_section = f'<Connects>{connects_str}</Connects>' if connects_str else ''
    
    page_xml = (
        "<?xml version='1.0' encoding='utf-8' ?>\r\n"
        "<PageContents xmlns='http://schemas.microsoft.com/office/visio/2012/main' "
        "xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' "
        "xml:space='preserve'>"
        f"<Shapes>{shapes_str}</Shapes>"
        f"{connects_section}"
        "</PageContents>"
    )
    
    tmp = output_path + '.tmp'
    with zipfile.ZipFile(TEMPLATE, 'r') as zin:
        with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.namelist():
                if item == 'visio/pages/page1.xml':
                    zout.writestr(item, page_xml)
                else:
                    zout.writestr(item, zin.read(item))
    shutil.move(tmp, output_path)
    
    return {
        'nodes': len(nodes),
        'edges': len(edges),
        'file_size': os.path.getsize(output_path)
    }


if __name__ == '__main__':
    # Test with the simple case first
    simple = """
    flowchart TD
        A[Box A] --> B[Box B]
    """
    result = generate_vsdx(simple, '/mnt/user-data/outputs/simple_v9.vsdx')
    print(f"Simple: {result['nodes']} nodes, {result['edges']} edges, {result['file_size']} bytes")
    
    # Also test full flowchart
    full = """
    flowchart TD
        A[Start Process] --> B[Validate Input]
        B --> C{Valid?}
        C -->|Yes| D[Process Data]
        C -->|No| E[Show Error]
        D --> F[Save Result]
        E --> G[End]
        F --> G
    """
    result = generate_vsdx(full, '/mnt/user-data/outputs/mermaid_to_visio_v9.vsdx')
    print(f"Full: {result['nodes']} nodes, {result['edges']} edges, {result['file_size']} bytes")
