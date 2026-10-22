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
  function live(title, hash, simulator = false) {
    return `${title ? heading(title) : ''}<div class="live-toolbar">${simulator ? '<div class="view-tabs"><button data-view="scenarios" aria-pressed="true">Setup</button><button data-view="operations" aria-pressed="false">Live operations</button></div>' : '<span class="muted">Matched seeds · nearest vs coordinated</span>'}<div><span id="connection" role="status">Connecting…</span><button id="retry">Reload</button><a id="open-app" href="${esc(appLink(hash))}" target="_blank" rel="noreferrer">Open app ↗</a><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><iframe src="${esc(appLink(hash))}" title="${simulator ? 'Ambulance simulator' : 'Routing evaluation'}" allow="fullscreen"></iframe><div id="offline" hidden><h2>Start the app to continue</h2><code>cd ambulance-flow && npm run dev</code><button id="reconnect">Retry connection</button></div></div>`;
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
    const status = valid ? pass ? 'GO' : 'NO-GO' : 'NOT TESTED YET';
    const conds = [['≥ 15%', 'less time each ambulance is unavailable per call', valid ? reduction >= 15 : null, valid ? `${reduction.toFixed(1)}%` : ''], ['0', 'patients sent to a hospital that cannot treat them', valid ? v.eligibilityViolations === 0 : null, valid ? `${v.eligibilityViolations}` : '']];
    return `${heading('Go / no-go: what would prove it works?')}<div class="gate"><section><p class="gate-lead">Compared with sending each ambulance to the nearest hospital, on the same simulated shifts, we call it a <b>GO</b> only if both are true:</p>${conds.map(([n, t, ok, got]) => `<div class="gate-cond ${ok === null ? '' : ok ? 'ok' : 'bad'}"><strong>${n}</strong><span>${t}</span>${ok === null ? '' : `<em>${ok ? '✓' : '✗'} ${got}</em>`}</div>`).join('')}<p class="gate-foot">Both thresholds were set before running the test.</p></section><section class="verdict ${valid ? pass ? 'pass' : 'fail' : 'pending'}"><span class="eyebrow">RESULT</span><h2>${status}</h2>${valid ? `<p>${esc(v.metric)}<br>${v.baselineMinutes} → ${v.coordinatedMinutes} min</p><small>${esc(v.source)} · synthetic evidence</small>` : '<p>Slide 8 measures offload and travel time. It does not yet measure full-call unavailable time or eligibility violations.</p><p class="gate-next"><b>Next:</b> add both to the evaluation, then rerun.</p>'}</section></div>`;
  }
  const slides = {
    opening: () => `${heading('Every minute matters.')} ${media('video', D.media.openingVideo, 'Opening AI video', '1 minute · video to be added')}`,
    title: () => `<div class="title-slide"><span class="eyebrow">KINETIC · CSC454 / CSC491 · DEMO 1</span><h1>Emergency Transport Coordinator</h1><p class="pitch">Compare hospitals by travel + predicted offload time, so ambulances hand over sooner and get back on the road.</p><div class="team"><figure><img src="assets/azaria.jpg" alt=""><figcaption>Azaria Kelman</figcaption></figure><figure><img src="assets/richard.jpg" alt=""><figcaption>Richard Xu</figcaption></figure></div></div>`,
    baseline: () => `${heading('For the patient, arriving is not the end of the wait')}<div class="baseline-layout"><ol class="timeline">${['911 call','Patient assessment','Suitable hospitals','Destination decision','Transport','ARRIVAL / DROP-OFF','WAITING FOR CARE','Hospital care begins'].map((s,i) => `<li class="${i===6?'bottleneck':i===5?'arrival':''}"><span>${s}</span></li>`).join('')}</ol><div class="baseline-message"><span class="eyebrow">THE BOTTLENECK</span><h2>At the hospital.<br>Still waiting<br>for care.</h2><p>Hospital arrival ≠ care begins</p></div></div>`,
    concept: () => `${heading('What if offload time became part of the destination decision?')}<div class="comparison"><section><h2>Current</h2>${flow(['Suitable hospitals','Current information','Choose destination','Travel','<em>Unknown offload wait</em>'])}</section><section class="target"><h2>Target</h2>${flow(['Suitable hospitals','<b>Travel + hospital state<br>+ inbound ambulances + predicted offload</b>','Compare destinations','<strong>Human chooses</strong>','Handover sooner → return to service'])}</section></div><p class="takeaway">Compare clinically appropriate hospitals by travel + expected offload.<br><strong>The user makes the final decision.</strong></p>`,
    product: () => `${heading('From patient details to a destination.')}<div class="live-toolbar"><div class="view-tabs"><button data-mode="demo" aria-pressed="true">Demo</button><button data-mode="live" aria-pressed="false">Try it live</button></div><div><span id="connection" role="status" class="mock-tag">HTML copy of the Overview · rankings from the app's simulation code · synthetic data</span><button id="mock-play">▶ Play demo</button><button id="mock-reset">Reset</button><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><div class="mock-host" id="mock"></div></div>`,
    screenshot: () => `${heading('Compare. Choose. Start the journey.')} ${media('image',D.media.productScreenshot,'Actual app screenshot','Image to be added')}`,
    simulator: () => live('','scenarios',true),
    architecture: () => `${heading('Change the data source. Keep the workflow.')}<div class="architecture"><section class="architecture-flow"><span class="eyebrow">PROPOSED ARCHITECTURE</span>${flow(['<strong>Frontend</strong><small>Next.js</small>','<strong>Backend · API</strong><small>FastAPI · eligibility / prediction / ranking</small>','<strong>Data layer</strong><small>PostgreSQL / Supabase</small>'])}<div class="data-source">↑<strong>Simulator</strong><span>Future: operational feeds</span></div></section><dl class="decisions"><div><dt>Context</dt><dd>Dynamic hospital + ambulance state</dd></div><div><dt>Constraint</dt><dd>No live EMS integration</dd></div><div><dt>Options</dt><dd>Hardcoded demo / fake data in UI / simulator</dd></div><div class="chosen"><dt>Decision</dt><dd>Separate data generation from decision logic</dd></div><div><dt>Tradeoff</dt><dd>Controlled tests ≠ clinical effectiveness</dd></div></dl></div><p class="implementation">Current prototype: React/Vinext · TypeScript API + simulator · Cloudflare D1. Source replacement still requires an adapter.</p>`,
    evaluation: () => simSlide('Does predicted offload improve the outcome?', false),
    gate,
    limits: () => `${heading('The boundary of our proof')}<div class="limits"><section><h2>Proven in the simulator</h2><ul class="proven"><li>End-to-end data flow</li><li>Dynamic state updates</li><li>Destination comparison</li><li>Quantitative evaluation</li></ul></section><section><h2>Not proven</h2><ul class="unproven"><li>Actual Ontario operational data</li><li>Clinical outcome improvement</li><li>Patient Distribution System / hospital integration</li></ul></section></div><p class="takeaway">Next: real operational data + EMS partners.</p>`,
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
  function mountLive() {
    const frame = $('iframe');
    const reload = () => { frame.src = frame.src; void healthCheck(); };
    $('#retry').onclick = reload; $('#reconnect').onclick = reload;
    $('#fullscreen').onclick = () => { const promise = document.fullscreenElement ? document.exitFullscreen() : $('#app-frame').requestFullscreen?.(); promise?.catch(() => {}); };
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
      frame.src = appLink(b.dataset.view); $('#open-app').href = frame.src;
      document.querySelectorAll('[data-view]').forEach(btn => btn.setAttribute('aria-pressed',String(btn===b)));
    });
    void healthCheck();
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
    if(c.id==='simulator') mountLive();
    if(c.id==='evaluation') mountSim(false);
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
