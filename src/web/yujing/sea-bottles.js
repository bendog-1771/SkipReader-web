import * as T from 'three';
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
 let h=0;for(const [dx,dz,length,amp] of [[.8,.6,48,.42],[-.35,1,23,.22],[.95,-.31,13,.09]]){const norm=Math.hypot(dx,dz),k=Math.PI*2/length;h+=amp*(1+energy*.85)*Math.sin(k*(dx*x+dz*z)/norm-Math.sqrt(9.81*k)*time);}return h;
}
export function animateBottles(e,t){
 if(!e.bottles)return;const count=e.width<760?2:3;
 const mobile=count===2,departing=e.bottles.children.findIndex(b=>t-(b.userData.castAt??-1000)>=0&&t-(b.userData.castAt??-1000)<7);
 e.bottles.visible=e.settings.scene==='ocean'&&e.settings.bottlesEnabled!==false;
 e.bottles.children.forEach((b,i)=>{
  b.visible=mobile&&departing===2?i!==1:i<count;const age=t-(b.userData.castAt??-1000),departure=age>=0&&age<7?age/7:0;
  const x=(mobile?[-2.4,2.1,.4]:[-7.8,5.6,1.8])[i]+Math.sin(t*.09+i*2)*(mobile?.22:.7),z=[-5,1,-17][i]-departure*18;
  b.position.set(x,waveHeight(x,z,t,e.seaResponse)-.28,z);b.rotation.set(.12*Math.sin(t*.5+i),t*.06+i,.20+.12*Math.sin(t*.7+i));
  b.scale.setScalar(.65*(1-departure*.8));if(i===2)b.scale.z*=.58;
 });
}
