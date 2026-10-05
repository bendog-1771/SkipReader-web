import { atmosphereGLSL } from './sky-shader';
export const oceanVertex=`
#include <common>
#include <morphtarget_pars_vertex>
varying vec3 wp,wn;uniform float time,energy;
void wave(vec2 dir,float wavelength,float amplitude,inout vec3 p,inout vec3 tangent,inout vec3 binormal){
 float k=6.2831853/wavelength;float phase=k*dot(dir,p.xz)-sqrt(9.81*k)*time;
 float a=amplitude*(1.+energy*.85),s=sin(phase),c=cos(phase),q=.35;
 p.xz+=q*a*dir*c;p.y+=a*s;
 tangent+=vec3(-q*a*k*dir.x*dir.x*s,a*k*dir.x*c,-q*a*k*dir.x*dir.y*s);
 binormal+=vec3(-q*a*k*dir.x*dir.y*s,a*k*dir.y*c,-q*a*k*dir.y*dir.y*s);
}
void main(){
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
 vec3 p=(modelMatrix*vec4(transformed,1.)).xyz;
 // Extend the distant mesh without stretching the nearby sampling grid.
 p.xz+=sign(p.xz)*pow(abs(p.xz)/240.,vec2(5.))*650.;p.y*=.3;
 vec3 tangent=vec3(1.,0.,0.),binormal=vec3(0.,0.,1.);
 wave(normalize(vec2(.8,.6)),48.,.42,p,tangent,binormal);
 wave(normalize(vec2(-.35,1.)),23.,.22,p,tangent,binormal);
 wave(normalize(vec2(.95,-.31)),13.,.09,p,tangent,binormal);
 wp=p;wn=normalize(cross(binormal,tangent)+vec3(objectNormal.x*.075,0.,objectNormal.z*.075));gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
export const oceanFragment=`
varying vec3 wp,wn;uniform float time,energy;uniform vec3 top,horizon,glow,sun,deep;${atmosphereGLSL}
vec2 slope(vec2 p,vec2 direction,float wavelength,float amplitude,float footprint){
 float k=6.2831853/wavelength,attenuation=1.-smoothstep(wavelength*.15,wavelength*.7,footprint);
 float variation=noise(p*.16-direction*time*.24);
 float phase=k*dot(direction,p)-sqrt(9.81*k)*time+variation*2.7;
 return amplitude*k*direction*cos(phase)*attenuation*(.38+variation*.9)*(1.+energy*.65);
}
void main(){
 float footprint=length(fwidth(wp.xz));vec2 gradients=vec2(0.);
 gradients+=slope(wp.xz,normalize(vec2(.6,.8)),5.2,.025,footprint);
 gradients+=slope(wp.xz,normalize(vec2(-.3,.95)),2.1,.016,footprint);
 gradients+=slope(wp.xz,normalize(vec2(.86,.51)),.81,.007,footprint);
 gradients+=slope(wp.xz,normalize(vec2(-.4,.91)),.38,.0028,footprint);
 vec3 n=normalize(wn+vec3(-gradients.x,0.,-gradients.y));vec3 eye=normalize(cameraPosition-wp);
 float NoV=max(dot(n,eye),.001),fresnel=.02+.98*pow(1.-NoV,5.);
 vec3 refl=atmosphere(reflect(-eye,n),top,horizon,glow,sun,time);float distance=length(wp-cameraPosition);
 vec3 transmitted=mix(deep*.45,deep*1.12,exp(-distance*.025));vec3 color=mix(transmitted,refl,fresnel);
 vec3 halfDir=normalize(sun+eye);float NoH=max(dot(n,halfDir),0.),rough=.045+min(.08,footprint*.012);
 float a=rough*rough,denom=NoH*NoH*(a-1.)+1.,spec=a/(3.14159*denom*denom+.00002);
 color+=glow*min(2.2,spec*(.024+energy*.018))*smoothstep(-.01,.12,sun.y);
 color=mix(color,horizon,(1.-exp(-distance*.0012))*.35);gl_FragColor=vec4(color,1.);
#include <colorspace_fragment>
}`;
