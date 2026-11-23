"""Thirteenth supporter, stylised from the user's supplied portrait references.

The face atlas is generated from the reference portrait and embedded in the GLB.
"""
import bpy
import math
from mathutils import Vector
from spectator_face import build_portrait_head


def build_personal_spectator(root, head, arms, kit):
    mesh, loft, ellipsoid, box, segment, material = [kit[k] for k in
        ('mesh','loft','ellipsoid','box','segment','material')]
    # Keep the four animated pivots; replace only this character's starter meshes.
    for obj in list(root.children_recursive):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    skin=material('Portrait • fair warm skin',(.68,.43,.33))
    hair=material('Portrait • light brown hair',(.21,.115,.055))
    hair_high=material('Portrait • quiff highlights',(.29,.17,.085))
    beard=material('Portrait • copper brown beard',(.24,.075,.028))
    brow=material('Portrait • eyebrows',(.16,.085,.040))
    shirt=material('Portrait • ivory shirt',(.86,.88,.83))
    collar=material('Portrait • collar',(.94,.94,.89))
    seam=material('Portrait • shirt seams',(.65,.69,.65))
    trousers=material('Portrait • black trousers',(.012,.017,.022))
    shoes=material('Portrait • black leather',(.018,.022,.025),.5)
    sole=material('Portrait • rubber sole',(.009,.012,.014))
    eyes=material('Portrait • blue grey eyes',(.09,.22,.26))
    sclera=material('Portrait • eye white',(.82,.83,.78))
    pupil=material('Portrait • pupils',(.009,.014,.017))
    lips=material('Portrait • lips',(.35,.15,.12))
    root['likeness']='Stylised portrait from user-provided references; ivory shirt, brown quiff, copper beard'
    root['back_print']='Oski'

    for side in (-1,1):
        x=side*.12
        box('Portrait shoe sole',(x,-.065,.033),(.175,.31,.066),sole,root,.018)
        box('Portrait dress shoe',(x,-.075,.094),(.16,.29,.12),shoes,root,.033)
        box('Portrait shoe vamp',(x,-.11,.145),(.125,.13,.032),shoes,root,.014)
        loft('Portrait trouser leg',[(x,0,.15,.075,.08),(x,0,.43,.085,.091),
              (x,-.01,.54,.09,.10),(x,0,.88,.113,.119)],trousers,root,12)
    loft('Portrait pelvis',[(0,0,.78,.215,.14),(0,0,.96,.22,.145)],trousers,root,12)
    loft('Portrait tailored shirt',[(0,0,.91,.230,.156),(0,-.004,1.02,.235,.16),
         (0,-.006,1.18,.245,.17),(0,0,1.38,.245,.135),(0,0,1.46,.185,.10)],shirt,root,16)
    # Placket follows the rounded shirt rather than hovering in front of it.
    for z,y in [(1.0,-.163),(1.08,-.174),(1.16,-.18),(1.24,-.17),(1.32,-.154),(1.40,-.132)]:
        box('Portrait placket',(0,y,z),(.024,.008,.081),collar,root,.002)
        ellipsoid('Portrait button',(0,y-.006,z),(.006,.004,.006),seam,root,8,4)
    loft('Portrait neck',[(0,0,1.43,.082,.075),(0,0,1.55,.078,.073)],skin,root,12)
    for side in (-1,1):
        mesh('Portrait shirt collar',[(side*.035,-.108,1.475),(side*.13,-.118,1.438),
              (side*.072,-.151,1.365),(side*.018,-.138,1.426)],[(0,1,2,3)],collar,root)
    box('Portrait breast pocket',(-.125,-.149,1.30),(.09,.012,.10),shirt,root,.008)
    box('Portrait pocket seam',(-.125,-.158,1.345),(.084,.005,.007),seam,root,.002)
    # A geometry print follows the curved back of the shirt. Reading from behind
    # (+Y in Blender), horizontal text runs along -X and vertical text along +Z.
    lettering=bpy.data.curves.new('Oski back print','FONT')
    lettering.body='Oski'
    lettering.align_x='CENTER'; lettering.align_y='CENTER'
    lettering.size=.14; lettering.resolution_u=4; lettering.fill_mode='BOTH'
    print_obj=bpy.data.objects.new('Portrait back print Oski',lettering)
    bpy.context.scene.collection.objects.link(print_obj)
    bpy.ops.object.select_all(action='DESELECT')
    print_obj.select_set(True); bpy.context.view_layer.objects.active=print_obj
    bpy.ops.object.convert(target='MESH')
    print_obj=bpy.context.object; print_obj.parent=root
    for vertex in print_obj.data.vertices:
        x=-vertex.co.x; z=1.31+vertex.co.y
        blend=max(0,min(1,(z-1.18)/.20))
        cy=-.006*(1-blend); ry=.17*(1-blend)+.135*blend
        y=cy+ry*math.sqrt(max(0,1-(x/.245)**2))+.0025
        vertex.co=(x,y,z)
    print_obj.data.update()
    print_obj.data.materials.append(kit['M']['forest'])
    print_obj['back_print']='Oski'

    build_portrait_head(root,head,kit,skin,hair,beard)

    poses=[((-.40,0,1.16),(-.36,-.09,.96)),((.41,0,1.69),(.46,-.05,1.99))]
    for side,pivot,(elbow,hand) in zip((-1,1),arms,poses):
        shoulder=Vector((side*.23,0,1.39)); e=Vector(elbow); h=Vector(hand)
        segment('Portrait long upper sleeve',(0,0,0),e-shoulder,.09,.073,shirt,pivot,12)
        ellipsoid('Portrait sleeve elbow',e-shoulder,(.075,.069,.075),shirt,pivot,12,6)
        wrist=e+(h-e)*.88
        segment('Portrait long forearm sleeve',e-shoulder,wrist-shoulder,.073,.049,shirt,pivot,12)
        segment('Portrait shirt cuff',wrist-shoulder,h-shoulder,.052,.049,collar,pivot,12)
        palm=ellipsoid('Portrait hand',h-shoulder+Vector((0,0,.025 if side==1 else -.02)),(.049,.032,.075),skin,pivot,12,8)
        palm.rotation_mode='QUATERNION'; palm.rotation_quaternion=(h-e).to_track_quat('Z','Y')
        ellipsoid('Portrait thumb',h-shoulder+Vector((-side*.036,-.012,-.008)),(.023,.024,.04),skin,pivot,10,6)
    return root
