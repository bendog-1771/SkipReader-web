import * as T from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import dayURL from '../../../assets/yuejing/sky/kloppenheim_05_puresky_1k.hdr';
import duskURL from '../../../assets/yuejing/sky/kloppenheim_06_puresky_1k.hdr';

// Local CC0 assets. Load only the current light, retaining at most two 1K maps.
export function configureSkyAsset(e){
 const key=e.settings.mood==='day'?'day':'dusk';e.skyTextures??=new Map();e.skyLoads??=new Set();
 const attach=texture=>{
  if(e.disposed||e.settings.scene!=='ocean'||(e.settings.mood==='day'?'day':'dusk')!==key)return;
  for(const material of [e.sky.material,e.seaMaterial]){material.uniforms.skyMap.value=texture;material.uniforms.skyReady.value=1;}
  e.skyAsset=key;e.dirty=true;
 };
 for(const material of [e.sky.material,e.seaMaterial]){
  material.uniforms.skyReady.value=0;
  material.uniforms.skyExposure.value=key==='day'?.42:e.settings.mood==='dusk'?.42:.65;
  material.uniforms.skyWarmth.value.set(...(e.settings.mood==='dusk'?[1.22,.84,.68]:e.settings.mood==='dawn'?[1.13,.95,.87]:[1,1,1]));
  material.uniforms.skyTint.value.copy(new T.Color(e.palette.horizon));
  material.uniforms.skyTheme.value=e.settings.matchTheme===true?.24:0;
 }
 if(e.skyTextures.has(key)){attach(e.skyTextures.get(key));return;}
 if(e.skyLoads.has(key))return;e.skyLoads.add(key);
 new RGBELoader().load(new URL(key==='day'?dayURL:duskURL,import.meta.url).href,texture=>{
  if(e.disposed){texture.dispose();return;}texture.mapping=T.EquirectangularReflectionMapping;
  texture.wrapS=T.RepeatWrapping;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;
  e.skyTextures.set(key,texture);e.skyLoads.delete(key);attach(texture);
 },undefined,()=>{e.skyLoads.delete(key);if(!e.disposed){e.skyAsset='fallback';e.dirty=true;}});
}

export function skyUniforms(){return{skyMap:{value:null},skyReady:{value:0},skyExposure:{value:.42},skyTint:{value:new T.Color()},skyTheme:{value:0},skyWarmth:{value:new T.Vector3(1,1,1)}};}
