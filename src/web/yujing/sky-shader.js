// The sky and the sea reflection sample one shared, directional cloud field.
export const atmosphereGLSL=`
uniform sampler2D skyMap;uniform float skyReady,skyExposure,skyTheme;uniform vec3 skyTint,skyWarmth;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),u.x),u.y);}
float cloud(vec2 p){return noise(p)*.57+noise(p*2.13)*.28+noise(p*4.31)*.15;}
float photoTransmission(vec3 photo){
 float high=max(max(photo.r,photo.g),photo.b),low=min(min(photo.r,photo.g),photo.b);
 float chroma=(high-low)/max(high,.001);
 float cloudCover=1.-smoothstep(.07,.38,chroma);
 return mix(1.,weather>.5&&weather<1.5?.18:.46,cloudCover);
}
vec3 celestial(vec3 d,vec3 glow,vec3 sun,float transmission){
 float s=dot(d,sun),lowSun=1.-smoothstep(.04,.28,sun.y),radius=night>.5?.014:mix(.0105,.0127,lowSun);
 float rim=cos(radius),aa=max(fwidth(s)*.65,.000004);
 float disc=smoothstep(rim-aa,rim+aa,s);
 float angle=sqrt(max(0.,2.*(1.-s)));
 float inner=exp(-pow(angle/.020,2.)),outer=exp(-pow(angle/.075,2.));
 vec3 warmth=mix(vec3(1.,.97,.89),vec3(1.12,.59,.29),lowSun*.75);
 // The diffuse glow remains visible through thin cloud, while the small solar body dims.
 vec3 light=glow*warmth*(inner*.09+outer*(.025+lowSun*.045))*mix(.3,1.,transmission);
 if(night>.5){
  // Subtle lunar surface variations, with a lit rim rather than a flat white dot.
  vec2 uv=(d.xy-sun.xy)/radius;
  float craters=cloud(uv*9.1+17.)*.18+noise(uv*22.)*.055;
  light+=mix(glow,vec3(.79,.86,.98),.6)*disc*(.83-craters)*transmission;
 }else{
  float limb=sqrt(max(0.,1.-pow(angle/radius,2.)));
  light+=glow*warmth*disc*(2.2+limb*.9)*transmission;
 }
 return light*smoothstep(-.015,.01,d.y);
}
vec3 distantStars(vec3 d){
 vec2 grid=d.xz/max(d.y+.18,.09)*190.;
 float star=pow(hash(floor(grid)),65.)*(1.-smoothstep(.02,.10,length(fract(grid)-.5)));
 return vec3(.65,.77,.91)*star*smoothstep(.12,.45,d.y);
}
vec3 atmosphere(vec3 d,vec3 top,vec3 horizon,vec3 glow,vec3 sun,float time){
 float s=max(dot(d,sun),0.);
 if(skyReady>.5){
  // One photographic environment supplies the sky and water reflection.
  vec2 skyUV=vec2(atan(d.z,d.x)/6.2831853+.5+time*.00025,asin(clamp(d.y,-1.,1.))/3.14159265+.5);
  vec3 photo=min(texture2D(skyMap,skyUV).rgb*skyExposure,vec3(12.));
  float transmission=photoTransmission(photo);
  photo*=mix(vec3(1.),skyWarmth,1.-smoothstep(.02,.55,d.y));
  float luminance=dot(photo,vec3(.2126,.7152,.0722));
  photo=mix(photo,photo*skyTint*1.45,skyTheme);
  if(weather>.5&&weather<1.5)photo=mix(photo,vec3(luminance)*mix(horizon,vec3(1.),.6),.48);
  if(night>.5)photo=mix(photo*.025,vec3(luminance)*mix(top,horizon,smoothstep(0.,.25,d.y))*.35,.78);
  float fade=smoothstep(-.12,.035,d.y);
  vec3 c=mix(horizon*.65,photo,fade);
  c+=celestial(d,glow,sun,transmission);
  if(night>.5)c+=distantStars(d)*.75;
  return c;
 }
 float h=max(d.y,0.);vec3 c=mix(horizon,top,pow(h,.38));
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
 c+=celestial(d,glow,sun,1.-bank*.75);
 if(night>.5)c+=distantStars(d)*(1.-bank);

 return c;
}`;
