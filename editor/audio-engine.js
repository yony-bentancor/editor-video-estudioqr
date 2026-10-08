/* Audio timeline shared by presentation and editor. All times in seconds. */
(() => {
 let tracks=[],signature='',muted=false,lastTime=0,lastRunning=false,lastRate=1,projectDuration=44;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function configure(cfg){projectDuration=Math.max(1,+cfg.general?.duration||44);const list=cfg.audio?.tracks||[];const next=JSON.stringify(list);if(next===signature)return;signature=next;tracks.forEach(t=>t.el.pause());tracks=list.filter(t=>t.src).map(t=>{const el=new Audio(t.src);el.preload='auto';el.addEventListener('error',()=>dispatchEvent(new CustomEvent('qr:audio-error',{detail:t.name||t.src})));return {data:t,el};});}
 function tick(time,running,rate=1){lastTime=time;lastRunning=running;lastRate=rate;for(const {data:t,el} of tracks){const offset=Math.max(0,+t.offset||0),trim=Math.max(0,+t.trim||0),local=time-offset;const natural=Number.isFinite(el.duration)?Math.max(0,el.duration-trim):Infinity;const length=Math.min(projectDuration-offset,+t.duration>0?+t.duration:(t.loop?Infinity:natural));let active=running&&!muted&&!t.muted&&local>=0&&local<length&&natural>0;
 if(!t.loop&&local>=natural)active=false;
 if(!active){el.pause();continue;}
 const desired=trim+(t.loop&&Number.isFinite(natural)?local%natural:local);if(Number.isFinite(el.duration)&&Math.abs(el.currentTime-desired)>.18){try{el.currentTime=Math.min(desired,el.duration)}catch{}}
 const fadeIn=+t.fadeIn||0,fadeOut=+t.fadeOut||0;const gain=Math.min(fadeIn?clamp(local/fadeIn,0,1):1,fadeOut&&Number.isFinite(length)?clamp((length-local)/fadeOut,0,1):1);
 el.volume=clamp((t.volume??.7)*gain,0,1);el.playbackRate=clamp(rate,.1,4);if(el.paused)el.play().catch(()=>{});
 }}
 window.QRAudio={configure,tick,setMuted:v=>{muted=v;tick(lastTime,lastRunning,lastRate)},pause:()=>tracks.forEach(t=>t.el.pause())};document.addEventListener('visibilitychange',()=>{if(document.hidden)window.QRAudio.pause()});
})();
