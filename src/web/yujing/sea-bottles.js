import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import bottlesURL from '../../../assets/yuejing/refined/sea-bottles.glb';
export function loadRefinedBottles(e){
 e.models.bottles='loading';new GLTFLoader().load(new URL(bottlesURL,import.meta.url).href,gltf=>{
  if(e.disposed){gltf.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});return;}
  const names=['BottleSlender','BottleRound','BottleFlask'];
  names.forEach((name,i)=>{const asset=gltf.scene.getObjectByName(name),b=e.bottles.children[i];if(!asset)return;
   for(const child of [...b.children]){child.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});b.remove(child);}
   asset.removeFromParent();asset.position.set(0,0,0);asset.traverse(o=>{if(!o.isMesh)return;const m=o.material;m.envMap=e.bottleEnvironment?.texture;m.envMapIntensity=1.15;
    if(o.name.startsWith('Glass')){o.material=new T.MeshPhysicalMaterial({color:m.color,roughness:.12,metalness:0,transmission:.83,thickness:.045,ior:1.46,attenuationDistance:2.4,attenuationColor:m.color,envMap:e.bottleEnvironment?.texture,envMapIntensity:1.15,clearcoat:.18,transparent:true,opacity:1,side:T.DoubleSide,depthWrite:false});m.dispose();}
    else if(o.name.startsWith('RolledPaper')){m.side=T.DoubleSide;m.roughness=.9;}
   });b.add(asset);
  });e.models.bottles='ready';e.dirty=true;
 },undefined,()=>{if(!e.disposed)e.models.bottles='fallback';});
}
export function updateBottleEnvironment(e){
 const p=e.palette,key=[p.top,p.horizon,p.water,p.sun].join('|');if(e.bottleEnvKey===key)return;e.bottleEnvKey=key;
 const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,p.top);g.addColorStop(.46,p.horizon);g.addColorStop(.54,p.sun);g.addColorStop(.65,p.water);g.addColorStop(1,p.water);x.fillStyle=g;x.fillRect(0,0,512,256);
 for(const [left,width] of [[60,25],[220,13],[390,36]]){const glow=x.createLinearGradient(left,0,left+width,0);glow.addColorStop(0,'#ffffff00');glow.addColorStop(.5,p.sun+'aa');glow.addColorStop(1,'#ffffff00');x.fillStyle=glow;x.fillRect(left,25,width,130);}
 const texture=new T.CanvasTexture(c);texture.mapping=T.EquirectangularReflectionMapping;texture.colorSpace=T.SRGBColorSpace;const pmrem=new T.PMREMGenerator(e.renderer);pmrem.compileEquirectangularShader();const target=pmrem.fromEquirectangular(texture);texture.dispose();pmrem.dispose();
 e.bottleEnvironment?.dispose();e.bottleEnvironment=target;e.bottles.traverse(o=>{if(o.material){o.material.envMap=target.texture;o.material.envMapIntensity=1.15;o.material.needsUpdate=true;}});
}
export function buildBottles(){
 const group=new T.Group(),styles=['slender','round','flask'];
 for(let i=0;i<3;i++){
  const b=new T.Group();b.userData.style=styles[i];b.userData.index=i;
  const shape=i===1?[[0,0],[.28,0],[.43,.18],[.5,.45],[.46,.7],[.23,.88],[.13,.96],[.13,1.28],[.17,1.28]]:i===2?[[0,0],[.33,0],[.37,.1],[.4,.68],[.29,.83],[.12,.95],[.12,1.28],[.16,1.28]]:[[0,0],[.25,0],[.31,.08],[.31,.72],[.22,.86],[.10,.98],[.10,1.42],[.14,1.42]];
  const glass=new T.Mesh(new T.LatheGeometry(shape.map(([x,y])=>new T.Vector2(x,y)),32),new T.MeshPhysicalMaterial({color:['#92c8b8','#90bcd0','#bdab83'][i],metalness:.08,roughness:.13,transparent:true,opacity:.46,clearcoat:1,clearcoatRoughness:.12,side:T.DoubleSide,depthWrite:false}));glass.userData.glass=true;b.add(glass);
  const cork=new T.Mesh(new T.CylinderGeometry(i===0?.115:.145,i===0?.10:.13,.16,16),new T.MeshStandardMaterial({color:0x8d6f47,roughness:.95}));cork.position.y=i===0?1.43:1.29;b.add(cork);
  const paper=new T.Mesh(new T.CylinderGeometry(.11,.11,.60,12),new T.MeshStandardMaterial({color:0xeee3cc,roughness:.8}));paper.position.y=.48;paper.rotation.z=-.18+i*.12;b.add(paper);
  const ribbon=new T.Mesh(new T.TorusGeometry(.11,.018,6,16),new T.MeshStandardMaterial({color:0x89734c,roughness:.7}));ribbon.position.copy(paper.position);ribbon.rotation.x=Math.PI/2;b.add(ribbon);
  const glint=new T.Mesh(new T.CylinderGeometry(.01,.01,.4,8),new T.MeshBasicMaterial({color:0xf6f9ed,transparent:true,opacity:.65}));glint.position.set(-.18,.5,.2);b.add(glint);
  if(i===2)b.scale.z=.58;b.scale.multiplyScalar(.65);group.add(b);
 }return group;
}
export function waveHeight(x,z,time,energy){
 let h=0;for(const [dx,dz,length,amp] of [[.8,.6,48,.30],[-.35,1,23,.16],[.95,-.31,13,.07],[.23,.97,8.7,.033]]){const norm=Math.hypot(dx,dz),k=Math.PI*2/length;h+=amp*(1+energy*.65)*Math.sin(k*(dx*x+dz*z)/norm-Math.sqrt(9.81*k)*time);}return h;
}
export function animateBottles(e,t){
 if(!e.bottles)return;const count=e.width<760?2:3;
 const mobile=count===2,departing=e.bottles.children.findIndex(b=>t-(b.userData.castAt??-1000)>=0&&t-(b.userData.castAt??-1000)<7);
 e.bottles.visible=e.settings.scene==='ocean'&&!e.settings.reading&&e.settings.bottlesEnabled!==false&&['ready','fallback'].includes(e.models.bottles);
 e.bottles.children.forEach((b,i)=>{
  b.visible=mobile&&departing===2?i!==1:i<count;const age=t-(b.userData.castAt??-1000),departure=age>=0&&age<7?age/7:0;
  const x=(mobile?[-2.4,2.1,.4]:[-7.8,5.6,1.8])[i]+Math.sin(t*.09+i*2)*(mobile?.22:.7),z=[-5,1,-17][i]-departure*18;
  b.position.set(x,waveHeight(x,z,t,e.seaResponse)-.08,z);b.rotation.set(.10*Math.sin(t*.5+i),t*.035+i,.94+.09*Math.sin(t*.7+i));
  b.scale.setScalar(.78*(1-departure*.8));
 });
}
