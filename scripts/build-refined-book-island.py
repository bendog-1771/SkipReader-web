"""Original reading garden, made with local Blender. No external assets/add-ons.
Y-up design coordinates, converted to Blender Z-up before glTF export.
Run: blender -b --factory-startup --disable-autoexec --python-exit-code 1 --python this.py
"""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'yuejing'/'refined'; OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'reports'/'yuejing-refinement'; REPORT.mkdir(parents=True,exist_ok=True)
random.seed(1014)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def xyz(p): return (p[0],-p[2],p[1])
def material(name,colour,rough=.7,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*colour,1)
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*colour,1)
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    return m
stone=material('01 Limestone',(.38,.39,.33))
darkstone=material('02 Strata shadows',(.21,.26,.24))
paving=material('03 Warm terrace',(.67,.64,.53))
grass=material('04 Garden moss',(.24,.40,.28))
leaf=material('05 Sage foliage',(.27,.43,.31))
leaflight=material('06 Sunlit leaves',(.43,.55,.35))
wood=material('07 Walnut wood',(.27,.18,.11))
roof=material('08 Patinated roof',(.13,.29,.27),.5)
paper=material('09 Book paper',(.86,.82,.68))
cloth=material('10 Blue book cloth',(.12,.25,.30))
gold=material('11 Brass',(.64,.43,.20),.34,.6)
glow=material('12 Lantern glass',(.98,.72,.32),.3)
bs=glow.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.56,.17,1);bs.inputs['Emission Strength'].default_value=.7
def finish(o,name,mat,smooth=False):
    o.name=name; o.data.materials.append(mat)
    if o.type=='MESH':
        for face in o.data.polygons: face.use_smooth=smooth
    return o
def mesh(name,vs,faces,mat,smooth=False):
    g=bpy.data.meshes.new(name);g.from_pydata([xyz(v) for v in vs],[],faces);g.update()
    o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);return finish(o,name,mat,smooth)
def cube(name,at,size,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Hand softened edge','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat)
def ico(name,at,scale,mat,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=xyz(at));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,True)
def cylinder(name,at,radius,height,mat,ellipse=1,vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=height,location=xyz(at));o=bpy.context.object;o.scale.y=ellipse;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat)
def tube(name,points,radius,mat,closed=False):
    g=bpy.data.curves.new(name,'CURVE');g.dimensions='3D';g.bevel_depth=radius;g.bevel_resolution=2;g.use_fill_caps=True
    s=g.splines.new('POLY');s.points.add(len(points)-1)
    for v,p in zip(s.points,points):v.co=(*xyz(p),1)
    s.use_cyclic_u=closed;o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return o
def strata():
    n=96;vs=[];radii=[3.85,4.25,4.02,3.62,2.86,1.1];heights=[.16,-.22,-.60,-1.17,-1.96,-2.80]
    for j in range(6):
        for i in range(n):
            a=i/n*math.tau;r=radii[j]*(1+.035*math.sin(a*5+.6)+.025*math.sin(a*13)+random.uniform(-.012,.012));y=heights[j]+random.uniform(-.05,.05)
            vs.append((r*math.cos(a),y,r*.74*math.sin(a)))
    faces=[tuple(reversed(range(n)))]
    for j in range(5):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.extend([(a,b,b+n),(a,b+n,a+n)])
    faces.append(tuple(range(5*n,6*n)));o=mesh('Natural layered island',vs,faces,stone)
    o.data.materials.append(darkstone)
    for f in o.data.polygons:
        if f.center.z < -1 or random.random()<.12:f.material_index=1
strata()
cylinder('Terrace lip',(0,.2,0),3.84,.15,paving,.74,96)
cylinder('Garden bed',(0,.31,0),3.58,.10,grass,.74,96)
cylinder('Reading platform',(.6,.43,-.35),2.28,.18,paving,.80,80)
for r in [2.16,2.23]:tube('Inlaid terrace edge',[(.6+r*math.cos(a),.529,-.35+r*.8*math.sin(a)) for a in [i/100*math.tau for i in range(100)]],.012,gold,True)
for i in range(5):cube('Garden stepping stone',(.6,.35+i*.027,2.40-i*.39),(.83,.12,.29),paving,.05)

# Timber pavilion: open to the reader, books on the back wall, gently curved roof.
cx,cz=1.02,-1.10
cube('Pavilion plinth',(cx,.65,cz),(2.8,.22,2.0),paving,.07)
for x in [-1.18,1.18]:
    for z in [-.80,.80]:
        cube('Timber column',(cx+x,1.77,cz+z),(.13,2.03,.13),wood)
        cube('Column stone foot',(cx+x,.86,cz+z),(.23,.20,.23),paving)
for z in [-.86,.86]:cube('Cross beam',(cx,2.72,cz+z),(2.75,.17,.13),wood)
for x in [-1.2,1.2]:cube('Side beam',(cx+x,2.72,cz),(.15,.15,2.02),wood)
vs=[];n=24
for layer in [0,1]:
    for i in range(n+1):
        x=-1.7+i*3.4/n;y=2.97+.36*(1-(abs(x)/1.7)**.72)+.11*(abs(x)/1.7)**7
        for z in [-1.30,1.30]:vs.append((cx+x,y+layer*.09,cz+z))
offset=(n+1)*2;faces=[]
for i in range(n):
    a=i*2;faces.extend([(a,a+2,a+3,a+1),(a+offset,a+1+offset,a+3+offset,a+2+offset),(a,a+offset,a+2+offset,a+2),(a+1,a+3,a+3+offset,a+1+offset)])
faces.extend([(0,1,1+offset,offset),(n*2,n*2+offset,n*2+1+offset,n*2+1)])
mesh('Curved pavilion roof',vs,faces,roof)
for j in range(15):
    z=cz-1.25+j*2.5/14;points=[]
    for i in range(25):
        x=-1.72+i*3.44/24;y=3.09+.36*(1-(min(abs(x)/1.7,1))**.72)+.11*(abs(x)/1.7)**7;points.append((cx+x,y,z))
    tube('Roof seam',points,.012,gold)
cube('Bookcase back',(cx,1.55,cz-.72),(1.4,1.27,.12),wood)
for y in [.92,1.34,1.77,2.19]:cube('Library shelf',(cx,y,cz-.56),(1.48,.065,.38),wood)
for row in range(3):
    for j in range(12):
        h=random.uniform(.22,.34);o=cube('Shelf book',(cx-.61+j*.111,.99+row*.43+h/2,cz-.51),(.074,h,.25),[cloth,paper,gold][(row+j)%3],.006)
        o.rotation_euler[1]=random.uniform(-.08,.08)
cube('Reading bench',(cx,1.08,cz+.36),(1.56,.12,.45),wood)
for x in [-.62,.62]:cube('Bench leg',(cx+x,.91,cz+.36),(.09,.31,.32),wood)

# One open book with coherent page blocks; avoids the former accordion shape.
bx,bz=-.05,.60
cube('Reading desk',(bx,1.08,bz),(1.6,.13,1.0),wood,.05)
for x in [-.66,.66]:cube('Desk support',(bx+x,.81,bz),(.11,.49,.70),wood)
for side in [-1,1]:
    o=cube('Open book cover',(bx+side*.32,1.18,bz),(.65,.045,.82),cloth,.014);o.rotation_euler[1]=-side*.10
    o=cube('Page block',(bx+side*.32,1.245,bz),(.61,.09,.77),paper,.016);o.rotation_euler[1]=-side*.10
    for j in range(5):tube('Page edge',[(bx+side*.02,1.205+j*.014,bz+.39),(bx+side*.62,1.265+j*.014,bz+.39)],.0035,paving)
    for j in range(6):cube('Printed page line',(bx+side*.33,1.304,bz-.24+j*.074),(.39,.005,.006),wood,0)
tube('Book ribbon',[(bx,1.315,bz-.4),(bx,1.30,bz+.44),(bx-.06,1.14,bz+.55)],.009,gold)

# A sculpted, branching tree with many small foliage groups and a second sapling.
def tree(x,z,height,spread):
    tube('Tree trunk',[(x,.42,z),(x-.1,height*.40,z+.06),(x+.18,height*.68,z),(x+.03,height*.95,z-.05)],.085*spread,wood)
    for i in range(11):
        a=i*2.399;yy=height*(.68+(i%4)*.08);r=spread*(.45+(i%3)*.17);xx=x+math.cos(a)*r;zz=z+math.sin(a)*r*.7
        tube('Tree branch',[(x+.13,height*.62,z),(xx,yy-.17,zz),(xx,yy,zz)],.025*spread,wood)
        for j in range(7):
            phi=j*2.4+i;rr=random.uniform(.10,.32)*spread
            ico('Leaf cluster',(xx+math.cos(phi)*rr,yy+random.uniform(.0,.19)*spread,zz+math.sin(phi)*rr),(.25*spread,.17*spread,.23*spread),leaflight if (i+j)%4==0 else leaf,1)
tree(-2.10,-.25,3.15,1.08);tree(-2.0,1.33,1.61,.57)
for i in range(30):
    a=i*2.399;r=2.70+random.random()*.73;at=(math.cos(a)*r,.40,math.sin(a)*r*.74)
    ico('Border shrub',at,(.25,.17,.23),leaf if i%3 else leaflight,1)
for i in range(19):
    a=i*2.399;r=3.35+random.random()*.4
    ico('Weathered rock',(math.cos(a)*r,.36,math.sin(a)*r*.74),(.22,.16,.17),stone,1)
for x,z in [(-.94,1.92),(2.46,.69)]:
    cube('Lantern foot',(x,.52,z),(.25,.21,.25),paving)
    cube('Lantern post',(x,.85,z),(.07,.65,.07),wood)
    cube('Lantern glass',(x,1.24,z),(.20,.26,.20),glow,.018)
    cube('Lantern cap',(x,1.40,z),(.32,.06,.32),roof)
    for dx in [-.11,.11]:
        for dz in [-.11,.11]:cube('Lantern frame',(x+dx,1.24,z+dz),(.022,.31,.022),gold,.004)
for i in range(6):
    a=i*2.4;o=cube('FloatingPage_'+str(i),(math.cos(a)*3.20,2.50+math.sin(a)*.6,math.sin(a)*2.15),(.40,.018,.53),paper,.014)
    o.rotation_euler=(.15*math.sin(a),.20*math.cos(a),a*.15)

# Convert curves, apply scale, repair normals, join static geometry by material.
bpy.ops.object.select_all(action='DESELECT')
for o in list(bpy.context.scene.objects):
    if o.type=='CURVE':
        o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
for o in bpy.context.scene.objects:
    o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False)
groups={}
for o in list(bpy.context.scene.objects):
    if o.type=='MESH' and not o.name.startswith('FloatingPage'):groups.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
for mats,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='Garden_'+mats[0]
import bmesh
triangles=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
        o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
for m in list(bpy.data.materials):
    if m.users==0:bpy.data.materials.remove(m)
if triangles>70000:raise RuntimeError('Island exceeds triangle budget: '+str(triangles))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'book-island.glb'),export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'reading-garden.blend'))
(REPORT/'model-build.json').write_text(json.dumps({'blender':bpy.app.version_string,'triangles':triangles,'materials':12,'seed':1014,'up':'Y in glTF','source':str(OUT/'reading-garden.blend')},indent=2),encoding='utf-8')

# Clean re-import catches missing materials and export-scale differences.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'book-island.glb'))
imported=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();imported+=len(o.data.loop_triangles)
if imported!=triangles:raise RuntimeError('Re-import triangle count differs')
bpy.ops.wm.save_as_mainfile(filepath=str(REPORT/'reimported-garden.blend'))
# Neutral three-quarter, side, back and top renders. No user Blender settings touched.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for at,power,size in [((4,-5,10),1400,7),((-5,2,6),900,6)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=11.5
for name,at in [('three-quarter',(8,-13,9)),('side',(-12,-2,6)),('back',(0,14,7)),('top',(0,-.1,18))]:
    camera.location=at;camera.rotation_euler=(Vector((0,0,.2))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(REPORT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('REFINED_ISLAND_READY',triangles,'triangles',imported,'reimported')
