(() => {
 'use strict';if(new URLSearchParams(location.search).has('preview'))return;
 let duration=44;const $=id=>document.getElementById(id);
 document.body.insertAdjacentHTML('beforeend',`<div id="cinema-glow"></div><section id="intro-gate" aria-label="Iniciar presentación"><small>ESTUDIO QR · FILM 01</small><h1>Ideas que<br><em>se transforman.</em></h1><p>Un viaje de 44 segundos.<br>Mejor con auriculares.</p><div class="intro-buttons"><button class="intro-btn primary" id="intro-start" disabled>Preparando…</button><button class="intro-btn" id="intro-silent" disabled>Ver sin sonido</button><a class="intro-btn" href="../../index.html">Proyectos</a></div></section><div id="intro-controls" hidden><span id="intro-clock">00 / 44</span><button class="intro-btn" id="intro-pause">Pausar</button><button class="intro-btn" id="intro-mute" aria-pressed="false">Sonido activo</button><button class="intro-btn" id="intro-replay">Repetir</button><a class="intro-btn" href="../../index.html">Salir</a></div><div id="intro-status" role="status"></div>`);
 const audio={muted:false,pause:()=>window.QRAudio?.pause()};
 let running=false,elapsed=0,last=0,started=false,ended=false,timeline;
 const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,colors=['#d5a977','#d3a06b','#61cbbb','#59d4d0','#809feb','#b895cf','#d5af79'];
 const say=t=>$('intro-status').textContent=t;
 function syncAudio(){window.QRAudio?.setMuted(audio.muted);if(window.QRIntro)window.QRIntro.playing=running;}
 function pause(){running=false;if(window.QRIntro)window.QRIntro.playing=false;audio.pause();$('intro-pause').textContent='Continuar';}
 function start(silent=false){if(!window.QRIntro?.ready)return;started=true;ended=false;elapsed=0;window.QRIntro.progress=0;audio.muted=silent;$('intro-mute').textContent=silent?'Activar sonido':'Sonido activo';$('intro-mute').setAttribute('aria-pressed',String(silent));$('intro-gate').classList.add('closed');$('intro-controls').hidden=false;running=true;last=performance.now();$('intro-pause').textContent='Pausar';say('');syncAudio();}
 function ready(){$('intro-start').disabled=false;$('intro-silent').disabled=false;$('intro-start').textContent='Ver intro con sonido';}
 $('intro-start').onclick=()=>start(false);$('intro-silent').onclick=()=>start(true);$('intro-replay').onclick=()=>start(audio.muted);
 $('intro-pause').onclick=()=>{if(ended){start(audio.muted);return;}if(running)pause();else{running=true;last=performance.now();$('intro-pause').textContent='Pausar';syncAudio();}};
 $('intro-mute').onclick=()=>{audio.muted=!audio.muted;$('intro-mute').textContent=audio.muted?'Activar sonido':'Sonido activo';$('intro-mute').setAttribute('aria-pressed',String(audio.muted));if(!audio.muted&&running)syncAudio();else if(audio.muted){window.QRAudio?.setMuted(true);audio.pause();}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});document.addEventListener('keydown',e=>{if(e.code==='Space'&&started&&!e.target.closest('button,a,input,textarea')){e.preventDefault();$('intro-pause').click();}});
 addEventListener('qr:intro-ready',ready);if(window.QRIntro?.ready)ready();
 fetch('config.json').then(r=>r.json()).then(c=>{timeline=QRM.timing(QRM.normalize(c));duration=Math.max(1,+c.general.duration||44);$('intro-gate').querySelector('h1').textContent=c.project?.name||c.general.brand||'Tu proyecto';$('intro-gate').querySelector('small').textContent=c.general.brand||'ESTUDIO QR';$('intro-gate').querySelector('p').textContent='Un viaje de '+duration+' segundos. Mejor con auriculares.';}).catch(()=>{});
 function frame(now){if(running){elapsed=Math.min(duration,elapsed+(now-last)/1000);let progress=elapsed/duration;
 if(reduced&&timeline){const i=QRM.sceneAt(timeline,progress*timeline.total);progress=timeline.scenes[i].hold/timeline.total;}
 if(window.QRIntro)window.QRIntro.progress=Math.min(.999,progress);
 const phase=timeline?QRM.sceneAt(timeline,progress*timeline.total):Math.min(6,Math.floor(progress*7));$('cinema-glow').style.setProperty('--cinema-color',colors[phase%colors.length]);$('intro-clock').textContent=String(Math.floor(elapsed)).padStart(2,'0')+' / '+duration;
 if(elapsed>=duration){ended=true;pause();$('intro-pause').textContent='Ver de nuevo';say('ESTUDIO QR · Ideas que se transforman.');}}
 last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
