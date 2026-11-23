"""Portrait head with an identity-preserving face atlas and shaped facial relief."""
import bpy
import math
from pathlib import Path


def build_portrait_head(root, head, kit, skin, hair, beard):
    make_mesh, ellipsoid = kit['mesh'], kit['ellipsoid']
    head.scale=(1.08,1.04,1.04)
    atlas=Path(__file__).resolve().parents[2]/'grafika/kibice/13-twarz-albedo-v2.png'
    if not atlas.is_file():
        raise FileNotFoundError('Missing personal face atlas: '+str(atlas))
    image=bpy.data.images.load(str(atlas),check_existing=True)
    image.pack()
    material=bpy.data.materials.new('Oski face • portrait atlas v2')
    material.use_nodes=True
    principled=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    principled.inputs['Roughness'].default_value=.88
    principled.inputs['Specular IOR Level'].default_value=.18
    texture=material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image=image
    material.node_tree.links.new(texture.outputs['Color'],principled.inputs['Base Color'])
    root['face_surface']='portrait-atlas-v2'

    def sample(z, profile):
        for (za,va),(zb,vb) in zip(profile,profile[1:]):
            if za>=z>=zb:
                t=(za-z)/(za-zb)
                return va*(1-t)+vb*t
        return profile[0][1] if z>profile[0][0] else profile[-1][1]

    widths=[(.185,.080),(.150,.108),(.110,.122),(.05,.127),(0,.124),(-.06,.110),(-.10,.085),(-.135,.04)]
    depths=[(.185,.070),(.120,.105),(.05,.114),(0,.108),(-.07,.092),(-.135,.05)]
    rows=25; cols=32
    vertices=[]; uvs=[]; faces=[]
    for row in range(rows):
        z=.185-row/(rows-1)*.320
        width=sample(z,widths); depth=sample(z,depths)
        for col in range(cols+1):
            angle=-math.pi/2+col/cols*math.pi
            x=width*math.sin(angle)
            y=.008-depth*math.cos(angle)
            # A fused nose bridge/tip and soft cheeks preserve a real 3D profile.
            nose=.027*math.exp(-.5*((x/.021)**2+((z-.003)/.035)**2))
            cheeks=.0035*math.exp(-.5*(((abs(x)-.066)/.025)**2+((z-.009)/.035)**2))
            y-=nose+cheeks
            vertices.append((x,y,z))
            uvs.append((.5+x/(2*.128),(z+.135)/.320))
    stride=cols+1
    for row in range(rows-1):
        for col in range(cols):
            a=row*stride+col
            faces.append((a,a+stride,a+stride+1,a+1))
    face=make_mesh('Oski recognizable face',vertices,faces,material,head)
    face['surface']='portrait-atlas-v2'
    uv=face.data.uv_layers.new(name='PortraitUV')
    for polygon in face.data.polygons:
        polygon.use_smooth=True
        for index in polygon.loop_indices:
            uv.data[index].uv=uvs[face.data.loops[index].vertex_index]

    # Back of the head shares its contour with the textured front at both ears.
    back_vertices=[]; upper=[]; lower=[]; back_cols=16
    for row in range(rows):
        z=.185-row/(rows-1)*.320
        width=sample(z,widths); depth=sample(z,depths)
        for col in range(back_cols+1):
            angle=math.pi/2+col/back_cols*math.pi
            back_vertices.append((width*math.sin(angle),.008-depth*math.cos(angle),z))
    for row in range(rows-1):
        bucket=upper if (.185-row/(rows-1)*.320)>-.015 else lower
        for col in range(back_cols):
            a=row*(back_cols+1)+col
            bucket.append((a,a+back_cols+1,a+back_cols+2,a+1))
    for name, polygons, mat in [('Oski rear head',upper,skin),('Oski beard sides',lower,beard)]:
        obj=make_mesh(name,back_vertices,polygons,mat,head)
        for p in obj.data.polygons: p.use_smooth=True
    for side in (-1,1):
        ellipsoid('Oski ear',(side*.124,.012,.026),(.025,.021,.041),skin,head,12,8)

    # Hair stays a volume, with the forehead exposed down to the photo hairline.
    vertices=[]; faces=[]; n=20
    rings=[(.065,.129,.115),(.174,.116,.103),(.220,.079,.063),(.245,.019,.020)]
    for k,(z,rx,ry) in enumerate(rings):
        for j in range(n):
            a=2*math.pi*j/n
            zz=z+(.101*max(0,-math.sin(a)) if k==0 else .007*math.sin(j*1.7))
            vertices.append((rx*math.cos(a)+(.012 if k>=2 else 0),.012+ry*math.sin(a),zz))
    for k in range(len(rings)-1):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    faces.append(tuple((len(rings)-1)*n+j for j in range(n)))
    make_mesh('Oski short swept hair',vertices,faces,hair,head)
