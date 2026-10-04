// Scene colours share the existing reader themes; no book content is sent away.
export const themePalettes = {
 paper:{top:'#9ab6b5',horizon:'#f3efe7',water:'#286c70',sun:'#fff2d1',ground:'#c4c7b4',ink:'#344c48',accent:'#a07b42',space:'#e6e4d9',surface:'#fffdf8',text:'#25221d',muted:'#716a5e',border:'#ded5c7',ui:'#2f6f62'},
 night:{top:'#132535',horizon:'#3a5261',water:'#123f52',sun:'#cfe5eb',ground:'#243638',ink:'#d4e1e5',accent:'#e1c295',space:'#101a24',surface:'#1c2227',text:'#ebeff2',muted:'#a5aeb6',border:'#343e47',ui:'#76bdce'},
 sepia:{top:'#b8a58c',horizon:'#eee3cf',water:'#4e7472',sun:'#ffe4b9',ground:'#c4ac83',ink:'#584b36',accent:'#a96637',space:'#e8dac3',surface:'#fff3de',text:'#34291b',muted:'#806d53',border:'#dac7a8',ui:'#8c4d33'},
 forest:{top:'#91b2a5',horizon:'#e8eee8',water:'#337566',sun:'#f5efc9',ground:'#afc3a7',ink:'#344e3c',accent:'#8c783c',space:'#dce6da',surface:'#fbfff8',text:'#1f2b22',muted:'#617265',border:'#c7d6c5',ui:'#31694a'},
 blue:{top:'#83b1ce',horizon:'#eaf0f5',water:'#236e94',sun:'#fff3d8',ground:'#b7c6c5',ink:'#34536a',accent:'#9d7d47',space:'#dfe9f1',surface:'#f7fbff',text:'#20262c',muted:'#61717f',border:'#cbd8e2',ui:'#376d92'},
 dusk:{top:'#a399b8',horizon:'#efeaf0',water:'#576784',sun:'#ffe3cb',ground:'#bbb0ba',ink:'#554364',accent:'#a57855',space:'#e6dee9',surface:'#fffaff',text:'#2e2630',muted:'#77677b',border:'#dacddd',ui:'#735a84'}
};
const moods={day:{top:'#3888b9',horizon:'#d4e5e9',water:'#135f7e',sun:'#fff0c6'},dawn:{top:'#758caf',horizon:'#f2c5af',water:'#315d79',sun:'#ffddb0'},dusk:{top:'#4b6186',horizon:'#e6ac83',water:'#254e67',sun:'#f7cb98'},night:{top:'#071328',horizon:'#273b55',water:'#132e49',sun:'#b7cbe1'}};
function mix(a,b,t){const aa=parseInt(a.slice(1),16),bb=parseInt(b.slice(1),16);return '#'+[16,8,0].map(s=>Math.round(((aa>>s)&255)*(1-t)+((bb>>s)&255)*t).toString(16).padStart(2,'0')).join('');}
export function scenePalette(settings){
 const theme=themePalettes[settings.theme]||themePalettes.paper,mood=moods[settings.mood]||moods.day;
 if(settings.matchTheme===false)return {...themePalettes.night,...mood,space:'#102237'};
 const weight=settings.theme==='night'?.16:settings.mood==='day'?.08:settings.mood==='night'?.45:.24;
 const result={...theme};for(const key of ['top','horizon','water','sun'])result[key]=mix(theme[key],mood[key],weight);
 return result;
}
export function gamePalette(theme){const p=themePalettes[theme]||themePalettes.paper;return {'--yj-game-surface':p.surface,'--yj-game-text':p.text,'--yj-game-muted':p.muted,'--yj-game-border':p.border,'--yj-game-accent':p.ui,'--yj-game-star':p.accent};}
