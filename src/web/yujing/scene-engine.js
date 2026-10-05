import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import oceanURL from '../../../assets/yuejing/refined/ocean-surface.glb';
import { drawBookMemories } from './book-memories';
import { scenePalette } from './palette';
import { atmosphereGLSL } from './sky-shader';
import { configureSkyAsset, skyUniforms } from './sky-assets';
import { oceanVertex, oceanFragment } from './ocean-shader';
import { drawWind } from './wind-field';
import { RenderBudget } from './render-budget';
import { buildBottles, animateBottles, loadRefinedBottles, updateBottleEnvironment } from './sea-bottles';
function disposeObject(root){const g=new Set(),m=new Set(),textures=new Set();root?.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const a of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){m.add(a);for(const v of Object.values(a))if(v?.isTexture)textures.add(v);}});textures.forEach(t=>t.dispose());g.forEach(v=>v.dispose());m.forEach(v=>v.dispose());}
export class SceneEngine {
 constructor(host,onPick,onFailure){
  this.budget=new RenderBudget();this.pointerInside=false;this.host=host;this.onPick=onPick;this.onFailure=onFailure;this.quotes=[];this.words=[];this.energy={bass:0,mid:0,high:0,level:0};this.time=0;this.last=0;this.pulse=0;this.gustPower=0;this.pointer=new T.Vector2();this.pointerTarget=new T.Vector2();this.scratch=new T.Vector3();this.raycaster=new T.Raycaster();this.pickPoint=new T.Vector2();this.holdColor=new T.Color();this.windCache=new Map();this.pointerVelocity=new T.Vector2();this.lastPointerAt=-1000;this.seaResponse=0;this.dirty=true;this.settings={scene:'wind',mood:'dusk',speed:.7,intensity:.85,paused:false,soundStrength:1.8,theme:'paper',matchTheme:false};this.palette=scenePalette(this.settings);this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.models={ocean:'idle',island:'retired',bottles:'idle'};this.disposed=false;
  this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','随风生成的书中摘录');host.append(this.canvas);this.ctx=this.canvas.getContext('2d');
  this.move=e=>{this.pointerInside=true;const now=performance.now(),elapsed=Math.max(.016,(now-this.lastPointerAt)/1000),oldX=(this.pointerTarget.x+1)*this.width/2,oldY=(1-this.pointerTarget.y)*this.height/2;this.pointerVelocity.set((e.clientX-oldX)/elapsed,(e.clientY-oldY)/elapsed);this.pointerTarget.set(e.clientX/Math.max(1,this.width)*2-1,1-e.clientY/Math.max(1,this.height)*2);this.lastPointerAt=now;const st=this.starTarget,hover=this.settings.scene==='orbit'&&!this.settings.game&&!this.settings.reading&&st&&Math.hypot(e.clientX-st.x,e.clientY-st.y)<st.r&&!e.target.closest('button,input,a,select,textarea,.context-menu');if(Boolean(hover)!==Boolean(this.hoveredStar)){this.hoveredStar=Boolean(hover);this.dirty=true;if(hover)document.documentElement.dataset.yjStarHover='true';else delete document.documentElement.dataset.yjStarHover;}this.updateBottleHover(e);if(this.starPress&&Math.hypot(e.clientX-this.starPress.x,e.clientY-this.starPress.y)>12){this.cancelStar();}};
  this.pick=e=>{if(e.button!==0||!e.isPrimary)return;if(e.target.closest('button,input,select,textarea,a,[role=dialog],.reader-text,.yj-panel,.yj-overlay,.library-book,.library-sidebar,.library-topbar,.context-menu')&&!e.target.closest('.yj-orbit-window'))return;if(this.settings.scene==='wind'||this.settings.game&&this.settings.focusedGame)return;if(!this.camera)return;const ray=this.raycaster;ray.setFromCamera(this.pickPoint.set(e.clientX/this.width*2-1,1-e.clientY/this.height*2),this.camera);
   if(this.settings.game&&this.labels){const hit=ray.intersectObjects(this.labels.filter(l=>l.visible))[0];if(hit)this.onPick?.(hit.object.userData.index);}
   else if(this.settings.scene==='orbit'&&!this.settings.reading&&ray.intersectObject(this.core)[0]){this.cancelStar();this.dirty=true;this.starPress={x:e.clientX,y:e.clientY,id:e.pointerId,started:performance.now()};this.starTimer=setTimeout(()=>{if(this.starPress&&document.hasFocus()&&!document.hidden&&this.settings.scene==='orbit'&&!this.settings.game&&!this.settings.reading){this.holdGlowAt=performance.now();this.cancelStar();this.onStar?.();}else this.cancelStar();},900);}
   else if(this.settings.scene==='ocean'&&!this.settings.reading&&this.bottles?.visible){const hit=ray.intersectObjects(this.bottles.children.filter(b=>b.visible),true)[0];if(hit){let b=hit.object;while(b.parent!==this.bottles)b=b.parent;this.selectedBottle=b.userData.index;this.onBottle?.();}else this.transition();}
  };
  this.cancelStar=()=>{clearTimeout(this.starTimer);this.starTimer=undefined;this.starPress=null;this.holdProgress=0;this.dirty=true;};
  this.release=e=>{if(this.starPress?.id===e.pointerId)this.cancelStar();};
  this.leave=()=>{this.pointerInside=false;this.hoveredStar=false;this.hoveredBottle=false;delete document.documentElement.dataset.yjStarHover;delete document.documentElement.dataset.yjBottleHover;this.cancelStar();};
  this.visibility=()=>{document.documentElement.dataset.yjSleeping=String(document.hidden);this.leave();this.last=0;this.budget.warmup=performance.now()+2000;};
  window.addEventListener('blur',this.leave);document.addEventListener('pointerleave',this.leave);document.addEventListener('visibilitychange',this.visibility);
  this.scroll=()=>{this.dirty=true;this.updateFocusBounds();};window.addEventListener('scroll',this.scroll,{capture:true,passive:true});window.addEventListener('pointermove',this.move);window.addEventListener('pointerdown',this.pick);window.addEventListener('pointerup',this.release);window.addEventListener('pointercancel',this.release);this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
 }
 initialize3D(){if(this.renderer||this.renderError)return;try{
  this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(this.budget.dpr);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.shadowMap.enabled=false;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.setClearColor(0,0);this.renderer.domElement.setAttribute('aria-label','Blender 海洋与词语星轨');this.host.append(this.renderer.domElement);this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(54,1,.1,1800);this.oceanCamera=this.camera;this.orbitCamera=new T.OrthographicCamera(-10,10,10,-10,.1,1800);this.hemi=new T.HemisphereLight(0xc5e0e8,0x273f48,2);this.scene.add(this.hemi);this.light=new T.DirectionalLight(0xffdfb3,2.6);this.light.position.set(-18,28,12);this.scene.add(this.light);this.light.shadow.mapSize.set(1024,1024);Object.assign(this.light.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.5,far:100});this.light.shadow.bias=-.0005;this.light.shadow.normalBias=.02;
  this.sunDir=new T.Vector3(-.38,.16,-1).normalize();this.sky=new T.Mesh(new T.SphereGeometry(1500,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{...skyUniforms(),time:{value:0},weather:{value:2},night:{value:0},top:{value:new T.Color()},horizon:{value:new T.Color()},glow:{value:new T.Color()},sun:{value:this.sunDir}},vertexShader:'varying vec3 d;void main(){d=(modelMatrix*vec4(position,1.)).xyz-cameraPosition;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 d;uniform float time,weather,night;uniform vec3 top,horizon,glow,sun;${atmosphereGLSL}void main(){gl_FragColor=vec4(atmosphere(normalize(d),top,horizon,glow,sun,time),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`}));this.scene.add(this.sky);
  this.oceanGroup=new T.Group();this.island=new T.Group();this.orbit=new T.Group();this.scene.add(this.oceanGroup,this.island,this.orbit);this.buildOcean();this.buildOrbit();this.resize();
 }catch(e){this.renderError=true;this.onFailure?.();}}
 updateFocusBounds(){this.focusBounds=this.settings.focusedGame?document.querySelector('.yj-game-card')?.getBoundingClientRect():null;}
 updateBottleHover(event){
  const blocked=event?.target?.closest?.('button,input,select,textarea,a,[role=dialog],.library-book,.library-sidebar,.library-topbar,.yj-panel,.context-menu');
  if(blocked||this.settings.scene!=='ocean'||this.settings.reading||this.settings.game||!this.bottles?.visible){this.hoveredBottle=false;delete document.documentElement.dataset.yjBottleHover;return;}
  const now=performance.now();if(now-(this.lastBottleHover||0)<75)return;this.lastBottleHover=now;
  const point=this.pickPoint.set(this.pointerTarget.x,this.pointerTarget.y);this.raycaster.setFromCamera(point,this.camera);
  const candidates=this.bottles.children.filter(b=>{if(!b.visible)return false;this.scratch.set(0,.6,0);b.localToWorld(this.scratch).project(this.camera);return Math.hypot((this.scratch.x-point.x)*this.width/2,(this.scratch.y-point.y)*this.height/2)<95;});
  this.hoveredBottle=candidates.length>0&&this.raycaster.intersectObjects(candidates,true).length>0;
  if(this.hoveredBottle)document.documentElement.dataset.yjBottleHover='true';else delete document.documentElement.dataset.yjBottleHover;
 }
 buildOcean(){
  this.seaMaterial=new T.ShaderMaterial({uniforms:{...skyUniforms(),time:{value:0},energy:{value:0},detail:{value:1},weather:{value:2},night:{value:0},top:{value:new T.Color()},horizon:{value:new T.Color()},glow:{value:new T.Color()},sun:{value:this.sunDir},deep:{value:new T.Color()}},vertexShader:oceanVertex,fragmentShader:oceanFragment});
  const fallback=new T.PlaneGeometry(480,480,144,144);fallback.rotateX(-Math.PI/2);this.water=new T.Mesh(fallback,this.seaMaterial);this.oceanGroup.add(this.water);this.bottles=buildBottles();this.oceanGroup.add(this.bottles);
 }
 loadModel(name){if(this.models[name]!=='idle')return;this.models[name]='loading';new GLTFLoader().load(new URL(oceanURL,import.meta.url).href,gltf=>{if(this.disposed){disposeObject(gltf.scene);return;}this.dirty=true;gltf.scene.updateMatrixWorld(true);
  if(name==='ocean'){let source;gltf.scene.traverse(o=>{if(o.isMesh&&!source)source=o;});if(!source){this.models.ocean='failed';return;}this.oceanGroup.remove(this.water);this.water.geometry.dispose();source.material.dispose();source.removeFromParent();this.water=source;this.water.material=this.seaMaterial;this.water.scale.set(1,1,1);this.highSeaGeometry=source.geometry;this.oceanGroup.add(source);this.models.ocean='ready';this.applyBudget();}

 },undefined,()=>{if(!this.disposed){this.models[name]='failed';this.onFailure?.();}});}
 buildOrbit(){
  this.core=new T.Mesh(new T.IcosahedronGeometry(2.05,2),new T.MeshBasicMaterial({color:0xd7bd97,wireframe:true,transparent:true,opacity:.58}));this.orbit.add(this.core);this.rings=[];
  for(let i=0;i<3;i++){const ring=new T.Mesh(new T.TorusGeometry(3.4+i*.48,.019,5,96),new T.MeshBasicMaterial({color:0xadc6cd,transparent:true,opacity:.35}));ring.rotation.set(.7+i*.8,.3+i*.6,i*.3);this.orbit.add(ring);this.rings.push(ring);}this.labels=[];this.planets=[];
  const points=[];let seed=1234;const rnd=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};for(let i=0;i<850;i++)points.push((rnd()-.5)*180,rnd()*85-30,-rnd()*140-20);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));this.starPositions=new Float32Array(points);this.stars=new T.Points(geo,new T.PointsMaterial({color:0xeadcc1,size:.038,transparent:true,opacity:.7,depthWrite:false}));this.scene.add(this.stars);
  const audioGeometry=new T.BoxGeometry(.04,1,.025),audioMaterial=new T.MeshBasicMaterial({color:0xb7d4d5,transparent:true,opacity:.48});
  this.audioRing=new T.InstancedMesh(audioGeometry,audioMaterial,64);this.audioRing.instanceMatrix.setUsage(T.DynamicDrawUsage);this.audioRing.boundingSphere=new T.Sphere(new T.Vector3(),3.6);this.audioTransform=new T.Object3D();this.audioScales=new Float32Array(64).fill(.045);this.orbit.add(this.audioRing);
  this.sparks=new Float32Array(180*3);const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(this.sparks,3));this.sparkMesh=new T.Points(sg,new T.PointsMaterial({color:0xf6dab0,size:.075,transparent:true,opacity:0,depthTest:false}));this.scene.add(this.sparkMesh);
 }
 paintLabel(l,word,index){
  const colour=this.lit?.has(index)?this.palette.accent:this.palette.ink,key=word+'|'+colour;if(l.userData.paint===key)return;
  const c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.font='500 40px Georgia,Microsoft YaHei';c.width=Math.ceil(ctx.measureText(word.slice(0,28)).width)+28;c.height=64;
  ctx.font='500 40px Georgia,Microsoft YaHei';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=colour;ctx.fillText(word.slice(0,28),c.width/2,32);
  l.material.map?.dispose();l.material.map=new T.CanvasTexture(c);l.material.map.colorSpace=T.SRGBColorSpace;l.material.needsUpdate=true;l.userData.aspect=c.width/64;l.userData.paint=key;
 }
 setWords(words,lit=new Set()){
  this.dirty=true;this.words=words.slice(0,48);this.lit=lit;if(!this.orbit)return;
  while(this.labels.length>this.words.length){const l=this.labels.pop(),p=this.planets.pop();this.orbit.remove(l,p);disposeObject(l);disposeObject(p);}
  this.words.forEach((word,i)=>{let l=this.labels[i];if(!l){l=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:false}));l.userData.index=i;this.orbit.add(l);this.labels.push(l);const p=new T.Mesh(new T.SphereGeometry(.11+(i%3)*.025,12,8),new T.MeshBasicMaterial({transparent:true,opacity:.86}));this.orbit.add(p);this.planets.push(p);}this.paintLabel(l,word,i);this.planets[i].material.color.set(lit.has(i)?this.palette.accent:this.palette.ink);});
 }
 configure(settings){
  this.budget.configure(settings.quality||'auto',settings.reading);this.dirty=true;const changed=this.settings.scene!==settings.scene,oldPalette=this.palette;this.settings=settings;this.updateFocusBounds();this.orbitWindow=settings.game?document.querySelector('.yj-orbit-window'):null;this.palette=scenePalette(settings);
  if(changed||settings.reading||settings.game){this.hoveredBottle=false;delete document.documentElement.dataset.yjBottleHover;this.cancelStar();this.hoveredStar=false;delete document.documentElement.dataset.yjStarHover;}
  if(changed&&settings.scene==='wind')this.windLayoutReady=false;if(settings.scene==='ocean'||settings.scene==='orbit')this.initialize3D();if(this.renderer)this.camera=settings.scene==='orbit'?this.orbitCamera:this.oceanCamera;this.applyBudget();this.canvas.hidden=!['wind','island'].includes(settings.scene);if(!this.renderer)return;
  this.renderer.domElement.hidden=['wind','island'].includes(settings.scene);this.oceanGroup.visible=settings.scene==='ocean';this.bottles.visible=settings.scene==='ocean'&&!settings.reading&&settings.bottlesEnabled!==false;this.island.visible=false;this.orbit.visible=settings.scene==='orbit';this.sky.visible=settings.scene==='ocean';this.stars.visible=settings.scene==='orbit';this.scene.background=settings.scene==='orbit'?new T.Color(this.palette.space):null;this.audioRing.visible=false;this.sparkMesh.visible=settings.scene==='orbit';
  if(changed){this.layoutMoving=false;this.pulse=0;this.burstTime=0;this.sparkMesh.material.opacity=0;this.renderer.clear();}
  const p=this.palette;for(const material of [this.sky.material,this.seaMaterial]){for(const k of ['top','horizon'])material.uniforms[k].value.set(p[k]);material.uniforms.glow.value.set(p.sun);material.uniforms.weather.value={clear:0,clouds:1,radiant:2}[settings.weather||'radiant']??2;material.uniforms.night.value=settings.mood==='night'?1:0;}this.seaMaterial.uniforms.deep.value.set(p.water);
  this.updateSunDirection();this.hemi.color.set(p.horizon);this.hemi.groundColor.set(p.ground);this.light.castShadow=settings.scene==='island';this.light.color.set(p.sun);this.light.intensity=settings.theme==='night'&&settings.matchTheme!==false?1.8:2.5;
  this.core.material.color.set(p.accent);this.rings.forEach(r=>r.material.color.set(p.ink));this.stars.material.color.set(p.ink);this.sparkMesh.material.color.set(p.accent);this.audioRing.material.color.set(p.accent);if(settings.scene==='ocean')updateBottleEnvironment(this);
  if(settings.scene==='ocean'){configureSkyAsset(this);this.loadModel('ocean');if(!settings.reading&&settings.bottlesEnabled!==false&&this.models.bottles==='idle')loadRefinedBottles(this);}if(this.labels.length!==this.words.length||oldPalette.ink!==p.ink||oldPalette.accent!==p.accent)this.setWords(this.words,this.lit);
 }
 applyBudget(){
  if(this.seaMaterial)this.seaMaterial.uniforms.detail.value=this.budget.tier===0?0:1;const d=this.budget.dpr;if(this.appliedDpr!==d){this.appliedDpr=d;this.renderer?.setPixelRatio(d);this.resize();}
  if(!this.highSeaGeometry||this.seaTier===this.budget.tier)return;this.seaTier=this.budget.tier;
  if(this.seaTier===2)this.water.geometry=this.highSeaGeometry;else{this.seaGeometries??=new Map();let g=this.seaGeometries.get(this.seaTier);if(!g){const n=this.seaTier===0?96:160;g=new T.PlaneGeometry(1500,1500,n,n);g.rotateX(-Math.PI/2);const a=g.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i)/750,z=a.getZ(i)/750;a.setXYZ(i,750*(.07*x+.93*x*x*x),0,750*(.07*z+.93*z*z*z));}a.needsUpdate=true;g.computeBoundingSphere();this.seaGeometries.set(this.seaTier,g);}this.water.geometry=g;}
  this.bottles?.traverse(o=>{if(o.name.startsWith('Glass')&&o.material?.isMeshPhysicalMaterial){o.material.transmission=this.seaTier===0?0:.97;o.material.opacity=this.seaTier===0?.27:1;o.material.needsUpdate=true;}});this.dirty=true;
 }
 updateSunDirection(){if(!this.sunDir)return;const mood=this.settings.mood;this.sunDir.set(.32*Math.min(1,this.width/this.height/.9),mood==='night'?.36:mood==='dawn'?.045:mood==='dusk'?.065:.26,-1).normalize();this.light.position.copy(this.sunDir).multiplyScalar(50);}
 resize(){this.dirty=true;const r=this.host.getBoundingClientRect();this.width=r.width||innerWidth;this.height=r.height||innerHeight;const d=this.budget.dpr;this.canvas.width=this.width*d;this.canvas.height=this.height*d;this.ctx.setTransform(d,0,0,d,0,0);if(this.renderer){this.renderer.setSize(this.width,this.height);this.oceanCamera.aspect=this.width/this.height;this.oceanCamera.updateProjectionMatrix();this.updateSunDirection();
 const halfHeight=20*Math.tan(54*Math.PI/360),halfWidth=halfHeight*this.width/this.height;
 Object.assign(this.orbitCamera,{left:-halfWidth,right:halfWidth,top:halfHeight,bottom:-halfHeight});this.orbitCamera.updateProjectionMatrix();
 if(this.stars){const a=this.stars.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setXYZ(i,this.starPositions[i*3]/90*halfWidth*1.05,5+(this.starPositions[i*3+1]+30)/85*halfHeight*2-halfHeight,this.starPositions[i*3+2]);a.needsUpdate=true;this.stars.geometry.computeBoundingSphere();}}this.updateFocusBounds();}
 gust(quote){this.dirty=true;if(quote){this.quotes=[quote,...this.quotes.filter(q=>q!==quote)].slice(0,24);this.windLayoutReady=false;}if(!this.settings.paused&&!this.reduced.matches)this.gustPower=1;this.wind();}
 transition(){if(!this.settings.paused&&!this.reduced.matches){this.pulse=.5;if(this.settings.scene==='wind')this.gustPower=.55;}}
 burst(index=0){if(this.settings.paused||this.reduced.matches)return;this.pulse=1;this.burstTime=1;this.sparkOrigin=this.planets?.[index]?.getWorldPosition(new T.Vector3())||new T.Vector3(5,4,0);this.sparkVel=Array.from({length:180},()=>new T.Vector3((Math.random()-.5)*7,(Math.random()-.5)*7,(Math.random()-.5)*5));}
 wind(dt=0){drawWind(this,dt);}
 castBottle(style='slender'){if(!this.bottles)return;const b=this.bottles.children.find(b=>b.userData.style===style)||this.bottles.children[0];b.userData.castAt=this.time;this.dirty=true;}
 collectBottle(){const b=this.bottles?.children[this.selectedBottle??0];if(b)b.userData.castAt=this.time;this.selectedBottle=undefined;this.dirty=true;}
 animateOrbit(t,e,dt){
  this.camera.position.set(0,5,20);this.camera.lookAt(0,5,0);this.camera.updateMatrixWorld();const mobile=this.width<760,game=this.settings.game,focus=game&&this.settings.focusedGame,worldHeight=2*20*Math.tan(54*Math.PI/360),unit=worldHeight/this.height;
  const windowBox=mobile&&game&&!focus?this.orbitWindow?.getBoundingClientRect():null;this.orbit.visible=!windowBox||(windowBox.bottom>0&&windowBox.top<this.height);
  const targetX=focus?(mobile?this.width*.80:this.width*.79):windowBox?windowBox.x+windowBox.width/2:mobile?this.width*.5:game?this.width*.755:this.width*.70,targetY=focus?this.height*.26:windowBox?windowBox.y+windowBox.height/2:this.height*.48;
  const targetDiameter=focus?Math.min(this.width*.44,this.height*.52):windowBox?Math.min(windowBox.width-22,windowBox.height*.9):mobile?Math.min(this.width-60,260):game?Math.min(this.width*.42,this.height*.78):Math.min(this.width*.65,this.height*.90);
  this.orbitLayout??={x:targetX,y:targetY,d:targetDiameter};const layout=this.orbitLayout,k=this.reduced.matches?1:1-Math.exp(-dt*8);
  layout.x+=(targetX-layout.x)*k;layout.y+=(targetY-layout.y)*k;layout.d+=(targetDiameter-layout.d)*k;this.layoutMoving=Math.abs(layout.x-targetX)+Math.abs(layout.y-targetY)+Math.abs(layout.d-targetDiameter)>.3;
  const centerX=layout.x,centerY=layout.y,diameter=layout.d;this.orbit.position.set((centerX-this.width/2)*unit,5+(this.height/2-centerY)*unit,0);
  this.orbit.scale.setScalar(diameter*unit/12);this.core.rotation.set(t*.07,t*.15,t*.04);const afterGlow=this.reduced.matches?0:Math.max(0,1-(performance.now()-(this.holdGlowAt||-10000))/650),hold=this.starPress?Math.min(1,(performance.now()-this.starPress.started)/900):0;this.holdProgress=hold;this.core.scale.setScalar(1+e*.06+afterGlow*.13+(this.starPress?-.035+hold*.17:this.pulse*.12)+(this.hoveredStar?.025:0));this.core.material.opacity=this.starPress?.65+hold*.35:.58+this.pulse*.22+afterGlow*.35+(this.hoveredStar?.10:0);this.core.material.color.set(this.palette.accent).lerp(this.holdColor.set(this.palette.sun),Math.max(hold,afterGlow));
  this.rings.forEach(r=>r.material.opacity=.35+hold*.22);this.rings.forEach((r,i)=>r.rotation.set(.65+i*.71+Math.sin(t*.11+i)*.13,.28+i*.5+t*(i%2?-.035:.045),i*.31+t*.055));
  this.orbit.updateMatrixWorld(true);const scale=this.orbit.scale.x;this.starTarget={x:centerX,y:centerY,r:2.05*scale/unit};if(!game&&!this.settings.reading)this.onStarLayout?.(centerX,centerY,this.starTarget.r);
  this.labels.forEach((l,i)=>{const ring=Math.floor(i/12),a=this.settings.game&&i<3?t*.07+i*Math.PI*2/3:t*(.07+ring*.009)+i*Math.PI*2/Math.min(12,this.words.length)+ring*.54,r=4.45+ring*.5;
   l.position.set(Math.cos(a)*r,Math.sin(a)*r*.67+Math.sin(a*2+ring)*.22,Math.sin(a+.5)*r*.28);this.planets[i].position.copy(l.position);this.planets[i].position.y-=.28;
   const worldPixel=unit,pixelHeight=mobile?25.6:32;
   l.scale.set(l.userData.aspect*pixelHeight*worldPixel/scale,pixelHeight*worldPixel/scale,1);l.userData.fontPixels=pixelHeight*40/64;l.visible=true;
  });
  this.orbit.updateMatrixWorld(true);const occupied=[];
  this.labels.forEach((l,i)=>{this.scratch.copy(l.position).applyMatrix4(this.orbit.matrixWorld).project(this.camera);const x=(this.scratch.x+1)*this.width/2,y=(1-this.scratch.y)*this.height/2,h=l.userData.fontPixels+8,w=l.userData.aspect*h,rect={x:x-w/2,y:y-h/2,w,h};
   const box=this.focusBounds,obstructed=box&&rect.x<box.right+16&&rect.x+rect.w>box.left-16&&rect.y<box.bottom+8&&rect.y+rect.h>box.top-8;this.planets[i].visible=!obstructed;
   l.visible=!obstructed&&!occupied.some(o=>rect.x<o.x+o.w+5&&rect.x+rect.w+5>o.x&&rect.y<o.y+o.h+4&&rect.y+rect.h+4>o.y);if(l.visible)occupied.push(rect);
  });
  this.audioRing.visible=e>.002;this.audioRing.rotation.z=t*.025;
  if(!this.settings.paused&&!this.reduced.matches){this.musicBeat=this.energy.beat||0;this.musicClock=(this.musicClock||0)+dt*(.8+e*1.6);}
  const beat=this.musicBeat||0,phase=this.musicClock||0;
  this.audioRing.material.opacity=.60+Math.min(.34,e*.1+beat*.28);
  if(this.audioRing.visible){for(let i=0;i<64;i++){
   const bandIndex=i<32?i:63-i,band=this.energy.bands?.[bandIndex]??(bandIndex<10?this.energy.bass:bandIndex<22?this.energy.mid:this.energy.high);
   const transient=this.energy.transients?.[bandIndex]||0,a=i/64*Math.PI*2-Math.PI/2;
   const crest=.3+.7*(.5+.5*Math.cos(a*4-phase*4.2));
   // Persistent tone, local attacks, and a travelling beat crest have different lifetimes.
   const drive=Math.pow(Math.max(0,band-.02),1.1)*.38+transient*.57+beat*crest*.50;
   const target=.045+Math.min(.80,drive*this.settings.soundStrength*.85);
   if(!this.settings.paused&&!this.reduced.matches)this.audioScales[i]+=(target-this.audioScales[i])*(1-Math.exp(-dt*(target>this.audioScales[i]?38:10)));
   const length=this.audioScales[i],o=this.audioTransform,r=2.53+length/2;
   // Every inner endpoint shares exactly the same radius. The camera is orthographic,
   // so the rotating 3D core and the planar spectrum have the same visible centre.
   o.position.set(Math.cos(a)*r,Math.sin(a)*r,0);o.rotation.set(0,0,a-Math.PI/2);o.scale.set(.85+beat*.35,length,1);o.updateMatrix();this.audioRing.setMatrixAt(i,o.matrix);
  }this.audioRing.instanceMatrix.needsUpdate=true;}

 }
 animate(ms){
  this.frame=requestAnimationFrame(this.animate);if(this.disposed||document.hidden)return;const cfg0=this.settings,forceHold=!!this.starPress||!!this.layoutMoving,targetFps=forceHold?30:this.budget.fps;if(ms-this.last<1000/targetFps)return;const spacing=this.last?ms-this.last:1000/targetFps,dt=Math.min(spacing/1000,.12);this.last=ms;const started=performance.now();
  const cfg=this.settings,moving=!cfg.paused&&!this.reduced.matches;if(this.wasMoving!==moving){this.wasMoving=moving;this.dirty=true;}if(!moving&&!this.dirty&&!forceHold)return;this.dirty=false;if(moving){this.time+=dt*cfg.speed;this.pointer.lerp(this.pointerTarget,1-Math.exp(-dt*8));this.pulse=Math.max(0,this.pulse-dt*.8);this.gustPower=Math.max(0,this.gustPower-dt*.32);}if(moving)this.visualEnergy=this.energy.level;const e=this.visualEnergy||0,t=this.time;
  if(cfg.scene==='wind'){this.wind(dt);this.budget.sample(ms,performance.now()-started,spacing);return;}if(cfg.scene==='island'){drawBookMemories(this);this.budget.sample(ms,performance.now()-started,spacing);return;}if(!this.renderer||this.renderError)return;const px=this.pointer.x,py=this.pointer.y;this.sky.material.uniforms.time.value=t;
  if(cfg.scene==='ocean'){this.camera.position.set(px*.20,2.8+py*.08,14);this.camera.lookAt(0,.8,-120);this.camera.updateMatrixWorld();this.scratch.copy(this.sunDir).multiplyScalar(1000).add(this.camera.position).project(this.camera);this.celestial??={direction:[0,0,0]};this.celestial.kind=cfg.mood==='night'?'moon':'sun';this.celestial.x=(this.scratch.x+1)*this.width/2;this.celestial.y=(1-this.scratch.y)*this.height/2;this.celestial.visible=Math.abs(this.scratch.x)<1&&Math.abs(this.scratch.y)<1;this.sunDir.toArray(this.celestial.direction);this.seaMaterial.uniforms.time.value=t;if(moving){const raw=Math.min(1.6,Math.pow(Math.max(0,this.energy.bass*.75+this.energy.level*.25-.018),.68)*cfg.soundStrength*1.35);this.seaResponse+=(raw-this.seaResponse)*(1-Math.exp(-dt*(raw>this.seaResponse?12:4)));}this.seaMaterial.uniforms.energy.value=this.seaResponse;animateBottles(this,t);const weights=this.water.morphTargetInfluences;if(weights){weights.fill(0);const phase=t*.5,a=Math.floor(phase)%4,b=(a+1)%4,f=phase%1;if(a>0)weights[a-1]=1-f;if(b>0)weights[b-1]=f;}}

  if(cfg.scene==='orbit')this.animateOrbit(t,e,dt);
  if(this.burstTime>0&&moving){this.burstTime=Math.max(0,this.burstTime-dt);const age=1-this.burstTime;for(let i=0;i<180;i++){this.scratch.copy(this.sparkOrigin).addScaledVector(this.sparkVel[i],age);this.sparks[i*3]=this.scratch.x;this.sparks[i*3+1]=this.scratch.y;this.sparks[i*3+2]=this.scratch.z;}this.sparkMesh.geometry.attributes.position.needsUpdate=true;this.sparkMesh.material.opacity=this.burstTime;}
  this.renderer.render(this.scene,this.camera);if(this.budget.sample(ms,performance.now()-started,spacing))this.applyBudget();
 }
 audioScreenLayout(){
  if(this.settings.scene!=='orbit'||!this.audioRing?.visible)return null;
  const screen=p=>{p.project(this.camera);return{x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2};};
  const center=screen(this.core.getWorldPosition(new T.Vector3())),matrix=new T.Matrix4();
  const inner=[0,16,32,48].map(i=>{this.audioRing.getMatrixAt(i,matrix);return screen(new T.Vector3(0,-.5,0).applyMatrix4(matrix).applyMatrix4(this.audioRing.matrixWorld));});
  return{center,inner};
 }
 snapshot(){return{musicBeat:this.musicBeat||0,musicFlux:this.energy.flux||0,audioScreen:this.audioScreenLayout(),celestial:this.settings.scene==='ocean'?this.celestial:null,drawCalls:this.renderer?.info.render.calls||0,skyAsset:this.skyAsset||'fallback',bottleHover:!!this.hoveredBottle,audioLengths:Array.from(this.audioScales||[]),audioInnerRadius:2.53,audioBandCount:this.energy.bands?.length||0,orbitProjection:this.camera?.isOrthographicCamera?'orthographic':'perspective',performance:this.budget.snapshot(),windCards:this.windCards||[],coreFeedback:{pressed:!!this.starPress,progress:this.holdProgress||0,hovered:!!this.hoveredStar,scale:this.core?.scale.x,opacity:this.core?.material.opacity},starTarget:this.starTarget,seaResponse:this.seaResponse,windTargets:this.windTargets||[],maxPluck:this.maxPluck||0,bottles:(this.oceanGroup?.visible&&this.bottles?.visible?this.bottles.children.filter(b=>b.visible):[]).map(b=>{const p=b.localToWorld(new T.Vector3(0,.6,0)).project(this.camera);return{style:b.userData.style,x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,world:b.position.toArray()};}),triangles:this.renderer?.domElement.hidden?0:this.renderer?.info.render.triangles||0,renderFrames:this.renderer?.info.render.frame||0,time:this.time,energy:this.energy.level,activeScene:this.settings.scene,theme:this.settings.theme,palette:{...this.palette},rings:this.rings?.map(r=>r.rotation.toArray().slice(0,3))||[],visibleLayers:[this.canvas.hidden?null:this.settings.scene,this.oceanGroup?.visible?'ocean':null,this.island?.visible?'island':null,this.stars?.visible?'orbit':null].filter(Boolean),models:{...this.models},stars:this.stars?.geometry.attributes.position.count||0,planetCount:this.words.length,gust:this.gustPower,pointer:[this.pointerTarget.x,this.pointerTarget.y],smoothPointer:[this.pointer.x,this.pointer.y],geometries:this.renderer?.info.memory.geometries||0,targets:(this.labels||[]).filter(l=>l.visible).map(l=>{const p=l.getWorldPosition(new T.Vector3()).project(this.camera);return{index:l.userData.index,x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,fontPixels:l.userData.fontPixels};})};}
 dispose(){this.disposed=true;delete document.documentElement.dataset.yjBottleHover;delete document.documentElement.dataset.yjStarHover;delete document.documentElement.dataset.yjSleeping;cancelAnimationFrame(this.frame);window.removeEventListener('blur',this.leave);document.removeEventListener('pointerleave',this.leave);document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('scroll',this.scroll,true);window.removeEventListener('pointermove',this.move);window.removeEventListener('pointerdown',this.pick);window.removeEventListener('pointerup',this.release);window.removeEventListener('pointercancel',this.release);clearTimeout(this.starTimer);this.resizeObserver.disconnect();const active=this.water?.geometry;disposeObject(this.scene);if(this.highSeaGeometry&&this.highSeaGeometry!==active)this.highSeaGeometry.dispose();this.seaGeometries?.forEach(g=>{if(g!==active)g.dispose();});this.bottleEnvironment?.dispose();this.skyTextures?.forEach(t=>t.dispose());this.renderer?.dispose();this.renderer?.forceContextLoss();this.host.replaceChildren();}
}
