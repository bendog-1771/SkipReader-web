const smooth = (a,b,x) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function drawWind(e,dt=.033){
 const c=e.ctx,w=e.width,h=e.height,t=e.time,pal=e.palette,moving=!e.settings.paused&&!e.reduced.matches;
 const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,pal.horizon);g.addColorStop(1,pal.top);c.fillStyle=g;c.fillRect(0,0,w,h);
 // Thin filaments describe the wind without competing with the sentence silhouettes.
 c.strokeStyle=pal.accent;c.lineWidth=.65;
 for(let i=0;i<6;i++){c.globalAlpha=.045+(i%2)*.02;c.beginPath();for(let j=0;j<=12;j++){const x=j*w/12,y=h*(.12+i*.145)+Math.sin(j*.5+t*.14+i*2)*h*.025;if(j)c.lineTo(x,y);else c.moveTo(x,y);}c.stroke();}
 for(let i=0;i<48;i++){const x=((i*.618%1)*w-t*(5+i%4*2)+w*20)%w,y=(i*.377%1)*h+Math.sin(t*.2+i)*13;c.globalAlpha=.10;c.fillStyle=pal.accent;c.beginPath();c.ellipse(x,y,1.8+i%3, .45, -.2,0,Math.PI*2);c.fill();}
 e.windTargets=[];e.maxPluck=0;
 if(!e.quotes.length){c.globalAlpha=.55;c.fillStyle=pal.ink;c.font='15px Microsoft YaHei';c.fillText('选一句书中文字，让风把它带来。',w*.48,h*.45);c.globalAlpha=1;return;}
 e.windRows ||= new Map();
 const pointerX=(e.pointerTarget.x+1)*w/2,pointerY=(1-e.pointerTarget.y)*h/2,activity=moving?Math.max(0,1-(performance.now()-e.lastPointerAt)/180):0;
 for(let row=0;row<7;row++){
  const cycle=t/19+row*.13,p=cycle%1,text=e.quotes[(Math.floor(cycle)+row)%e.quotes.length],size=w<650?17:23+row%3*5,key=size+'|'+text;c.font=`${size}px Georgia,Microsoft YaHei`;
  let parts=e.windCache.get(key);if(!parts){parts=(text.match(/[\p{Script=Han}]|[^\s\p{Script=Han}]+|\s+/gu)||[text]).map(word=>({word,width:c.measureText(word).width}));if(e.windCache.size>=128)e.windCache.delete(e.windCache.keys().next().value);e.windCache.set(key,parts);}
  const id=key+'|'+Math.floor(cycle);let state=e.windRows.get(row);if(state?.id!==id){state={id,letters:parts.map(()=>({x:0,y:0,vx:0,vy:0}))};e.windRows.set(row,state);}
  let x=w*.43+Math.sin(row*3.1)*w*.14-(p-.45)*w*.72;const y=h*(.17+row*.095);
  for(let j=0;j<parts.length;j++){
   const glyph=parts[j],s=state.letters[j],lag=j/parts.length,leave=smooth(.66+lag*.10,.985,p),alpha=smooth(.02+lag*.06,.15+lag*.06,p)*Math.pow(1-leave,1.4)*(row%2?.40:.62);
   const bx=x-leave*leave*(50+35*Math.sin(j*2.1+row)),by=y+Math.sin(t*.3+j*.5+row)*7+leave*leave*Math.sin(j*.7+row)*60+e.gustPower*Math.sin(j*.5+row)*22;
   if(moving){
    const dx=bx+glyph.width/2-pointerX,dy=by-size*.4-pointerY,d=Math.hypot(dx,dy),near=Math.max(0,1-d/115);
    if(near&&activity&&alpha>.05){s.vx+=Math.max(-900,Math.min(900,e.pointerVelocity.x))*near*activity*dt*.8;s.vy+=Math.max(-900,Math.min(900,e.pointerVelocity.y))*near*activity*dt*.8;}
    s.vx+=(-90*s.x-15*s.vx)*dt;s.vy+=(-90*s.y-15*s.vy)*dt;s.x=Math.max(-18,Math.min(18,s.x+s.vx*dt));s.y=Math.max(-18,Math.min(18,s.y+s.vy*dt));
   }
   const magnitude=Math.hypot(s.x,s.y);e.maxPluck=Math.max(e.maxPluck,magnitude);
   c.globalAlpha=alpha;c.fillStyle=row%3===0?pal.accent:pal.ink;c.save();c.translate(bx+s.x,by+s.y);c.rotate(s.y*.003+leave*Math.sin(j)*.08);c.fillText(glyph.word,0,0);c.restore();
   if(alpha>.16&&bx>-glyph.width&&bx<w&&e.windTargets.length<150)e.windTargets.push({row,index:j,x:bx+glyph.width/2,y:by-size*.4,width:glyph.width,alpha,offsetX:s.x,offsetY:s.y});
   // The outgoing letters leave small airborne ink flecks before fully fading.
   if(leave>.02&&leave<.98){c.globalAlpha=Math.sin(leave*Math.PI)*.09;c.beginPath();c.arc(bx-12-leave*25,by+Math.sin(j*3.7)*15, .6,0,Math.PI*2);c.fill();}
   x+=glyph.width;
  }
 }c.globalAlpha=1;
}
