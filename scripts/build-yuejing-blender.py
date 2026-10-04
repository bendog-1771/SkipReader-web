"""Original cloud library island and spectral ocean, built with local Blender."""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets'/'yuejing';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);random.seed(714)
def xyz(p):return (p[0],-p[2],p[1])
def mat(name,color,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1)
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m
stone=mat('Warm island stone',(.28,.24,.20));moss=mat('Moss cushion',(.21,.35,.28));leaf=mat('Bonsai leaves',(.12,.28,.24));bark=mat('Bonsai trunk',(.23,.16,.11));gold=mat('Brushed gold',(.68,.49,.24),.36,.5);paper=mat('Ivory leaves',(.82,.76,.62));cloth=mat('Indigo book cloth',(.10,.22,.29));sand=mat('Path stones',(.55,.53,.43))
def finish(o,name,m,smooth=True):
    o.name=name;o.data.materials.append(m)
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=smooth
    return o
def mesh(name,vertices,faces,m,smooth=True):
    g=bpy.data.meshes.new(name);g.from_pydata([xyz(p) for p in vertices],[],faces);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);return finish(o,name,m,smooth)
def box(name,at,size,m,bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,m)
def sphere(name,at,scale,m,sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=xyz(at));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);return finish(o,name,m)
def curve(name,points,r,m,closed=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('POLY');s.points.add(len(points)-1)
    for v,p in zip(s.points,points):v.co=(*xyz(p),1)
    s.use_cyclic_u=closed;o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(m);return o
def page(name,width,depth,height,thickness,at,m):
    vs=[];faces=[];n=26
    for layer in [0,1]:
        for j in range(n+1):
            x=-width/2+width*j/n; y=height+.18*(abs(x)/(width/2))**1.8+.09*math.sin(x*1.7)
            for z in [-depth/2,depth/2]:vs.append((x+at[0],y+at[1]+layer*thickness,z+at[2]))
    offset=(n+1)*2
    for j in range(n):
        a=j*2;faces.extend([(a,a+2,a+3,a+1),(a+offset,a+1+offset,a+3+offset,a+2+offset),(a,a+offset,a+2+offset,a+2),(a+1,a+3,a+3+offset,a+1+offset)])
    faces.extend([(0,1,1+offset,offset),(n*2,n*2+offset,n*2+1+offset,n*2+1)])
    return mesh(name,vs,faces,m)

# Layered, irregular floating land, a curved open book and a sculpted bonsai.
N=56;vertices=[]
for ring in range(4):
    for i in range(N):
        a=i/N*math.tau;r=[4.3,4.65,3.1,.65][ring]*(1+.07*math.sin(i*2.8)+random.uniform(-.03,.03));y=[.05,-.6,-2.2,-3.8][ring]+random.uniform(-.17,.17)
        vertices.append((math.cos(a)*r,y,math.sin(a)*r*.75))
faces=[]
for ring in range(3):
    for i in range(N):a=ring*N+i;b=ring*N+(i+1)%N;faces.extend([(a,b,b+N),(a,b+N,a+N)])
faces.extend([tuple(range(N)),tuple(range(3*N,4*N))]);mesh('Island strata',vertices,faces,stone,False)
sphere('Living moss',(0,.12,0),(4.4,.36,3.35),moss,3)
box('Book pedestal',(.7,.42,.0),(3.6,.25,2.4),sand,.18)
page('Open book cover',3.8,2.2,.0,.075,(.7,.64,0),cloth)
for j in range(14):page('Book leaf '+str(j),3.55-j*.018,2.05-j*.005,.0,.012,(.7,.72+j*.018,0),paper)
curve('Book spine',[(.7,.95,-1.03),(.7,1.02,0),(.7,.95,1.03)],.025,gold)
for i in range(5):box('Stepping stone',(.65,.2+i*.025,2.7-i*.34),(1.1,.12,.27),sand,.05)
trunk=[(-2.3,.3,.1),(-2.5,1,.0),(-2.2,1.6,.1),(-2.0,2.1,.05),(-2.4,2.75,.1)]
curve('Bonsai trunk',trunk,.14,bark)
for i in range(7):
    x=-2.4+math.sin(i*2.4)*.8;y=2.2+(i%3)*.4;z=math.cos(i*2.4)*.55
    curve('Bonsai branch',[(-2.15,1.8,.0),(x,y-.25,z),(x,y,z)],.045,bark)
    sphere('Bonsai crown',(x,y+.18,z),(1.0,.39,.7),leaf,2)
for i in range(16):
    a=i*2.4;r=2.9+random.random()*.8;sphere('River stone',(math.cos(a)*r,.22,math.sin(a)*r*.73),(.19,.12,.15),sand,1)
for i in range(9):
    a=i*2.5;at=(math.cos(a)*2.9,2.9+math.sin(a)*1.25,math.sin(a)*2.1)
    o=page('FloatingPage_'+str(i),.6+random.random()*.45,.5,0,.018,at,paper);o.rotation_euler[2]=a*.22
curve('Celestial arch',[(3.1*math.cos(a),2+3.1*math.sin(a),-2.2) for a in [i/90*math.pi for i in range(91)]],.035,gold)
sphere('Reading moon',(1.25,4.15,-2.4),(.5,.5,.5),gold,3)
island_objects=list(bpy.context.scene.objects)
for o in island_objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'book-island.glb'),export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
for o in island_objects:o.select_set(False);o.hide_set(True)

# Blender's FFT ocean. Four matching topology samples become browser morph targets.
bpy.ops.mesh.primitive_plane_add(size=2);source=bpy.context.object;source.name='Ocean simulation source'
ocean=source.modifiers.new('Blender spectral ocean','OCEAN');ocean.geometry_mode='GENERATE';ocean.resolution=12;ocean.viewport_resolution=12;ocean.spatial_size=120;ocean.wave_scale=.62;ocean.choppiness=.78;ocean.wind_velocity=13;ocean.wave_scale_min=.18;ocean.random_seed=14
samples=[];deps=bpy.context.evaluated_depsgraph_get()
for t in [0,2,4,6]:
    ocean.time=t;deps.update();evaluated=source.evaluated_get(deps);g=bpy.data.meshes.new_from_object(evaluated,depsgraph=deps);samples.append(g)
base=samples[0];water=bpy.data.objects.new('BlenderOcean',base);bpy.context.collection.objects.link(water);water.data.materials.append(mat('Spectral sea',(.03,.17,.22),.24))
for p in base.polygons:p.use_smooth=True
water.shape_key_add(name='Basis')
for j,g in enumerate(samples[1:]):
    if len(g.vertices)!=len(base.vertices):raise RuntimeError('Ocean topology changed')
    key=water.shape_key_add(name='Wave sample '+str(j+1))
    for a,b in zip(key.data,g.vertices):a.co=b.co
bpy.ops.object.select_all(action='DESELECT');water.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'ocean.glb'),export_format='GLB',use_selection=True,export_animations=False,export_apply=False,export_morph=True,export_morph_normal=True)
source.hide_set(True);water.hide_set(True)
for o in island_objects:o.hide_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'yuejing-scenes.blend'))
print('YUEJING_READY',len(base.vertices),'ocean vertices',OUT)
