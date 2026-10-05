import { atmosphereGLSL } from './sky-shader';
export const oceanVertex=`
varying vec3 wp,wn;uniform float time,energy;
void wave(vec2 dir,float wavelength,float amplitude,vec2 origin,inout vec3 p,inout vec3 tangent,inout vec3 binormal){
 float k=6.2831853/wavelength;float phase=k*dot(dir,origin)-sqrt(9.81*k)*time;
 float a=amplitude*(1.+energy*.65),s=sin(phase),c=cos(phase),q=.22;
 p.xz+=q*a*dir*c;p.y+=a*s;
 tangent+=vec3(-q*a*k*dir.x*dir.x*s,a*k*dir.x*c,-q*a*k*dir.x*dir.y*s);
 binormal+=vec3(-q*a*k*dir.x*dir.y*s,a*k*dir.y*c,-q*a*k*dir.y*dir.y*s);
}
void main(){
 vec3 p=(modelMatrix*vec4(position,1.)).xyz;vec2 origin=p.xz;
 vec3 tangent=vec3(1.,0.,0.),binormal=vec3(0.,0.,1.);
 wave(normalize(vec2(.8,.6)),48.,.30,origin,p,tangent,binormal);
 wave(normalize(vec2(-.35,1.)),23.,.16,origin,p,tangent,binormal);
 wave(normalize(vec2(.95,-.31)),13.,.07,origin,p,tangent,binormal);
 wave(normalize(vec2(.23,.97)),8.7,.033,origin,p,tangent,binormal);
 wp=p;wn=normalize(cross(binormal,tangent));gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
export const oceanFragment=`
varying vec3 wp,wn;uniform float time,energy,weather,night,detail;uniform vec3 top,horizon,glow,sun,deep;${atmosphereGLSL}
float ripples(vec2 p){return noise(p)*.62+noise(p*2.17+7.31)*.26+noise(p*4.13-13.7)*.12;}
vec2 irregularSlope(vec2 p,float scale,float speed,float amplitude,float footprint){
 float fade=1.-smoothstep(.4/scale,1.9/scale,footprint);vec2 uv=p*scale+vec2(time*speed,-time*speed*.63);
 uv+=vec2(noise(uv*.4+time*.017),noise(uv*.37-time*.011))*.7;
 float dx=ripples(uv+vec2(.07,0))-ripples(uv-vec2(.07,0)),dz=ripples(uv+vec2(0,.07))-ripples(uv-vec2(0,.07));
 return vec2(dx,dz)*amplitude*fade/.14;
}
void main(){
 float footprint=length(fwidth(wp.xz));vec2 gradients=irregularSlope(wp.xz,.32,.23,.075,footprint);
 if(detail>.5)gradients+=irregularSlope(wp.xz,1.45,.39,.026,footprint);
 gradients*=1.+energy*.55;
 vec3 n=normalize(wn+vec3(-gradients.x,0.,-gradients.y));vec3 eye=normalize(cameraPosition-wp);
 float NoV=max(dot(n,eye),.001),fresnel=.02+.98*pow(1.-NoV,5.);
 vec3 refl=atmosphere(reflect(-eye,n),top,horizon,glow,sun,time);float distance=length(wp-cameraPosition);
 vec3 transmitted=mix(deep*.28,deep*.80,exp(-distance*.024));vec3 color=mix(transmitted,refl,fresnel);
 vec3 halfDir=normalize(sun+eye);float NoH=max(dot(n,halfDir),0.),rough=.065+min(.13,footprint*.02);
 float a=rough*rough,denom=NoH*NoH*(a-1.)+1.,spec=a/(3.14159*denom*denom+.000003);
 color+=glow*min(4.,spec*(.055+energy*.025))*smoothstep(-.01,.12,sun.y);
 color=mix(color,horizon,(1.-exp(-distance*.0008))*.32);gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
