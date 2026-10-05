// A quiet wall of light behind the reader's own covers. No remote imagery.
export function drawBookMemories(e){
 const c=e.ctx,w=e.width,h=e.height,p=e.palette,t=e.time;c.clearRect(0,0,w,h);
 const base=c.createLinearGradient(0,0,w,h);base.addColorStop(0,p.horizon);base.addColorStop(.55,p.surface);base.addColorStop(1,p.ground);c.fillStyle=base;c.fillRect(0,0,w,h);
 const wash=c.createRadialGradient(w*.73,h*.2,0,w*.73,h*.2,w*.85);wash.addColorStop(0,p.sun+'60');wash.addColorStop(1,p.sun+'00');c.fillStyle=wash;c.fillRect(0,0,w,h);
 c.save();c.globalAlpha=.045;c.fillStyle=p.ink;c.translate(w*.97,h*.14);c.rotate(-.48+Math.sin(t*.11)*.015);
 for(let branch=0;branch<7;branch++){c.save();c.rotate(branch*.21-.55);c.fillRect(-2,0,3,h*.65);for(let i=0;i<8;i++){const y=30+i*h*.067;c.beginPath();c.ellipse((i%2?1:-1)*22,y,28,9,(i%2?1:-1)*.65,0,Math.PI*2);c.fill();}c.restore();}c.restore();
 c.save();c.globalAlpha=.12;c.strokeStyle=p.sun;c.lineWidth=1;for(let i=0;i<26;i++){const x=w*((i*.618033)%1),y=(h*((i*.3819)%1)+Math.sin(t*.13+i)*18+h)%h;c.beginPath();c.arc(x,y,.6+(i%3)*.25,0,Math.PI*2);c.stroke();}c.restore();
 e.models.island='retired';
}
