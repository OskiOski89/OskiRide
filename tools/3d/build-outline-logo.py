"""Build freestanding 20 mm logo silhouettes on a low plinth, without backing."""
from pathlib import Path
import importlib.util
import json
import re
import shutil
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'output/logo-outline'
RUNTIME = ROOT / 'grafika/marka-oskiride/druk-3d/kontur-20mm'
VECTOR = ROOT / 'grafika/marka-oskiride/druk-3d/oskiride-logo-wektor.svg'
sys.path.insert(0, str(ROOT / 'tools/3d/.cache/logo-stl-python'))
import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Polygon, box

spec = importlib.util.spec_from_file_location('logo_builder', ROOT / 'tools/3d/build-logo-stl.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def parse_path(data):
    result = Polygon()
    ring = []
    for command, payload in re.findall(r'([MLZ])([^MLZ]*)', data):
        if command == 'M':
            ring = [tuple(map(float, payload.split(',')))]
        elif command == 'L':
            ring.append(tuple(map(float, payload.split(','))))
        else:
            result = result.symmetric_difference(Polygon(ring))
    return result


def upright(geometry, depth=20, y_back=10):
    mesh = builder.extrude(geometry, depth)
    mesh.apply_transform(np.array([[1,0,0,0],[0,0,-1,y_back],[0,1,0,0],[0,0,0,1]], float))
    return mesh


def support_between(dot, body):
    left = max(dot.bounds[0], body.bounds[0])
    right = min(dot.bounds[2], body.bounds[2])
    centre = (left + right) / 2
    # Rear-only bridge: the front still shows the separation above the i stem.
    return upright(box(centre-.7, body.bounds[3]-.7, centre+.7, dot.bounds[1]+.7), depth=3.0)


def build_variant(name, yellow, green, base_width):
    output = DEST / 'modele' / name
    output.mkdir(parents=True, exist_ok=True)
    plinth_height = 4.0
    base = trimesh.creation.box(extents=[base_width,20,plinth_height])
    base.apply_translation([0,0,plinth_height/2])
    mark = upright(yellow)
    parts = [('podstawa.stl',base,'Podstawka','#234C3B'),
             ('znak-OR.stl',mark,'Znak OR','#F2C94C')]
    supports = []
    if green is not None:
        word_pieces = builder.polygons(green)
        for dot in word_pieces:
            height = dot.bounds[3] - dot.bounds[1]
            if height >= 7 or dot.bounds[1] < 10:
                continue
            candidates = [body for body in word_pieces if body is not dot
                and body.bounds[3] <= dot.bounds[1] + .1
                and 0 < dot.bounds[1] - body.bounds[3] < 5
                and min(body.bounds[2], dot.bounds[2]) - max(body.bounds[0], dot.bounds[0]) > .5]
            if candidates:
                parent = max(candidates,key=lambda p:p.bounds[3])
                supports.append(support_between(dot,parent))
        assert len(supports) == 2, 'Both i dots must have rear support bridges'
        word = trimesh.boolean.union([upright(green), *supports], engine='manifold')
        parts.append(('napis.stl',word,'Napis i tylne łączniki kropek','#234C3B'))
    # All primary bodies must intersect the low plinth; dots connect via bridges.
    for polygon in builder.polygons(yellow) + ([] if green is None else builder.polygons(green)):
        if polygon.bounds[1] >= plinth_height and polygon.bounds[3] - polygon.bounds[1] >= 7:
            # Small rear foot only where a contour sits above the common baseline.
            bottom = min(polygon.exterior.coords,key=lambda p:p[1])
            foot = upright(box(bottom[0]-.75, 3, bottom[0]+.75, bottom[1]+1.0), depth=4)
            base = trimesh.boolean.union([base,foot],engine='manifold')
    parts[0] = ('podstawa.stl',base,'Podstawka','#234C3B')
    for file,mesh,_,_ in parts:
        mesh.export(output/file)
        builder.inspect(trimesh.load_mesh(output/file,process=True))
    combined = trimesh.boolean.union([part[1] for part in parts],engine='manifold')
    combined.export(output/'oskiride-kontur-20mm.stl')
    mesh = trimesh.load_mesh(output/'oskiride-kontur-20mm.stl',process=True)
    result = builder.inspect(mesh)
    assert result['connected_components'] == 1, result
    assert abs(mesh.extents[1] - 20) < .001
    assert abs(mesh.bounds[0,2]) < .001
    assert abs(mesh.extents[0] - base_width) < .001
    # Quantify that the rectangular backing has actually been removed.
    empty_fraction = 1-mesh.volume/np.prod(mesh.extents)
    result.update({'reference':'freestanding contour on a low plinth', 'depth_mm':20,
        'plinth_height_mm':4, 'backing_plate':False, 'rear_dot_bridges':len(supports),
        'open_fraction_of_bounding_box':round(float(empty_fraction),4), 'physical_print_tested':False})
    (output/'walidacja.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    builder.write_3mf(output/'oskiride-kontur-kolory.3mf',parts,base_width)
    return result


def main():
    DEST.mkdir(parents=True,exist_ok=True)
    paths = ET.parse(VECTOR).getroot().findall('.//{http://www.w3.org/2000/svg}path')
    yellow, green = [parse_path(path.attrib['d']) for path in paths]
    # Preserve the original lockup and baseline; only remove the backing block.
    yellow_full = affinity.translate(yellow,yoff=17.98685)
    green_full = affinity.translate(green,yoff=17.98685)
    full = build_variant('pelne-logo',yellow_full,green_full,160)
    left,bottom,right,top = yellow.bounds
    scale = 70/(right-left)
    compact = affinity.scale(affinity.translate(yellow,xoff=-(left+right)/2,yoff=-bottom),xfact=scale,yfact=scale,origin=(0,0))
    compact = affinity.translate(compact,yoff=3.3)
    mark = build_variant('sam-znak-OR',compact,None,76)
    report = {'pelne-logo':full,'sam-znak-OR':mark}
    (DEST/'walidacja.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    previous = ROOT/'grafika/marka-oskiride/druk-3d/pionowe-20mm/podglad.html'
    html = previous.read_text(encoding='utf-8')
    html = html.replace('OskiRide — logo stojące, grubość 20 mm','OskiRide — przestrzenne logo po obrysie')
    html = html.replace('OskiRide · logo stojące 20 mm','OskiRide · logo po obrysie')
    html = html.replace('Pionowa tabliczka · szerokość 160 mm · całkowita grubość 2 cm.', 'Wycięty znak i litery na niskiej podstawce · grubość 20 mm.')
    html = html.replace('modele/oskiride-logo-160mm-pionowe-20mm.stl','modele/pelne-logo/oskiride-kontur-20mm.stl')
    html = html.replace('modele/oskiride-logo-kolory.3mf','modele/pelne-logo/oskiride-kontur-kolory.3mf')
    html = html.replace('<main id="viewer">','<div style="padding:0 32px 16px"><label for="variant">Wariant: </label><select id="variant" style="font:inherit;padding:7px 12px;border-radius:6px;border:1px solid #A4B29A;background:#FFFCF7;color:#234C3B"><option value="pelne-logo">Pełne logo OskiRide</option><option value="sam-znak-OR">Sam znak OR · jak statuetka</option></select></div><main id="viewer">')
    start = html.index('    const parts = ')
    end = html.index('    function resize()',start)
    html = html[:start]+'''    const loader = new STLLoader();
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    async function loadVariant(name) {
      viewer.dataset.loaded = 'false';
      while(modelGroup.children.length) {
        const mesh=modelGroup.children[0]; modelGroup.remove(mesh);
        mesh.geometry.dispose(); mesh.material.dispose();
      }
      const prefix='modele/'+name+'/';
      const parts=[['podstawa.stl','#234C3B'],['znak-OR.stl','#F2C94C']];
      if(name==='pelne-logo') parts.push(['napis.stl','#234C3B']);
      try {
        document.getElementById('variant').disabled=true;
        for(const [file,color] of parts) {
          const geometry=await loader.loadAsync(prefix+file);
          geometry.computeVertexNormals();
          const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.6,metalness:0,flatShading:true}));
          mesh.castShadow=true;mesh.receiveShadow=true;modelGroup.add(mesh);
        }
        const data=await fetch(prefix+'walidacja.json').then(r=>r.json());
        const size=data.size_mm;
        document.getElementById('dimensions').textContent=`Szerokość ${size[0].toFixed(0)} mm · wysokość ${size[2].toFixed(1).replace('.',',')} mm · grubość 20 mm`;
        document.querySelector('.download').href=prefix+'oskiride-kontur-20mm.stl';
        document.querySelector('a[href$=".3mf"]').href=prefix+'oskiride-kontur-kolory.3mf';
        controls.target.set(0,0,size[2]/2);
        camera.position.set(size[0]*.28,-size[0]*1.4,size[2]/2+size[0]*.5);
        controls.minDistance=size[0]*.6;controls.maxDistance=size[0]*4;
        controls.update();
        status.textContent='Rzeczywisty model STL · bez płyty za logo';
        viewer.dataset.loaded='true';
      } catch(error) { status.textContent=error.message;console.error(error); }
      finally { document.getElementById('variant').disabled=false; }
    }
    document.getElementById('variant').addEventListener('change',event=>loadVariant(event.target.value));
    await loadVariant('pelne-logo');
''' + html[end:]
    (DEST/'podglad.html').write_text(html,encoding='utf-8')
    RUNTIME.mkdir(parents=True,exist_ok=True)
    shutil.copy2(DEST/'podglad.html',RUNTIME/'podglad.html')
    shutil.copytree(DEST/'modele',RUNTIME/'modele',dirs_exist_ok=True)
    print(json.dumps({k:{'size_mm':v['size_mm'],'components':v['connected_components'], 'backing_plate':v['backing_plate']} for k,v in report.items()}))


if __name__=='__main__':
    main()
