"""Original low-poly roadside supporters. Run with Blender 4.5 in background.

Writes only grafika/kibice/. No existing game assets or open scenes are edited.
"""
import bpy
import math
import json
import hashlib
import struct
import sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from spectator_portrait import build_personal_spectator

OUT = Path(__file__).resolve().parents[2] / 'grafika' / 'kibice'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Doping_Loop'
scene.unit_settings.system = 'METRIC'
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 72

def material(name, color, roughness=.85):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m

M = {
    'forest': material('Las • forest', (.024,.19,.115)),
    'yellow': material('Słońce • yellow', (1,.66,.035)),
    'cream': material('Cotton • ivory', (.9,.86,.71)),
    'navy': material('Denim • midnight', (.035,.075,.12)),
    'blue': material('Jacket • lake', (.12,.35,.42)),
    'rust': material('Jersey • clay', (.65,.19,.10)),
    'white': material('Sneakers • chalk', (.94,.94,.86)),
    'black': material('Soles and pupils', (.017,.025,.025)),
    'skin1': material('Skin • peach', (.71,.40,.24)),
    'skin2': material('Skin • umber', (.30,.13,.065)),
    'skin3': material('Skin • warm', (.89,.59,.38)),
    'hair1': material('Hair • espresso', (.055,.025,.016)),
    'hair2': material('Hair • honey', (.48,.25,.065)),
    'hair3': material('Hair • silver', (.48,.50,.46)),
    'red': material('Flag • Poland red', (.76,.025,.055)),
    'sand': material('Vest • sand', (.62,.47,.24)),
    'plum': material('Hoodie • plum', (.28,.12,.25)),
}

def empty(name, location=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent, o.location = parent, location
    return o

def mesh(name, verts, faces, mat, parent):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(mat)
    return o

def add_official_board_logo(parent):
    """Reuse the approved traced logo, including letter counters, without textures.

    Only the top faces of the print masters are needed for the game decal.
    Millimetres in the master become metres on a 0.986 m wide placard logo.
    """
    source = OUT.parent / 'marka-oskiride' / 'druk-3d'
    def linear(hex_color):
        c=[int(hex_color[i:i+2],16)/255 for i in (0,2,4)]
        return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
    for filename, label, color in [
        ('oskiride-znak-OR.stl','Official OR mark','F2C94C'),
        ('oskiride-napis.stl','Official OskiRide wordmark','234C3B'),
    ]:
        data=(source/filename).read_bytes()
        count=struct.unpack_from('<I',data,80)[0]
        verts=[]; faces=[]; indices={}
        for i in range(count):
            facet=struct.unpack_from('<12fH',data,84+i*50)
            if facet[2]<.99: continue  # outward front face of the source relief
            face=[]
            for offset in (3,6,9):
                x,y,z=facet[offset:offset+3]
                key=(round(x,5),round(y,5))
                if key not in indices:
                    indices[key]=len(verts)
                    verts.append((x*.0064,-.057,2.17+y*.0064))
                face.append(indices[key])
            faces.append(tuple(face))
        assert faces, 'No logo face triangles in '+filename
        logo=mesh(label,verts,faces,material(label,linear(color)),parent)
        logo['source_logo']=str(Path('grafika/marka-oskiride/druk-3d')/filename)

def loft(name, rings, mat, parent, n=10):
    # rings: x,y,z,halfwidth,halfdepth. Closed, flat shaded elliptical sections.
    verts = [(x+rx*math.cos(2*math.pi*j/n), y+ry*math.sin(2*math.pi*j/n), z)
             for x,y,z,rx,ry in rings for j in range(n)]
    faces = [tuple(reversed(range(n)))]
    for k in range(len(rings)-1):
        for j in range(n):
            a = k*n+j; b = k*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    faces.append(tuple((len(rings)-1)*n+j for j in range(n)))
    return mesh(name, verts, faces, mat, parent)

def ellipsoid(name, location, scale, mat, parent, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings)
    o = bpy.context.object
    o.name, o.parent, o.location, o.scale = name, parent, location, scale
    o.data.materials.append(mat)
    return o

def box(name, location, scale, mat, parent, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name, o.parent, o.location, o.scale = name, parent, location, scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft tailored corners','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def segment(name, start, end, radius1, radius2, mat, parent, n=10):
    d=Vector(end)-Vector(start)
    o=loft(name, [(0,0,0,radius1,radius1*.86), (0,0,d.length*.45,(radius1+radius2)*.53,(radius1+radius2)*.45),
                   (0,0,d.length,radius2,radius2*.86)],mat,parent,n)
    o.location=start
    o.rotation_mode='QUATERNION'
    o.rotation_quaternion=d.to_track_quat('Z','Y')
    return o

def descendants(root):
    return [root] + [o for child in root.children for o in descendants(child)]

def merge_static(root):
    # Batch rigid surfaces by parent and material; preserve animated pivots.
    groups={}
    for o in descendants(root):
        if o.type=='MESH': groups.setdefault((o.parent, o.data.materials[0]),[]).append(o)
    for (parent,mat), objects in groups.items():
        if mat.use_nodes and any(n.type=='TEX_IMAGE' for n in mat.node_tree.nodes):
            continue  # Keep the portrait UV surface independent of solid colors.
        if len(objects)==1:
            objects[0].name=parent.name+'__'+mat.name.split(' • ')[0]
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=parent.name+'__'+mat.name.split(' • ')[0]

SPECS=[
    ('01-machanie','Machanie',1.00,'yellow','skin3','hair1','cap','wave'),
    ('02-oklaski','Oklaski',.94,'forest','skin2','hair1','curls','clap'),
    ('03-szalik','Szalik',1.04,'cream','skin1','hair3','short','scarf'),
    ('04-flaga','Flaga Polski',.97,'blue','skin3','hair2','pony','flag'),
    ('05-doping','Ręce w górze',1.02,'rust','skin2','hair1','short','cheer'),
    ('06-kibicka','Kibicka',.92,'forest','skin3','hair2','bob','wave'),
    ('07-fotograf','Fotograf',1.01,'sand','skin1','hair1','bucket','camera'),
    ('08-dzwonek','Kibic z dzwonkiem',1.06,'yellow','skin3','hair1','beard','bell'),
    ('09-bidon','Kibicka z bidonem',.95,'blue','skin2','hair1','pony','bottle'),
    ('10-tablica','Tablica dopingu',.98,'rust','skin1','hair2','bob','placard'),
    ('11-mlody-kibic','Młody kibic',.77,'plum','skin3','hair1','curls','bounce'),
    ('12-megafon','Kibic z megafonem',1.00,'forest','skin1','hair3','beard','megaphone'),
    ('13-portret','Twój kibic',1.02,'cream','skin3','hair2','portrait','wave'),
]
roots=[]
manifest=[]
for idx,(slug,label,height,shirt,skin,hair,style,pose) in enumerate(SPECS):
    root=empty('Kibic_'+slug)
    root['description']=label
    root['forward']='Blender -Y; glTF +Z'
    width = 1.16 if idx==12 else 1.14 if idx==7 else .88 if idx==10 else 1
    root.scale=(height*width,height,height)
    roots.append(root)
    cloth,skinmat,hairmat=M[shirt],M[skin],M[hair]
    # Proportions: soles 0, hip .88, shoulder 1.42, crown 1.77 metres.
    for s in (-1,1):
        x=s*.115
        box('Sneaker sole',(x,-.065,.035),(.17,.31,.07),M['white'],root,.018)
        box('Sneaker upper',(x,-.08,.095),(.15,.27,.10),M['navy'],root,.025)
        box('Toe panel',(x,-.183,.10),(.145,.065,.045),M['cream'],root,.012)
        for z in (.109,.128): box('Lace',(x,-.12+(z-.109)*2,.149),(.098,.012,.009),M['white'],root)
        if idx in (7,8,10):
            loft('Bare calf',[(x,0,.14,.058,.063),(x,0,.32,.066,.073),(x,0,.55,.069,.074)],skinmat,root)
            loft('Sport sock',[(x,0,.14,.062,.067),(x,0,.25,.064,.070)],M['white'],root)
            loft('Shorts',[(x,0,.49,.087,.095),(x,0,.68,.098,.105),(x,0,.86,.105,.105)],M['navy'],root)
        else:
            loft('Trouser leg',[(x,0,.14,.069,.073),(x,0,.42,.077,.083),
                                (x,-.014,.53,.078,.09),(x,0,.86,.105,.105)],M['navy'],root)
    loft('Hips',[(0,0,.78,.205,.105),(0,0,.96,.21,.12)],M['navy'],root)
    waist=.18 if idx in (1,3,5,8,9) else .225 if idx==7 else .205
    loft('Tailored shirt',[(0,0,.91,waist,.125),(0,0,1.02,waist*.95,.12),
         (0,0,1.27,.235,.135),(0,0,1.40,.245,.117),(0,0,1.46,.185,.095)],cloth,root,12)
    # Contrasting hem, crew collar and small chest emblem.
    loft('Shirt hem',[(0,0,.915,waist+.002,.128),(0,0,.96,waist+.001,.128)],M['yellow'] if shirt=='forest' else M['forest'],root,12)
    loft('Neck',[(0,0,1.42,.073,.068),(0,0,1.54,.067,.062)],skinmat,root)
    loft('Crew neck',[(0,0,1.445,.092,.078),(0,0,1.473,.084,.073)],M['forest'] if shirt!='forest' else M['cream'],root)
    box('Chest club patch',(-.10,-.133,1.30),(.053,.012,.067),M['forest'] if shirt!='forest' else M['yellow'],root,.008)
    box('Patch stripe',(-.10,-.141,1.305),(.033,.005,.012),M['yellow'] if shirt!='forest' else M['forest'],root)
    if idx in (6,11):
        box('Vest placket',(0,-.14,1.20),(.022,.018,.41),M['cream'],root,.004)
        for s in (-1,1): box('Vest pocket',(s*.13,-.142,1.10),(.10,.018,.11),M['forest'] if idx==6 else M['sand'],root,.01)
        if idx==6:
            for s in (-1,1): segment('Camera strap',(s*.13,-.13,1.4),(s*.09,-.18,1.05),.014,.014,M['black'],root,6)
    if idx==8:
        box('Jacket zip',(0,-.142,1.2),(.012,.018,.42),M['white'],root)
        for x in (-.14,.14): box('Jacket pocket',(x,-.135,1.06),(.055,.012,.012),M['yellow'],root)
    if idx==10:
        ellipsoid('Hood',(0,.087,1.44),(.14,.10,.105),cloth,root)
        box('Kangaroo pocket',(0,-.129,1.08),(.22,.025,.11),M['cream'],root,.015)
        for s in (-1,1): segment('Hoodie cord',(s*.05,-.12,1.42),(s*.06,-.15,1.27),.008,.008,M['yellow'],root,6)
    head=empty(root.name+'_Head',(0,0,1.60),root)
    if idx==10: head.scale=(1.14,)*3
    ellipsoid('Face',(0,-.007,.035),(.113,.107,.143),skinmat,head)
    for s in (-1,1):
        ellipsoid('Ear',(s*.111,0,.025),(.025,.023,.041),skinmat,head,8,6)
        ellipsoid('Eye',(s*.043,-.105,.055),(.012,.008,.014),M['black'],head,8,6)
        brow=box('Brow',(s*.043,-.105,.084),(.032,.008,.008),hairmat,head,.002)
        brow.rotation_euler.y=s*-.10
    ellipsoid('Nose',(0,-.112,.023),(.023,.027,.029),skinmat,head,8,6)
    box('Smile',(0,-.104,-.025),(.043,.009,.008),M['hair1'],head,.003)
    # Hair cap with a deliberately cut hairline, no full intersecting sphere.
    verts=[]
    n=12
    for k,(z,rx,ry) in enumerate([(.040,.116,.105),(.13,.091,.085),(.176,.025,.025)]):
        for j in range(n):
            t=2*math.pi*j/n
            zz=z+(.032 if k==0 and math.sin(t)<-.3 else 0)
            verts.append((rx*math.cos(t),ry*math.sin(t)+.012,zz))
    faces=[]
    for k in range(2):
        for j in range(n): faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    faces.append(tuple(24+j for j in range(n)))
    mesh('Hair cut',verts,faces,hairmat,head)
    if style=='cap':
        ellipsoid('Club cap',(0,.012,.123),(.126,.113,.070),M['forest'],head)
        box('Cap visor',(0,-.120,.105),(.23,.15,.018),M['forest'],head,.018)
        box('Cap badge',(0,-.098,.151),(.042,.012,.028),M['yellow'],head,.005)
    if style=='pony':
        ellipsoid('Ponytail',(0,.117,.025),(.07,.065,.15),hairmat,head,10,6)
        ellipsoid('Hair tie',(0,.110,.11),(.074,.027,.026),M['yellow'],head,8,6)
    if style=='bob':
        for s in (-1,1): ellipsoid('Bob side',(s*.099,.036,-.006),(.038,.081,.12),hairmat,head,10,6)
    if style=='curls':
        for j in range(8):
            t=j*math.pi/4
            ellipsoid('Curl',(.09*math.cos(t),.08*math.sin(t),.135),(.046,.045,.044),hairmat,head,8,6)
    if style=='bucket':
        loft('Bucket crown',[(0,.015,.10,.125,.11),(0,.015,.22,.10,.095)],M['cream'],head,12)
        loft('Bucket brim',[(0,.015,.088,.165,.15),(0,.015,.11,.125,.11)],M['sand'],head,12)
        loft('Hat band',[(0,.015,.12,.123,.109),(0,.015,.14,.118,.107)],M['forest'],head,12)
    if style=='beard':
        loft('Beard',[(0,-.032,-.10,.045,.045),(0,-.024,-.035,.094,.088),(0,-.025,.005,.096,.087)],hairmat,head,10)
        for s in (-1,1): ellipsoid('Moustache',(s*.025,-.119,-.009),(.033,.016,.016),hairmat,head,8,6)
    if idx in (2,11):
        for s in (-1,1):
            box('Glasses lens',(s*.048,-.113,.056),(.074,.011,.045),M['navy'],head,.008)
        box('Glasses bridge',(0,-.117,.062),(.027,.01,.008),M['navy'],head)

    if pose=='wave': arms=[((-.40,0,1.16),(-.36,-.09,.96)),((.41,0,1.69),(.46,-.05,1.99))]
    elif pose=='clap': arms=[((-.29,-.14,1.22),(-.055,-.37,1.43)),((.29,-.14,1.22),(.055,-.37,1.43))]
    elif pose=='scarf': arms=[((-.45,0,1.72),(-.63,-.015,2.01)),((.45,0,1.72),(.63,-.015,2.01))]
    elif pose=='flag': arms=[((-.38,0,1.18),(-.39,-.15,1.05)),((.40,0,1.65),(.49,-.04,1.92))]
    elif pose=='camera': arms=[((-.34,-.15,1.35),(-.13,-.32,1.58)),((.34,-.15,1.35),(.13,-.32,1.58))]
    elif pose=='bell': arms=[((-.39,0,1.16),(-.40,-.07,.99)),((.40,-.04,1.52),(.46,-.20,1.76))]
    elif pose=='bottle': arms=[((-.34,0,1.18),(-.20,-.03,1.04)),((.44,-.10,1.30),(.53,-.35,1.48))]
    elif pose=='placard': arms=[((-.39,0,1.72),(-.49,-.015,2.00)),((.39,0,1.72),(.49,-.015,2.00))]
    elif pose=='bounce': arms=[((-.39,-.08,1.35),(-.40,-.20,1.62)),((.39,-.08,1.35),(.40,-.20,1.62))]
    elif pose=='megaphone': arms=[((-.37,0,1.18),(-.37,-.07,.98)),((.32,-.10,1.36),(.10,-.26,1.59))]
    else: arms=[((-.43,0,1.65),(-.55,-.04,1.94)),((.43,0,1.65),(.55,-.04,1.94))]
    pivots=[]
    for side,(elbow,hand) in zip((-1,1),arms):
        shoulder=Vector((side*.23,0,1.39)); e=Vector(elbow); h=Vector(hand)
        pivot=empty(root.name+('_ArmL' if side==-1 else '_ArmR'),shoulder,root)
        pivots.append(pivot)
        sleeveend=shoulder+(e-shoulder)*.57
        segment('Short sleeve',(0,0,0),sleeveend-shoulder,.089,.083,cloth,pivot)
        segment('Upper arm',sleeveend-shoulder,e-shoulder,.066,.055,skinmat,pivot)
        ellipsoid('Elbow',e-shoulder,(.057,.054,.057),skinmat,pivot,10,6)
        segment('Forearm',e-shoulder,h-shoulder,.058,.038,skinmat,pivot)
        palm=ellipsoid('Hand',h-shoulder,(.049,.032,.074),skinmat,pivot,10,6)
        palm.rotation_mode='QUATERNION'; palm.rotation_quaternion=(h-e).to_track_quat('Z','Y')
        ellipsoid('Thumb',h-shoulder+Vector((-side*.033,-.012,-.015)),(.023,.024,.039),skinmat,pivot,8,6)
        if side==1 and pose=='flag':
            segment('Flag pole',Vector((.49,-.04,1.56))-shoulder,Vector((.49,-.04,2.65))-shoulder,.012,.012,M['cream'],pivot,8)
            for half in range(2):
                vs=[]
                for row in range(2):
                    for j in range(9):
                        u=j/8
                        vs.append(tuple(Vector((.49+u*.66,-.04+math.sin(u*8)*.035,2.62-(half+row)*.18))-shoulder))
                fs=[(j,j+1,j+10,j+9) for j in range(8)]
                flag=mesh('Polish flag '+str(half),vs,fs,M['white' if half==0 else 'red'],pivot)
                flag.data.materials[0].use_backface_culling=False
        if side==1 and pose=='bell':
            segment('Bell handle',h-shoulder,h-shoulder+Vector((0,0,-.12)),.018,.018,M['navy'],pivot,8)
            loft('Cowbell',[(h.x-shoulder.x,h.y-shoulder.y,h.z-shoulder.z-.27,.075,.055),
                            (h.x-shoulder.x,h.y-shoulder.y,h.z-shoulder.z-.12,.045,.035)],M['yellow'],pivot,8)
            ellipsoid('Clapper',h-shoulder+Vector((0,0,-.28)),(.023,)*3,M['black'],pivot,8,6)
        if side==1 and pose=='bottle':
            segment('Bidon',h-shoulder+Vector((0,0,-.08)),h-shoulder+Vector((0,0,.12)),.047,.047,M['yellow'],pivot,10)
            segment('Bidon cap',h-shoulder+Vector((0,0,.12)),h-shoulder+Vector((0,0,.15)),.038,.038,M['forest'],pivot,10)
            segment('Bidon nozzle',h-shoulder+Vector((0,0,.15)),h-shoulder+Vector((0,0,.18)),.014,.014,M['black'],pivot,8)
        if side==1 and pose=='megaphone':
            segment('Megaphone body',h-shoulder+Vector((0,.04,.06)),h-shoulder+Vector((0,-.24,.06)),.035,.13,M['cream'],pivot,12)
            segment('Megaphone mouth',h-shoulder+Vector((0,-.241,.06)),h-shoulder+Vector((0,-.25,.06)),.11,.11,M['forest'],pivot,12)
            segment('Megaphone handle',h-shoulder,h-shoulder+Vector((0,0,.06)),.023,.023,M['yellow'],pivot,8)
    if pose=='camera':
        box('Camera',(0,-.32,1.60),(.25,.09,.13),M['navy'],root,.012)
        segment('Camera lens',(0,-.365,1.60),(0,-.44,1.60),.049,.049,M['black'],root,12)
        segment('Lens glass',(0,-.441,1.60),(0,-.445,1.60),.038,.038,M['blue'],root,12)
        box('Camera flash',(-.07,-.37,1.63),(.045,.016,.026),M['white'],root)
    if pose=='placard':
        box('Support board',(0,-.016,2.17),(1.16,.05,.45),M['forest'],root,.018)
        box('Board face',(0,-.045,2.17),(1.10,.012,.39),M['cream'],root,.012)
        add_official_board_logo(root)
    if pose=='scarf':
        box('Supporter scarf',(0,-.013,2.045),(1.46,.045,.15),M['forest'],root,.012)
        for x in (-.55,-.40,.40,.55): box('Scarf woven stripe',(x,-.04,2.045),(.075,.014,.15),M['yellow'],root)
        for x in (-.70,.70):
            box('Scarf tail',(x,0,1.93),(.12,.04,.21),M['yellow'],root,.008)
            for dx in (-.04,0,.04): box('Scarf fringe',(x+dx,0,1.805),(.016,.034,.05),M['cream'],root)
    # Loop, 3 s / 24 fps. First and final sample coincide exactly.
    for f in range(0,73,3):
        t=f/72*2*math.pi
        for side,pivot in zip((-1,1),pivots):
            if pose in ('scarf','placard','camera'): angle=0
            elif pose=='clap': angle=side*.10*(1-math.cos(3*t))
            elif pose=='wave': angle=(.17*math.sin(2*t) if side==1 else .025*math.sin(t))
            elif pose=='flag': angle=.065*math.sin(t) if side==1 else .03*math.sin(t)
            elif pose=='bell': angle=.16*math.sin(4*t) if side==1 else .02*math.sin(t)
            elif pose=='bottle': angle=.07*math.sin(2*t) if side==1 else .015*math.sin(t)
            elif pose=='megaphone': angle=.02*math.sin(t)
            else: angle=side*.11*math.sin(2*t)
            pivot.rotation_euler=(0,angle,0)
            if pose=='clap': pivot.rotation_euler.z=side*.08*(1-math.cos(3*t))
            pivot.keyframe_insert(data_path='rotation_euler',frame=f)
        head.rotation_euler.z=.045*math.sin(t)
        head.keyframe_insert(data_path='rotation_euler',frame=f)
        if pose in ('cheer','bounce'):
            root.location.z=.055*(1-math.cos(2*t))
            root.keyframe_insert(data_path='location',frame=f)
        if pose in ('scarf','placard'):
            root.rotation_euler.z=.035*math.sin(t)
            root.keyframe_insert(data_path='rotation_euler',frame=f)
    if style=='portrait':
        build_personal_spectator(root,head,pivots,globals())
    merge_static(root)
    for o in descendants(root):
        if o.animation_data and o.animation_data.action:
            o.animation_data.action.name=o.name+'_Doping_Loop'
    scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root): o.select_set(True)
    path=OUT/(slug+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_animations=True,export_animation_mode='SCENE',export_frame_range=True,
        export_force_sampling=True,export_anim_scene_split_object=False,export_extras=True)
    tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in descendants(root) if o.type=='MESH')
    manifest.append({'id':slug,'name':label,'file':path.name,'revision':hashlib.sha256(path.read_bytes()).hexdigest()[:12],
                     'heightScale':height,'triangles':tris,
                     'durationSeconds':3,'forward':'+Z','up':'+Y','units':'metres'})

# A reusable lineup, with each supporter independently transformable.
for i,root in enumerate(roots):
    x=(i-(len(roots)-1)/2)*1.34
    if root.animation_data:
        for fc in root.animation_data.action.fcurves:
            if fc.data_path=='location' and fc.array_index==0:
                for key in fc.keyframe_points: key.co.y+=x; key.handle_left.y+=x; key.handle_right.y+=x
    root.location.x=x
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    for o in descendants(root): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kibice-grupa.glb'),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='SCENE',export_frame_range=True,
    export_force_sampling=True,export_anim_scene_split_object=False,export_extras=True)
(OUT/'modele.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')

# Studio is preview-only; all GLBs have already been exported without it.
stage=material('Studio • sage',(.12,.19,.16))
box('Preview floor',(0,0,-.08),(200,200,.15),stage,None)
world=bpy.data.worlds.new('Soft forest studio')
scene.world=world; world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.30,.39,.34,1); bg.inputs[1].default_value=.45
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size; d.color=color
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=loc
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-3,-5,8),1600,7,(1,.87,.68))
area('Cool fill',(4,-2,5),1000,6,(.75,.87,1))
area('Rim',(0,4,6),1800,5,(1,.94,.77))
camdata=bpy.data.cameras.new('Supporters preview')
cam=bpy.data.objects.new('Supporters preview',camdata); scene.collection.objects.link(cam)
cam.location=(3.4,-15,6.2); target=Vector((.1,0,1.15))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO'; camdata.ortho_scale=19.9; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=3000; scene.render.resolution_y=650; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'podglad.png')
scene.view_settings.view_transform='AgX'
scene.frame_set(10)
# Frame and material-color viewport when the source file is opened.
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.color_type='MATERIAL'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'kibice.blend'))
# Render the personal model first for close visual inspection, then the overviews.
personal=roots[-1]
old_personal_location=personal.location.copy()
old_camera_location=cam.location.copy()
old_camera_rotation=cam.rotation_euler.copy()
for root in roots[:-1]:
    for obj in descendants(root): obj.hide_render=True
personal.location=(0,0,0)
centre=Vector((0,0,1.14))
cam.location=centre+Vector((.38,-6,1.1))
cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.ortho_scale=2.65
scene.render.resolution_x=850; scene.render.resolution_y=1000
scene.render.filepath=str(OUT/'13-portret-podglad.png')
bpy.ops.render.render(write_still=True)
centre=Vector((0,0,1.70))
cam.location=centre+Vector((.15,-4,.20))
cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.ortho_scale=.68
scene.render.resolution_x=700; scene.render.resolution_y=700
scene.render.filepath=str(OUT/'13-portret-twarz.png')
bpy.ops.render.render(write_still=True)
centre=Vector((0,0,1.14))
cam.location=centre+Vector((-.32,6,1.0))
cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.ortho_scale=2.65
scene.render.resolution_x=850; scene.render.resolution_y=1000
scene.render.filepath=str(OUT/'13-portret-tyl.png')
bpy.ops.render.render(write_still=True)
personal.location=old_personal_location
for root in roots:
    for obj in descendants(root): obj.hide_render=False
cam.location=old_camera_location; cam.rotation_euler=old_camera_rotation
camdata.ortho_scale=19.9
scene.render.resolution_x=3000; scene.render.resolution_y=650
scene.render.filepath=str(OUT/'podglad.png')
bpy.ops.render.render(write_still=True)
for root in roots[:6]+roots[12:]:
    for obj in descendants(root): obj.hide_render=True
cam.location.x+=4.02
camdata.ortho_scale=9.8
scene.render.resolution_x=1800; scene.render.resolution_y=760
scene.render.filepath=str(OUT/'podglad-nowi.png')
bpy.ops.render.render(write_still=True)
print('SPECTATORS_COMPLETE '+json.dumps(manifest,ensure_ascii=False))
