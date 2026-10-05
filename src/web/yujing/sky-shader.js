// The sky and the sea reflection sample one shared, directional cloud field.
export const atmosphereGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),u.x),u.y);}
float cloud(vec2 p){return noise(p)*.57+noise(p*2.13)*.28+noise(p*4.31)*.15;}
vec3 atmosphere(vec3 d,vec3 top,vec3 horizon,vec3 glow,vec3 sun,float time){
 float h=max(d.y,0.);vec3 c=mix(horizon,top,pow(h,.38));float s=max(dot(d,sun),0.);
 vec2 uv=d.xz/max(d.y+.18,.09)*1.7+vec2(time*.008,time*.002);
 uv*=2.1;
 float density=cloud(uv+2.7),edge=cloud(uv+2.7+sun.xz*.24),coverage=weather<.5?.15:weather<1.5?.84:.48;
 float bank=smoothstep(.48,.68,density)*smoothstep(.018,.12,d.y)*(1.-smoothstep(.65,1.,d.y));
 float cirrus=smoothstep(.62,.81,noise(uv*vec2(.38,4.3)+8.))*smoothstep(.15,.45,d.y)*.16;
 float light=clamp(.68+(density-edge)*1.7+d.y*.25,0.,1.);
 vec3 shade=mix(top*.38,horizon*1.05,light);shade=mix(shade,glow,light*pow(s,9.)*.55);
 c=mix(c,shade,(bank*coverage+cirrus)*(1.-night*.6));
 float halo=pow(s,32.)*.08+pow(s,220.)*.17;
 float silver=pow(clamp(1.-abs(density-.55)*7.,0.,1.),4.)*pow(s,18.)*.20*step(1.5,weather)*(1.-night);
 c+=glow*(halo+silver)*(1.-bank*.4);
 c+=glow*pow(s,6400.)*2.8*(1.-bank*.85);
 if(night>.5){vec2 grid=d.xz/max(d.y+.18,.09)*190.;float star=pow(hash(floor(grid)),65.)*(1.-smoothstep(.02,.10,length(fract(grid)-.5)));c+=vec3(.65,.77,.91)*star*smoothstep(.12,.45,d.y)*(1.-bank);}
 return c;
}`;
