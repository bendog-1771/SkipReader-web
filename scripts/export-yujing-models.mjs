// Optional development export. It contains geometry only, never reader data.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SceneEngine} from '../src/web/yujing/scene-engine.js';
globalThis.FileReader=class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result='data:'+blob.type+';base64,'+Buffer.from(value).toString('base64');this.onloadend?.();});}
};
const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../SkipReader-art-lab/models');
fs.mkdirSync(output,{recursive:true});
for(const [filename,groupName,builder]of [['train-landscape.glb','land','buildTrain'],['word-orbit.glb','orbit','buildOrbit']]){
 const host={[groupName]:new THREE.Group()};
 SceneEngine.prototype[builder].call(host);
 const model=host[groupName];model.name=filename.replace('.glb','');
 const converted=new Map();
 model.traverse(object=>{const old=object.material;if(!old||!(old.isMeshLambertMaterial||old.isMeshPhongMaterial))return;if(!converted.has(old))converted.set(old,new THREE.MeshStandardMaterial({color:old.color,roughness:old.isMeshPhongMaterial?.35:.8,transparent:old.transparent,opacity:old.opacity,side:old.side}));object.material=converted.get(old);});
 const wireMeshes=[];model.traverse(object=>{if(object.material?.wireframe)wireMeshes.push(object);});
 for(const mesh of wireMeshes){const lines=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:mesh.material.color,transparent:true,opacity:mesh.material.opacity}));lines.position.copy(mesh.position);lines.rotation.copy(mesh.rotation);mesh.parent.add(lines);mesh.parent.remove(mesh);}
 const binary=await new GLTFExporter().parseAsync(model,{binary:true});
 const bytes=Buffer.from(binary);if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB export');
 const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());if(!json.meshes?.length||!json.scenes?.length)throw new Error('Missing model meshes');
 fs.writeFileSync(path.join(output,filename),bytes);
 console.log(filename+': '+bytes.length+' bytes');
}
