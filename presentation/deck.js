(() => {
  const D = window.DECK;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const heading = (title) => `<h1>${title}</h1>`;
  const appLink = (hash) => { const url = new URL(D.appUrl); url.hash = hash; return url.href; };
  const flow = (items) => `<ol class="flow">${items.map(item => `<li>${item}</li>`).join('')}</ol>`;
  function media(kind, path, label, duration) {
    if (!path) return `<div class="media-placeholder"><span class="media-symbol">${kind === 'video' ? '▷' : '▧'}</span><h2>${label}</h2><p>${duration}</p></div>`;
    return kind === 'video' ? `<video class="media" controls preload="metadata" src="${esc(path)}" poster="${esc(path.replace(/\.mp4$/, '-poster.jpg'))}" aria-label="${label}"></video>` : `<img class="media screenshot" src="${esc(path)}" alt="${label}">`;
  }
  const TAG = '<span class="mock-tag">Runs the app\'s simulation code in the browser · synthetic data</span>';
  function simSlide(title, simulator) {
    return `${heading(title)}<div class="live-toolbar">${simulator ? '<div class="view-tabs"><button data-view="scenarios" aria-pressed="true">Setup</button><button data-view="operations" aria-pressed="false">Live operations</button></div>' : '<span class="muted">Matched seeds · nearest vs coordinated</span>'}<div>${TAG}<button id="sim-reset">Reset</button><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><div class="sim-host" id="sim"></div></div>`;
  }
  function gate() {
    const v = D.validation;
    const valid = v && Number.isFinite(v.baselineMinutes) && v.baselineMinutes > 0 && Number.isFinite(v.coordinatedMinutes) && v.coordinatedMinutes >= 0 && Number.isInteger(v.eligibilityViolations) && v.eligibilityViolations >= 0 && typeof v.source === 'string' && v.source.trim() && typeof v.metric === 'string' && v.metric.trim();
    const reduction = valid ? (v.baselineMinutes - v.coordinatedMinutes) / v.baselineMinutes * 100 : null;
    const pass = valid && reduction >= 15 && v.eligibilityViolations === 0;
    return `${heading('The test has a clear gate.')}<div class="gate-rule"><strong>GO ≥15%</strong><span>Less average ambulance unavailable time.<br>Zero hospital eligibility violations.</span></div><div class="verdict ${valid ? pass ? 'pass' : 'fail' : 'pending'}"><h2>${valid ? pass ? 'GO' : 'NO-GO' : 'NOT TESTED'}</h2><strong>${valid ? `${Math.abs(reduction).toFixed(1)}% ${reduction >= 0 ? 'reduction' : 'increase'}` : 'Measured result pending'}</strong>${valid ? `<p>${esc(v.metric)}<br>${v.baselineMinutes} → ${v.coordinatedMinutes} min · ${v.eligibilityViolations} eligibility violations</p><small>${esc(v.source)} · synthetic evidence</small>` : '<p>Threshold set before the experiment.</p>'}</div>`;
  }
  const slides = {
    opening: () => `${heading('Every minute matters.')} ${media('video', D.media.openingVideo, 'Opening AI video', '1 minute · video to be added')}`,
    title: () => `<div class="title-slide"><span class="eyebrow">KINETIC · CSC454 / CSC491 · DEMO 1</span><h1>Emergency Transport Coordinator</h1><p class="pitch">Compare hospitals by travel + predicted offload time, so ambulances hand over sooner and get back on the road.</p><div class="team"><figure><img src="assets/azaria.jpg" alt=""><figcaption>Azaria Kelman</figcaption></figure><figure><img src="assets/richard.jpg" alt=""><figcaption>Richard Xu</figcaption></figure></div></div>`,
    baseline: () => `${heading('Today, the ambulance journey does not end at hospital arrival')}<div class="baseline-layout"><ol class="timeline">${['911 call','Patient assessment','Suitable hospitals','Destination decision','Transport','ARRIVAL','OFFLOAD WAIT','Patient handover','Ambulance available again'].map((s,i) => `<li class="${i===6?'bottleneck':i===5?'arrival':''}"><span>${s}</span></li>`).join('')}</ol><div class="baseline-message"><span class="eyebrow">THE BOTTLENECK</span><h2>Waiting here.<br>Unavailable for<br>the next call.</h2><p>Offload time → lost ambulance availability</p></div></div>`,
    cuj: () => { const steps = [['Open app',5,'none',0],['Read scenario defaults',20,'moderate',0],['Approval + Start',12,'moderate',0],['Sim plays to first case',9,'none',1],['Pause: decisions pile up',10,'severe',1],['Compare 5 ranked hospitals',20,'moderate',0],['Confirm',3,'none',0],['Check hospital network',20,'moderate',1]]; const metrics = [['Review → confirm','≤ 30 s','23 s',1],['Open → confirm','≤ 90 s','79 s',1],['Severe friction','0','1',0],['Context switches','≤ 2','2',1],['Decisions saved','100%','100/100',1],['Travel matches sim','100%','88/88',1],['Offload in range','≥ 80%','63%',0],['API p95 (local)','≤ 200 ms','16 ms',1]]; return `${heading('Baseline: one destination decision takes 79 s today.')}<div class="cuj"><div class="cuj-who"><div><span class="eyebrow">PERSONA</span><b>Maya, EMS flow lead.</b> Routes crews to emergency departments while 2 or 3 others wait on her.</div><div><span class="eyebrow">GOAL</span>Send a waiting ambulance to the hospital with the lowest travel + offload, saved, <b>in under 30 s without leaving the app.</b></div></div><div><div class="cuj-bar">${steps.map(([a,t,f],i) => `<div class="f-${f}" style="flex:${t}" title="${a}">${i+1}<span>${t} s</span></div>`).join('')}</div><div class="cuj-steps">${steps.map(([a,t,f,sw]) => `<div style="flex:${t}">${sw ? '<span class="switch">⇄ </span>' : ''}${a}</div>`).join('')}</div></div><div class="cuj-legend"><span><i class="f-none"></i>No friction</span><span><i class="f-moderate"></i>Moderate</span><span><i class="f-severe"></i>Severe: sim clock runs while Maya decides</span><span><b class="switch" style="color:var(--amber)">⇄</b> context switch</span><span style="margin-left:auto">99 s total · system times measured, user times estimated</span></div><div class="cuj-bottom"><div class="cuj-metrics">${metrics.map(([m,th,v,ok]) => `<div class="${ok ? '' : 'miss'}">${m}<b>${v}</b><small>target ${th} · ${ok ? 'pass' : 'fail'}</small></div>`).join('')}</div><div class="cuj-verdict"><span class="eyebrow">GO / NO-GO</span><strong>Technical: GO</strong><strong>User viability: <em>conditional</em></strong><span>2 misses. Fix first: auto-pause on pending decisions, calibrate the offload range.</span></div></div></div>`; },
    concept: () => `${heading('What if offload time became part of the destination decision?')}<div class="comparison"><section><h2>Current</h2>${flow(['Suitable hospitals','Current information','Choose destination','Travel','<em>Unknown offload wait</em>'])}</section><section class="target"><h2>Target</h2>${flow(['Suitable hospitals','<b>Travel + hospital state<br>+ inbound ambulances + predicted offload</b>','Compare destinations','<strong>Human chooses</strong>','Handover sooner → return to service'])}</section></div><p class="takeaway">Compare clinically appropriate hospitals by travel + expected offload.<br><strong>The user makes the final decision.</strong></p>`,
    product: () => `${heading('From patient details to a destination.')}<div class="live-toolbar"><div class="view-tabs"><button data-mode="demo" aria-pressed="true">Demo</button><button data-mode="live" aria-pressed="false">Try it live</button></div><div><span id="connection" role="status" class="mock-tag">HTML copy of the Overview · rankings from the app's simulation code · synthetic data</span><button id="mock-play">▶ Play demo</button><button id="mock-reset">Reset</button><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><div class="mock-host" id="mock"></div></div>`,
    simulator: () => simSlide('Testing live coordination without live EMS data', true),
    architecture: () => `${heading('Change the data source. Keep the workflow.')}<div class="architecture"><section class="architecture-flow"><span class="eyebrow">PROPOSED ARCHITECTURE</span>${flow(['<strong>Frontend</strong><small>Next.js</small>','<strong>Backend · API</strong><small>FastAPI · eligibility / prediction / ranking</small>','<strong>Data layer</strong><small>PostgreSQL / Supabase</small>'])}<div class="data-source">↑<strong>Simulator</strong><span>Future: operational feeds</span></div></section><dl class="decisions"><div><dt>Context</dt><dd>Dynamic hospital + ambulance state</dd></div><div><dt>Constraint</dt><dd>No live EMS integration</dd></div><div><dt>Options</dt><dd>Hardcoded demo / fake data in UI / simulator</dd></div><div class="chosen"><dt>Decision</dt><dd>Separate data generation from decision logic</dd></div><div><dt>Tradeoff</dt><dd>Controlled tests ≠ clinical effectiveness</dd></div></dl></div><div class="contract"><span>Built today: React/Vinext · TypeScript API + simulator · Cloudflare D1</span><code>POST /api/runs/:id/decisions {revision, ambulanceId, hospitalId} → 200 | 400 Zod | 409 stale revision</code><code>D1: simulation_runs · simulation_events</code></div>`,
    evaluation: () => simSlide('Does predicted offload improve the outcome?', false),
    gate,
    limits: () => `${heading('The boundary of our proof')}<div class="limits"><section><h2>Proven in the simulator</h2><ul class="proven"><li>End-to-end data flow</li><li>Dynamic state updates</li><li>Destination comparison</li><li>Quantitative evaluation</li></ul></section><section><h2>Not proven</h2><ul class="unproven"><li>Actual Ontario operational data</li><li>Clinical outcome improvement</li><li>PDS / hospital integration</li></ul></section></div><p class="takeaway">Next: real operational data + EMS partners.</p>`,
  };
  let generation = 0;
  async function healthCheck() {
    const current = generation;
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json(); if (!data.ok) throw new Error();
      if (current !== generation) return;
      $('#connection').textContent = 'Live · synthetic data'; $('#offline').hidden = true;
    } catch {
      if (current !== generation || !$('#connection')) return;
      $('#connection').textContent = 'App offline'; $('#offline').hidden = false;
    }
  }
  // Simulator and evaluation run offline on sim.js; no app connection needed.
  let sim = null;
  function mountSim(simulator) {
    const tabs = document.querySelectorAll('[data-view]');
    const mark = (v) => tabs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    sim = simulator ? window.mountSimulator($('#sim'), mark) : window.mountEvaluation($('#sim'));
    tabs.forEach(b => b.onclick = () => sim.setView(b.dataset.view));
    $('#sim-reset').onclick = () => sim.reset();
    $('#fullscreen').onclick = () => { const p = document.fullscreenElement ? document.exitFullscreen() : $('#app-frame').requestFullscreen?.(); p?.catch(() => {}); };
  }
  // Product slide: clickable copy of the Overview with an autoplay cursor, or the real app.
  let mock = null;
  function mountProduct() {
    const frame = $('#app-frame'), tag = $('#connection').textContent;
    const startMock = () => {
      frame.innerHTML = '<div class="mock-host" id="mock"></div>';
      mock = window.mountMock($('#mock'));
      $('#mock').addEventListener('mockplay', e => { $('#mock-play').textContent = e.detail ? '■ Stop' : '▶ Play demo'; });
    };
    startMock();
    $('#mock-play').onclick = () => mock && (mock.playing ? mock.stop() : mock.play());
    $('#mock-reset').onclick = () => mock?.reset();
    $('#fullscreen').onclick = () => { const p = document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen?.(); p?.catch(() => {}); };
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      const live = b.dataset.mode === 'live';
      mock?.destroy(); mock = null;
      document.querySelectorAll('[data-mode]').forEach(btn => btn.setAttribute('aria-pressed', String(btn === b)));
      $('#mock-play').hidden = $('#mock-reset').hidden = live;
      if (!live) { startMock(); $('#connection').textContent = tag; return; }
      frame.innerHTML = `<iframe src="${esc(appLink('overview'))}" title="Patient overview" allow="fullscreen"></iframe><div id="offline" hidden><h2>Start the app to continue</h2><code>cd ambulance-flow && npm run dev</code><button id="reconnect">Retry connection</button></div>`;
      $('#connection').textContent = 'Connecting…';
      $('#reconnect').onclick = () => { frame.querySelector('iframe').src += ''; void healthCheck(); };
      void healthCheck();
    });
  }
  const readHash = () => Math.max(0,D.chapters.findIndex(c => c.id===location.hash.slice(1)));
  let index=readHash();
  function render() {
    generation++; mock?.destroy(); mock = null; sim?.destroy(); sim = null;
    $('video')?.pause();
    const c=D.chapters[index];
    $('#chapter').innerHTML = slides[c.id]();
    $('#chapters').innerHTML=D.chapters.map((ch,i)=>`<button data-go="${i}" aria-label="Slide ${ch.number}: ${ch.label}" ${i===index?'aria-current="step"':''}>${ch.number}</button>`).join('');
    document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(Number(b.dataset.go)));
    $('#timing').textContent=`${c.time} · ${c.label}`;
    $('#prev').disabled=index===0; $('#next').disabled=index===D.chapters.length-1;
    if(c.id==='simulator'||c.id==='evaluation') mountSim(c.id==='simulator');
    if(c.id==='product') mountProduct();
    document.querySelectorAll('.media').forEach(el => el.addEventListener('error',()=> { el.outerHTML='<div class="media-placeholder"><h2>Media unavailable</h2><p>Check the asset path in content.js.</p></div>'; },{once:true}));
  }
  function go(i) { index=Math.max(0,Math.min(D.chapters.length-1,i));history.replaceState(null,'',`#${D.chapters[index].id}`);render();$('#chapter').focus({preventScroll:true}); }
  $('#prev').onclick=()=>go(index-1);$('#next').onclick=()=>go(index+1);
  addEventListener('hashchange',()=>{index=readHash();render();});
  addEventListener('keydown',e=>{
    if(e.target.closest?.('input,textarea,select,video')||e.altKey||e.metaKey||e.ctrlKey)return;
    if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();go(index+1);}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(index-1);}
    else if(e.key.toLowerCase()==='t')toggleTimer();
    else if(/^[1-9]$/.test(e.key))go(D.chapters.findIndex(c=>c.number===e.key));
  });
  let left=600, running=false, deadline=0;
  function paintTimer(){ $('#timer-main').textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;$('#timer-main').classList.toggle('running',running);$('#timer-main').setAttribute('aria-pressed',String(running)); }
  function toggleTimer(){if(running){left=Math.max(0,Math.ceil((deadline-Date.now())/1000));running=false;}else if(left>0){deadline=Date.now()+left*1000;running=true;}paintTimer();}
  setInterval(()=>{if(running){left=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(!left)running=false;paintTimer();}},250);
  $('#timer-main').onclick=toggleTimer;$('#timer-reset').onclick=()=>{running=false;left=600;paintTimer();};
  paintTimer();render();
})();
