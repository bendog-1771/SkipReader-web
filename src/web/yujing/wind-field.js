const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const p=clamp((x-a)/(b-a),0,1);return p*p*(3-2*p);};
// Each source stays together; long excerpts continue in the same position.
export function windFragments(quotes){return quotes.slice(0,160).map(q=>String(q).trim()).filter(Boolean);}
function layout(e,text,width,size){
 const key=text+'|'+Math.round(width)+'|'+size;if(e.windCache.has(key))return e.windCache.get(key);
 const ctx=e.ctx;ctx.font=size+'px Georgia,"SimSun",serif';let x=0,line=0;const lines=[[]];
 for(const token of text.match(/[\p{Script=Latin}\p{N}'’-]+|[^\p{Script=Latin}\p{N}]/gu)||[]){
  if(token==='\n'){x=0;line++;lines.push([]);continue;}
  const tw=ctx.measureText(token).width;if(x&&x+tw>width&&!/^\s+$/.test(token)){x=0;line++;lines.push([]);}
  for(const char of Array.from(token)){const cw=ctx.measureText(char).width;if(x+cw>width&&x){x=0;line++;lines.push([]);}if(x===0&&/^\s$/.test(char))continue;lines[line].push({char,width:cw,bx:x});x+=cw;}
 }
 const pages=[];for(let start=0;start<lines.length;start+=4){const chunk=lines.slice(start,start+4),glyphs=chunk.flatMap((row,i)=>row.map(g=>({...g,by:i*size*1.65,x:0,y:0,vx:0,vy:0})));if(glyphs.length)pages.push({text:glyphs.map(g=>g.char).join(''),glyphs,height:chunk.length*size*1.65});}
 if(e.windCache.size>=24)e.windCache.clear();e.windCache.set(key,pages);return pages;
}
function createCard(e,source,width,size,born,page=0){
 const pages=layout(e,source,width,size),shape=pages[page];return{source,text:shape.text,pages,page,born,hold:18+Math.min(18,shape.text.length*.13),glyphs:shape.glyphs.map(g=>({...g})),height:shape.height};
}
export function drawWind(e,dt){
 const ctx=e.ctx,w=e.width,h=e.height,pal=e.palette,t=e.time,moving=!e.settings.paused&&!e.reduced.matches;
 const bg=ctx.createLinearGradient(0,h,0,0);bg.addColorStop(0,pal.horizon);bg.addColorStop(1,pal.top);ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle=pal.sun;ctx.lineWidth=.65;for(let k=0;k<8;k++){ctx.globalAlpha=.08;ctx.setLineDash([110+k*13,190+k*9]);ctx.lineDashOffset=-t*(18+k*2);ctx.beginPath();for(let x=-40;x<=w+40;x+=24){const y=h*(.08+k*.125)+Math.sin(x/w*4-t*.19+k)*18;x>-40?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.setLineDash([]);
 ctx.fillStyle=pal.sun;ctx.globalAlpha=.22;for(let k=0;k<48;k++){const x=((k*137+t*(14+k%4))%w+w)%w,y=(k*83)%h+Math.sin(t*.15+k)*12;ctx.fillRect(x,y,1.3,1.3);}ctx.globalAlpha=1;
 if(!e.windLayoutReady||e.windQuoteInput!==e.quotes){e.windLayoutReady=true;e.windQuoteInput=e.quotes;e.windPool=windFragments(e.quotes);e.windRows=[];e.windElapsed=0;e.windNextQuote=0;}
 e.windElapsed=(e.windElapsed||0)+(moving?dt:0);e.windTargets=[];e.windCards=[];e.maxPluck=0;
 if(!e.windPool?.length){ctx.font='20px Georgia,"SimSun",serif';ctx.fillStyle=pal.ink;ctx.globalAlpha=.7;ctx.textAlign='center';ctx.fillText('选一句书中的话，让它随风。',w/2,h*.46);ctx.textAlign='left';ctx.globalAlpha=1;return;}
 const mobile=w<760,size=mobile?19:25,rows=Math.min(e.windPool.length,h<620?2:3),limit=Math.min(mobile?w*.86:w*.52,700),slot=h*.78/rows;
 const px=(e.pointerTarget.x+1)*w/2,py=(1-e.pointerTarget.y)*h/2;
 for(let row=0;row<rows;row++){
  let card=e.windRows[row];if(!card){const source=e.windPool[e.windNextQuote++%e.windPool.length];card=e.windRows[row]=createCard(e,source,limit,size,!moving?e.windElapsed-3:e.windElapsed+row*.6);}
  const age=e.windElapsed-card.born,exit=3+card.hold,duration=exit+7;
  if(age>duration){e.windRows[row]=card.page+1<card.pages.length?createCard(e,card.source,limit,size,e.windElapsed,card.page+1):null;continue;}if(age<0)continue;
  const enter=smooth(0,3,age),originX=mobile?w*.06:w*(.28+(row%2)*.035),originY=rows===1?h*.4-card.pages[0].height*.3:h*.15+row*slot,drift=Math.sin(t*.17+row)*14+smooth(3,exit,age)*32;
  card.glyphs.forEach((g,j)=>{
   const lag=j/Math.max(1,card.glyphs.length-1),leave=smooth(exit+lag*.8,exit+5.5+lag,age),alpha=smooth(lag*.35,2.5+lag*.35,age)*Math.pow(1-leave,1.7)*(row%2?.76:.9);
   const x=originX+g.bx+drift-(1-enter)*40+leave*leave*(95+Math.sin(j*.12)*16),y=originY+g.by+Math.sin(t*.8-g.bx*.008+row)*4+leave*leave*Math.sin(j*.11+row)*20;
   const dx=x+g.width/2-px,dy=y-size*.38-py,near=clamp(1-Math.hypot(dx,dy)/70,0,1),contact=moving&&e.pointerInside!==false&&alpha>.15?near*near:0,goalX=contact*(dx<0?-1:1)*10,goalY=contact*(dy<0?-1:1)*8;
   if(moving){g.vx+=((goalX-g.x)*65-g.vx*14)*dt;g.vy+=((goalY-g.y)*65-g.vy*14)*dt;g.x=clamp(g.x+g.vx*dt,-14,14);g.y=clamp(g.y+g.vy*dt,-12,12);}
   ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=pal.ink;ctx.font=size+'px Georgia,"SimSun",serif';ctx.translate(x+g.x,y+g.y);ctx.rotate(g.y*.002+leave*Math.sin(j*.12)*.08);ctx.fillText(g.char,0,0);ctx.restore();
   e.maxPluck=Math.max(e.maxPluck,Math.hypot(g.x,g.y));if(alpha>.16&&x>=0&&x+g.width<=w&&y>=0&&y<=h)e.windTargets.push({row,index:j,x,y,width:g.width,alpha,offsetX:g.x,offsetY:g.y});
  });
  if(card.pages.length>1){ctx.globalAlpha=.4*enter*(1-smooth(exit,exit+6,age));ctx.fillStyle=pal.ink;ctx.font='11px "Segoe UI",sans-serif';ctx.fillText(`${card.page+1} / ${card.pages.length}`,originX+drift,originY+card.height+12);}
  e.windCards.push({row,text:card.text,source:card.source,page:card.page,pages:card.pages.length,age,hold:card.hold,phase:age<3?'arrival':age<exit?'reading':'departure',x:originX,y:originY,width:limit,height:card.height});
 }
 ctx.globalAlpha=1;
}
