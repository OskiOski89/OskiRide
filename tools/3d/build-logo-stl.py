"""Trace the approved raster logo into closed, millimetre-scale print meshes.

Run with Python and packages from requirements-logo-stl.txt. The local optional
package directory tools/3d/.cache/logo-stl-python is detected automatically.
The original PNG is read only and never altered.
"""

from pathlib import Path
import argparse
import importlib.metadata
import json
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent.parent
sys.path.insert(0, str(TOOLS / '.cache' / 'logo-stl-python'))

import cv2
import numpy as np
import trimesh
from PIL import Image
from shapely import affinity, make_valid, union_all
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.geometry.polygon import orient


def polygons(geometry):
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon) or hasattr(geometry, 'geoms'):
        return [piece for child in geometry.geoms for piece in polygons(child)]
    return []


def trace(mask):
    # Ignore tiny raster dust while retaining letter counters and i dots.
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        raise ValueError('Empty logo colour mask')
    found = []
    for index, contour in enumerate(contours):
        if hierarchy[0][index][3] != -1 or abs(cv2.contourArea(contour)) < 30:
            continue
        outer = cv2.approxPolyDP(contour, 0.45, True).reshape(-1, 2)
        if len(outer) < 3:
            continue
        holes = []
        child = hierarchy[0][index][2]
        while child != -1:
            if abs(cv2.contourArea(contours[child])) >= 30:
                hole = cv2.approxPolyDP(contours[child], 0.45, True).reshape(-1, 2)
                if len(hole) >= 3:
                    holes.append(hole)
            child = hierarchy[0][child][0]
        found.extend(polygons(make_valid(Polygon(outer, holes))))
    return union_all(found)


def extrude(geometry, height, z=0):
    pieces = []
    for polygon in polygons(geometry):
        mesh = trimesh.creation.extrude_polygon(orient(polygon), height, engine='earcut')
        mesh.apply_translation([0, 0, z])
        pieces.append(mesh)
    return trimesh.util.concatenate(pieces)


def component_count(mesh):
    # Count components without optional graph/scipy dependencies.
    parents = list(range(len(mesh.vertices)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for a, b in mesh.edges_unique:
        a, b = find(int(a)), find(int(b))
        if a != b:
            parents[b] = a
    return len({find(index) for index in range(len(parents))})


def inspect(mesh):
    edges = np.bincount(mesh.edges_unique_inverse)
    report = {
        'triangles': int(len(mesh.faces)),
        'vertices': int(len(mesh.vertices)),
        'watertight': bool(mesh.is_watertight),
        'consistent_winding': bool(mesh.is_winding_consistent),
        'positive_volume': bool(mesh.volume > 0),
        'volume_mm3': round(float(mesh.volume), 3),
        'boundary_edges': int(np.count_nonzero(edges == 1)),
        'nonmanifold_edges': int(np.count_nonzero(edges > 2)),
        'connected_components': component_count(mesh),
        'bounds_mm': np.round(mesh.bounds, 5).tolist(),
        'size_mm': np.round(mesh.extents, 5).tolist(),
    }
    assert report['watertight'] and report['consistent_winding'] and report['positive_volume'], report
    assert report['boundary_edges'] == 0 and report['nonmanifold_edges'] == 0, report
    assert np.isfinite(mesh.vertices).all(), 'Non-finite coordinates'
    return report


def write_3mf(path, parts, width):
    # Core 3MF materials provide reference colours, not slicer-specific filaments.
    core = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
    ET.register_namespace('', core)

    def element(parent, tag, attributes=None):
        return ET.SubElement(parent, '{' + core + '}' + tag, attributes or {})

    model = ET.Element('{' + core + '}model', {'unit': 'millimeter', '{http://www.w3.org/XML/1998/namespace}lang': 'pl-PL'})
    element(model, 'metadata', {'name': 'Title'}).text = 'OskiRide — Słońce i las'
    resources = element(model, 'resources')
    materials = element(resources, 'basematerials', {'id': '1'})
    for _, _, name, colour in parts:
        element(materials, 'base', {'name': name, 'displaycolor': colour + 'FF'})
    for index, (_, mesh, name, _) in enumerate(parts):
        obj = element(resources, 'object', {'id': str(index + 2), 'type': 'model', 'name': name, 'pid': '1', 'pindex': str(index)})
        body = element(obj, 'mesh')
        vertices = element(body, 'vertices')
        for x, y, z in mesh.vertices:
            element(vertices, 'vertex', {'x': f'{x:.6f}', 'y': f'{y:.6f}', 'z': f'{z:.6f}'})
        triangles = element(body, 'triangles')
        for a, b, c in mesh.faces:
            element(triangles, 'triangle', {'v1': str(a), 'v2': str(b), 'v3': str(c)})
    assembly = element(resources, 'object', {'id': '5', 'type': 'model', 'name': f'OskiRide logo {width:g} mm'})
    components = element(assembly, 'components')
    for index in range(len(parts)):
        element(components, 'component', {'objectid': str(index + 2)})
    element(element(model, 'build'), 'item', {'objectid': '5'})
    with ZipFile(path, 'w', compression=ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>')
        archive.writestr('3D/3dmodel.model', ET.tostring(model, encoding='utf-8', xml_declaration=True))


def svg_path(geometry):
    commands = []
    for polygon in polygons(geometry):
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = list(ring.coords)
            commands.append(f'M{coords[0][0]:.4f},{coords[0][1]:.4f}' + ''.join(f'L{x:.4f},{y:.4f}' for x, y in coords[1:]) + 'Z')
    return ''.join(commands)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--width', type=float, default=160.0, help='Total plaque width in mm')
    parser.add_argument('--base-height', type=float, default=2.0)
    parser.add_argument('--relief', type=float, default=1.6)
    parser.add_argument('--margin', type=float, default=3.0)
    parser.add_argument('--upright', action='store_true', help='Stand the logo vertically on its bottom edge, Z up')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/logo-print')
    args = parser.parse_args()
    assert args.width > 2 * args.margin > 0
    assert args.base_height > 0 and args.relief > 0
    args.output.mkdir(parents=True, exist_ok=True)

    image = np.asarray(Image.open(ROOT / 'grafika/marka-oskiride/oskiride-logo.png').convert('RGBA'))
    visible = image[:, :, 3] >= 180
    rgb = image[:, :, :3].astype(np.float32)
    yellow_distance = ((rgb - [242, 201, 76]) ** 2).sum(axis=2)
    green_distance = ((rgb - [35, 76, 59]) ** 2).sum(axis=2)
    yellow = trace((visible & (yellow_distance < green_distance)).astype(np.uint8) * 255)
    wordmark = trace((visible & (green_distance <= yellow_distance)).astype(np.uint8) * 255)
    min_x, min_y, max_x, max_y = union_all([yellow, wordmark]).bounds
    scale = (args.width - 2 * args.margin) / (max_x - min_x)
    centre = ((min_x + max_x) / 2, (min_y + max_y) / 2)

    def to_mm(geometry):
        centred = affinity.translate(geometry, xoff=-centre[0], yoff=-centre[1])
        scaled = affinity.scale(centred, xfact=scale, yfact=-scale, origin=(0, 0))
        return scaled.simplify(0.035, preserve_topology=True)

    yellow, wordmark = to_mm(yellow), to_mm(wordmark)
    logo_height = (max_y - min_y) * scale
    plaque_height = logo_height + args.margin * 2
    radius = min(3.0, plaque_height / 4)
    base_polygon = box(-args.width / 2 + radius, -plaque_height / 2 + radius, args.width / 2 - radius, plaque_height / 2 - radius).buffer(radius, quad_segs=24)
    parts = [
        ('oskiride-podstawa.stl', extrude(base_polygon, args.base_height), 'Podstawa — krem', '#FBF5EA'),
        ('oskiride-znak-OR.stl', extrude(yellow, args.relief, args.base_height), 'Znak OR — żółty', '#F2C94C'),
        ('oskiride-napis.stl', extrude(wordmark, args.relief, args.base_height), 'Napis — leśna zieleń', '#234C3B'),
    ]
    total_depth = args.base_height + args.relief
    if args.upright:
        # Original XY artwork becomes the vertical XZ face. Its front points
        # towards -Y; the flat bottom edge sits exactly at Z=0.
        transform = np.array([
            [1, 0, 0, 0],
            [0, 0, -1, total_depth / 2],
            [0, 1, 0, plaque_height / 2],
            [0, 0, 0, 1],
        ], dtype=float)
        for _, mesh, _, _ in parts:
            mesh.apply_transform(transform)
    report = {'units': 'mm', 'orientation': 'upright' if args.upright else 'flat',
              'width_mm': args.width, 'base_height_mm': args.base_height,
              'relief_height_mm': args.relief, 'total_depth_mm': total_depth, 'parts': {}}
    for filename, mesh, name, colour in parts:
        mesh.export(args.output / filename)
        reloaded = trimesh.load_mesh(args.output / filename, process=True)
        report['parts'][filename] = {**inspect(reloaded), 'name': name, 'reference_colour': colour}

    combined = trimesh.boolean.union([mesh for _, mesh, _, _ in parts], engine='manifold', check_volume=True)
    suffix = f'-pionowe-{total_depth:g}mm' if args.upright else ''
    combined_path = args.output / f'oskiride-logo-{args.width:g}mm{suffix}.stl'
    combined.export(combined_path)
    reloaded = trimesh.load_mesh(combined_path, process=True)
    report['combined'] = inspect(reloaded)
    assert report['combined']['connected_components'] == 1, 'Combined print must be one connected solid'
    assert abs(reloaded.extents[0] - args.width) < 0.001
    depth_axis = 1 if args.upright else 2
    assert abs(reloaded.extents[depth_axis] - total_depth) < 0.001
    assert abs(reloaded.bounds[0, 2]) < 0.001, 'Model must rest on Z=0'
    if args.upright:
        assert abs(reloaded.extents[2] - plaque_height) < 0.001
    expected_volume = sum(mesh.volume for _, mesh, _, _ in parts)
    assert abs(reloaded.volume - expected_volume) < expected_volume * 0.0001

    write_3mf(args.output / 'oskiride-logo-kolory.3mf', parts, args.width)
    with ZipFile(args.output / 'oskiride-logo-kolory.3mf') as archive:
        assert archive.testzip() is None
        ET.fromstring(archive.read('3D/3dmodel.model'))

    width = args.width - 2 * args.margin
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.4f}mm" height="{logo_height:.4f}mm" viewBox="{-width/2:.4f} {-logo_height/2:.4f} {width:.4f} {logo_height:.4f}"><g transform="scale(1,-1)" fill-rule="evenodd"><path fill="#F2C94C" d="{svg_path(yellow)}"/><path fill="#234C3B" d="{svg_path(wordmark)}"/></g></svg>'
    (args.output / 'oskiride-logo-wektor.svg').write_text(svg, encoding='utf-8')
    report['packages'] = {name: importlib.metadata.version(name) for name in ['opencv-python-headless', 'shapely', 'trimesh', 'mapbox-earcut', 'manifold3d', 'numpy']}
    (args.output / 'walidacja.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
