const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const p=clamp((x-a)/(b-a),0,1);return p*p*(3-2*p);};
// Long prose is shown in semantic fragments, with a complete reading interval for each.
export function windFragments(quotes){
 const result=[];for(const raw of quotes.slice(0,160)){
  const clauses=String(raw).trim().match(/[^。！？.!?；;\n]+[。！？.!?；;]?/gu)||[];let part='';
  for(let clause of clauses){while(clause.length>72){if(part){result.push(part);part='';}let cut=clause.lastIndexOf(' ',72);if(cut<36)cut=72;result.push(clause.slice(0,cut).trim());clause=clause.slice(cut).trim();}if((part+clause).length>72&&part){result.push(part);part='';}part+=clause;}if(part)result.push(part);
 }return result.filter(Boolean).slice(0,240);
}
function layout(e,text,width,size){
 const key=text+'|'+Math.round(width)+'|'+size;if(e.windCache.has(key))return e.windCache.get(key);
 const ctx=e.ctx;ctx.font=size+'px Georgia,"SimSun",serif';let x=0,line=0;const glyphs=[];
 for(const token of text.match(/[\p{Script=Latin}\p{N}'’-]+|\s+|[^\p{Script=Latin}\p{N}\s]/gu)||[]){const tw=ctx.measureText(token).width;if(x&&x+tw>width&&!/^\s+$/.test(token)){x=0;line++;}for(const char of Array.from(token)){const w=ctx.measureText(char).width;if(x+w>width&&x){x=0;line++;}if(x===0&&/^\s$/.test(char))continue;glyphs.push({char,width:w,bx:x,by:line*size*1.65,x:0,y:0,vx:0,vy:0});x+=w;}}
 const value={glyphs,height:(line+1)*size*1.65};if(e.windCache.size>180)e.windCache.clear();e.windCache.set(key,value);return value;
}
export function drawWind(e,dt){
 const ctx=e.ctx,w=e.width,h=e.height,pal=e.palette,t=e.time,moving=!e.settings.paused&&!e.reduced.matches;
 const bg=ctx.createLinearGradient(0,h,0,0);bg.addColorStop(0,pal.horizon);bg.addColorStop(1,pal.top);ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle=pal.sun;ctx.lineWidth=.7;for(let k=0;k<7;k++){ctx.globalAlpha=.10;ctx.beginPath();for(let x=0;x<=w;x+=24){const y=h*(.11+k*.13)+Math.sin(x/w*4+t*.15+k)*22;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
 ctx.fillStyle=pal.sun;ctx.globalAlpha=.25;for(let k=0;k<48;k++){const x=((k*137+t*(3+k%4))%w+w)%w,y=(k*83)%h+Math.sin(t*.15+k)*12;ctx.fillRect(x,y,1.3,1.3);}ctx.globalAlpha=1;
 const key=e.quotes.join('\u0000');if(e.windQuoteKey!==key){e.windQuoteKey=key;e.windPool=windFragments(e.quotes);e.windRows=[];e.windElapsed=0;e.windNextQuote=0;}
 e.windElapsed=(e.windElapsed||0)+(moving?dt:0);e.windTargets=[];e.windCards=[];e.maxPluck=0;
 if(!e.windPool?.length){ctx.font='20px Georgia,"SimSun",serif';ctx.fillStyle=pal.ink;ctx.globalAlpha=.7;ctx.textAlign='center';ctx.fillText('选一句书中的话，让它随风。',w/2,h*.46);ctx.textAlign='left';ctx.globalAlpha=1;return;}
 const mobile=w<760,rows=mobile?3:4,size=mobile?19:25,limit=Math.min(mobile?w*.88:w*.53,700);
 const px=(e.pointerTarget.x+1)*w/2,py=(1-e.pointerTarget.y)*h/2;
 for(let row=0;row<rows;row++){
  let card=e.windRows[row];if(!card){const text=e.windPool[e.windNextQuote++%e.windPool.length],shape=layout(e,text,limit,size);card=e.windRows[row]={text,born:!moving?e.windElapsed-3:e.windElapsed===dt?row*2.2:e.windElapsed+row*.35,hold:18+Math.min(18,text.length*.13),glyphs:shape.glyphs.map(g=>({...g})),height:shape.height};}
  const age=e.windElapsed-card.born,exit=3+card.hold,duration=exit+7;
  if(age>duration){e.windRows[row]=null;continue;}if(age<0)continue;
  const enter=smooth(0,3,age),originX=mobile?w*.06:w*(.29+(row%2)*.025),originY=h*(.17+row*(mobile?.23:.19)),drift=Math.sin(t*.13+row)*7*enter;
  card.glyphs.forEach((g,j)=>{
   const lag=j/Math.max(1,card.glyphs.length-1),leave=smooth(exit+lag*1.2,exit+5.5+lag*1.5,age),alpha=smooth(lag*.45,2.5+lag*.45,age)*Math.pow(1-leave,1.65)*(row%2?.66:.84);
   const x=originX+g.bx+drift-(1-enter)*28-leave*leave*(35+Math.sin(j*.7)*20),y=originY+g.by+Math.sin(t*.35+j*.18+row)*3+leave*leave*Math.sin(j*.6+row)*24;
   const dx=x+g.width/2-px,dy=y-size*.38-py,near=clamp(1-Math.hypot(dx,dy)/70,0,1),contact=moving&&e.pointerInside!==false&&alpha>.15?near*near:0,goalX=contact*(dx<0?-1:1)*10,goalY=contact*(dy<0?-1:1)*8;
   if(moving){g.vx+=((goalX-g.x)*65-g.vx*14)*dt;g.vy+=((goalY-g.y)*65-g.vy*14)*dt;g.x=clamp(g.x+g.vx*dt,-14,14);g.y=clamp(g.y+g.vy*dt,-12,12);}
   ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=pal.ink;ctx.font=size+'px Georgia,"SimSun",serif';ctx.translate(x+g.x,y+g.y);ctx.rotate(g.y*.002+leave*Math.sin(j*.45)*.13);ctx.fillText(g.char,0,0);ctx.restore();
   e.maxPluck=Math.max(e.maxPluck,Math.hypot(g.x,g.y));if(alpha>.16&&x>=0&&x+g.width<=w&&y>=0&&y<=h)e.windTargets.push({row,index:j,x,y,width:g.width,alpha,offsetX:g.x,offsetY:g.y});
  });
  e.windCards.push({row,text:card.text,age,hold:card.hold,phase:age<3?'arrival':age<exit?'reading':'departure',x:originX,y:originY,width:limit,height:card.height});
 }
 ctx.globalAlpha=1;
}
