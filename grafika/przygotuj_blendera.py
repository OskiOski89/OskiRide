"""Import all four authored GLB designs as an editable Blender review scene."""

import json
from pathlib import Path
from mathutils import Vector
import bpy


ROOT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1800
scene.render.resolution_y = 1400
scene.render.resolution_percentage = 100
scene.render.fps = 60
scene.frame_start = 1
scene.frame_end = 61
scene.world.color = (.32, .32, .30)

manifest = json.loads((ROOT / 'modele.json').read_text(encoding='utf-8'))
for i, design in enumerate(manifest):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / design['file']))
    imported = set(bpy.data.objects) - before
    collection = bpy.data.collections.new(f"{design['number']} {design['title']}")
    scene.collection.children.link(collection)
    for obj in imported:
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        collection.objects.link(obj)
        if obj.parent is None:
            obj.location.x += -1.2 if i % 2 == 0 else 1.2
            obj.location.y += -1.15 if i < 2 else 1.15
    collection['shared_kinematics'] = 'kinematyka.js'
    collection['design'] = design['id']

floor_mat = bpy.data.materials.new('Studio_Sand')
floor_mat.diffuse_color = (.73, .70, .63, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.005))
floor = bpy.context.object
floor.name = 'Studio_Floor'
floor.data.materials.append(floor_mat)

def area(name, location, power, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, .7)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

area('Softbox_Key', (1, -3, 6), 1800, 5, (1, .91, .79))
area('Softbox_Fill', (-4, -1, 3), 1100, 5, (.80, .88, 1))
area('Softbox_Rim', (1, 4, 5), 1600, 4, (1, 1, 1))
camera = bpy.data.cameras.new('Review_Camera')
camera_obj = bpy.data.objects.new('Review_Camera', camera)
scene.collection.objects.link(camera_obj)
camera_obj.location = (5.0, -8.5, 5.5)
camera_obj.rotation_euler = (Vector((0, 0, .65)) - camera_obj.location).to_track_quat('-Z', 'Y').to_euler()
camera.type = 'ORTHO'
camera.ortho_scale = 6.7
scene.camera = camera_obj
scene.frame_set(20)
for area_ui in bpy.context.screen.areas if bpy.context.screen else []:
    if area_ui.type == 'VIEW_3D':
        area_ui.spaces.active.region_3d.view_distance = 7
        area_ui.spaces.active.region_3d.view_location = Vector((0, 0, .7))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'kolarz.blend'))
print(json.dumps({'saved': str(ROOT / 'kolarz.blend'), 'designs': len(manifest),
                  'armatures': sum(obj.type == 'ARMATURE' for obj in bpy.data.objects),
                  'animations': len(bpy.data.actions)}))
