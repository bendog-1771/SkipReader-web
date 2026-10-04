// The sky and the sea reflection sample one shared, directional cloud field.
export const atmosphereGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),u.x),u.y);}
float cloud(vec2 p){return noise(p)*.57+noise(p*2.13)*.28+noise(p*4.31)*.15;}
vec3 atmosphere(vec3 d,vec3 top,vec3 horizon,vec3 glow,vec3 sun,float time){
 float h=max(d.y,0.);vec3 c=mix(horizon,top,pow(h,.52));float s=max(dot(d,sun),0.);
 vec2 uv=d.xz/max(d.y+.12,.07)*.8+vec2(time*.014,time*.004);
 float bank=smoothstep(.45,.72,cloud(uv))*smoothstep(.015,.12,d.y)*(1.-smoothstep(.7,1.,d.y));
 float cirrus=smoothstep(.57,.8,cloud(uv*vec2(.42,2.9)+8.))*smoothstep(.22,.45,d.y)*.22;
 vec3 shade=mix(horizon,glow,.48);c=mix(c,shade,min(.8,bank*.75+cirrus));
 return c+glow*pow(s,5200.)*1.3+glow*pow(s,28.)*.10;
}`;
