"""Deterministic, locally authored bottles and an adaptive ocean mesh. Blender 5.2."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets/yuejing/refined'; OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'reports/book-memories';REPORT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.5,trans=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Transmission Weight'].default_value=trans;n.inputs['IOR'].default_value=1.46;return m
glass=[mat('GlassSeagreen',(.72,.91,.84),.13,.85),mat('GlassSeaBlue',(.73,.85,.94),.13,.85),mat('GlassAmber',(.94,.85,.67),.16,.85)]
paper=mat('IvoryPaper',(.83,.78,.66),.85);cork=mat('NaturalCork',(.38,.24,.12),.96);cord=mat('HempCord',(.40,.30,.19),.92)
# Subtle cork grain; exported material remains supported PBR, no external textures.
nodes=cork.node_tree.nodes;noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=45;bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.2;bump.inputs['Distance'].default_value=.02;cork.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);cork.node_tree.links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
def mesh(name,verts,faces,material,parent=None):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.data.materials.append(material);o.parent=parent
 for p in d.polygons:p.use_smooth=True
 return o
def lathe(name,profile,material,parent,n=64,flatten=1):
 verts=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n)*flatten,z) for r,z in profile for i in range(n)]
 faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(profile)-1) for i in range(n)]
 return mesh(name,verts,faces,material,parent)
def tube(name,points,radius,material,parent):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=2;curve.bevel_depth=radius;curve.bevel_resolution=2;s=curve.splines.new('POLY');s.points.add(len(points)-1)
 for v,pt in zip(s.points,points):v.co=(*pt,1)
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(material);o.parent=parent
 return o
roots=[]
profiles=[[(.015,.03),(.24,.03),(.285,.065),(.30,.13),(.305,.55),(.29,.78),(.25,.87),(.16,.95),(.105,1.04),(.105,1.29),(.12,1.31),(.12,1.36),(.095,1.38)],[(.015,.03),(.26,.03),(.35,.08),(.435,.25),(.46,.49),(.415,.70),(.31,.86),(.19,.95),(.12,1.03),(.12,1.19),(.14,1.22),(.14,1.26),(.11,1.28)],[(.015,.03),(.29,.03),(.35,.08),(.38,.24),(.38,.61),(.34,.76),(.24,.87),(.14,.95),(.12,1.01),(.12,1.18),(.145,1.20),(.145,1.24),(.11,1.26)]]
for i,profile in enumerate(profiles):
 root=bpy.data.objects.new(['BottleSlender','BottleRound','BottleFlask'][i],None);bpy.context.collection.objects.link(root);roots.append(root)
 # Closed inner wall and rounded lip give glass real volume and readable edge reflections.
 inner=[(max(.012,r-.018),z if z>.12 else z+.025) for r,z in reversed(profile)]
 o=lathe('Glass_'+str(i),profile+inner+[profile[0]],glass[i],root,64,.70 if i==2 else 1)
 top=profile[-1][1];plug=lathe('Cork_'+str(i),[(.075,top-.07),(.098,top-.02),(.10,top+.10),(.088,top+.12),(0,top+.12)],cork,root,32,.70 if i==2 else 1)
 # An actual spiral, with uneven paper edges and a visible hollow opening.
 verts=[]
 for j in range(145):
  a=j/144*math.tau*2.25;r=.031+.064*j/144
  for k in range(7):
   z=.25+k*.08+.008*math.sin(j*.18+k*.7);verts.append((r*math.cos(a)+.012*z,r*math.sin(a),z))
 faces=[(j*7+k,(j+1)*7+k,(j+1)*7+k+1,j*7+k+1) for j in range(144) for k in range(6)]
 o=mesh('RolledPaper_'+str(i),verts,faces,paper,root)
 for ring in range(2):
  pts=[(.109*math.cos(a),.109*math.sin(a),.47+ring*.021+.007*math.sin(a*3)) for a in [k/64*math.tau for k in range(65)]];tube('PaperTie_'+str(i)+str(ring),pts,.006,cord,root)
 pts=[(.13*math.cos(k/80*math.tau*2.2),.13*math.sin(k/80*math.tau*2.2),top-.055+k/80*.045) for k in range(81)];tube('NeckCord_'+str(i),pts,.006,cord,root)
 tube('LooseHemp_'+str(i),[(.13,0,top-.025),(.18,.02,top-.10),(.20,.03,top-.25),(.17,.04,top-.34)],.005,cord,root)
 root.location.x=(i-1)*1.3
# Apply transforms of all meshes/curves while retaining bottle hierarchy.
bpy.ops.object.select_all(action='DESELECT')
for o in list(bpy.context.scene.objects):
 if o.type=='CURVE':bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
bpy.ops.object.select_all(action='SELECT')
for r in roots:r.location.x=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sea-bottles.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'sea-bottles.glb'),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
bottle_tris=sum(len(o.data.polygons)*2 for o in bpy.context.scene.objects if o.type=='MESH')
# Inspect the browser asset through a clean glTF import before presentation.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'sea-bottles.glb'))
assert sum(o.name.startswith('Bottle') for o in bpy.context.scene.objects)==3
for o in bpy.context.scene.objects:
 if o.name.startswith('Bottle'):o.location.x=(-1 if 'Slender' in o.name else 0 if 'Round' in o.name else 1)*1.35
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(mat('PreviewGround',(.15,.24,.27),.3));floor.location.z=-.01
world=bpy.context.scene.world or bpy.data.worlds.new('World');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.55,.70,.80,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.6
for loc,power,size in [((0,-3,5),550,4),((3,2,4),750,3),((-3,1,2),500,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3.0,-5.8,2.6));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.65))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.4
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1100;scene.render.resolution_y=620;scene.render.resolution_percentage=100;scene.render.filepath=str(REPORT/'bottles-blender.png');bpy.ops.render.render(write_still=True)
# Dense in the foreground, sparse at the horizon. Continuous runtime waves deform this native mesh.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
n=256;span=750
coords=[span*(.07*(i/n*2-1)+.93*(i/n*2-1)**3) for i in range(n+1)]
verts=[(x,y,0) for y in coords for x in coords];faces=[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(n) for i in range(n)]
o=mesh('AdaptiveOceanSurface',verts,faces,mat('RuntimeWater',(.1,.3,.35),.1))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ocean-surface.blend'));bpy.ops.export_scene.gltf(filepath=str(OUT/'ocean-surface.glb'),export_format='GLB',export_yup=True)
assert len(o.data.vertices)==66049
(REPORT/'model-audit.json').write_text(json.dumps({'bottleTriangles':bottle_tris,'bottleRoots':3,'oceanVertices':len(verts),'oceanTriangles':len(faces)*2,'nearCellWidth':coords[129]-coords[128],'blender':bpy.app.version_string,'roundTrip':'passed','externalAssets':[]},indent=2))
