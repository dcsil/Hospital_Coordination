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
  // Results slide: baseline vs our app for each stat (evaluation-results.js).
  const STATS = [['completed', 'Completed', '', 1], ['meanOffload', 'Mean offload', ' min', -1], ['meanTravel', 'Mean travel', ' min', -1]];
  function results() {
    const R = window.EVAL_RESULTS.metrics;
    const groups = STATS.map(([k, label, unit, dir]) => {
      const m = R[k], max = Math.max(m.baseline, m.coordinated) * 1.15;
      const sure = m.ciLow * m.ciHigh > 0, tone = !sure ? 'flat' : m.delta * dir > 0 ? 'good' : 'bad';
      const bar = (v, cls) => `<div class="rc-col"><b>${v}${unit}</b><i class="${cls}" style="height:calc(${(v / max * 100).toFixed(1)}% - 30px)"></i></div>`;
      return `<div class="rc-group"><div class="rc-bars">${bar(m.baseline, 'base')}${bar(m.coordinated, 'ours')}</div><strong>${label}</strong><span class="rc-delta ${tone}">${tone === 'flat' ? 'no clear change' : `${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}${unit} (${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta / m.baseline * 100).toFixed(0)}%)`}</span></div>`;
    }).join('');
    return `${heading('Early simulation results')}<div class="rc"><div class="rc-legend"><span><i class="base"></i>Baseline: nearest hospital</span><span><i class="ours"></i>Our app</span></div><div class="rc-chart">${groups}</div><p class="rc-foot">We used a Python simulation with synthetic data (mean of 5 simulated shifts). Later on we will improve the data.</p></div>`;
  }
  const slides = {
    opening: () => `${heading('Every minute matters.')} ${media('video', D.media.openingVideo, 'Opening AI video', '1 minute · video to be added')}`,
    title: () => `<div class="title-slide"><span class="eyebrow">KINETIC · CSC454 / CSC491 · DEMO 1</span><h1>Emergency Transport Coordinator</h1><div class="team"><figure><img src="assets/azaria.jpg" alt=""><figcaption>Azaria Kelman</figcaption></figure><figure><img src="assets/richard.jpg" alt=""><figcaption>Richard Xu</figcaption></figure></div></div>`,
    baseline: () => `${heading('For the patient, arriving is not the end of the wait')}<div class="baseline-layout"><ol class="timeline">${['911 call','Patient assessment','Suitable hospitals','Destination decision','Transport','ARRIVAL / DROP-OFF','WAITING FOR CARE','Hospital care begins'].map((s,i) => `<li class="${i===6?'bottleneck':i===5?'arrival':''}"><span>${s}</span></li>`).join('')}</ol><div class="baseline-message"><span class="eyebrow">THE BOTTLENECK</span><h2>At the hospital.<br>Still waiting<br>for care.</h2><p>Hospital arrival ≠ care begins</p></div></div>`,
    concept: () => `${heading('What if offload time became part of the destination decision?')}<div class="comparison"><section><h2>Current</h2>${flow(['Suitable hospitals','Current information','Choose destination','Travel','<em>Unknown offload wait</em>'])}</section><section class="target"><h2>Target</h2>${flow(['Suitable hospitals','<b>Travel + hospital state<br>+ inbound ambulances + predicted offload</b>','Compare destinations','<strong>Human chooses</strong>','Handover sooner → return to service'])}</section></div><p class="takeaway">Compare clinically appropriate hospitals by travel + expected offload.<br><strong>The user makes the final decision.</strong></p>`,
    product: () => `<div class="live-toolbar"><div class="view-tabs"><button data-mode="demo" aria-pressed="true">Demo</button><button data-mode="live" aria-pressed="false">Try it live</button></div><div><span id="connection" role="status" class="mock-tag">HTML copy of the Overview · rankings from the app's simulation code · synthetic data</span><button id="mock-play">▶ Play demo</button><button id="mock-pause" hidden>❚❚ Pause</button><button id="mock-reset">Reset</button><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><div class="mock-host" id="mock"></div></div>`,
    architecture: () => `${heading('Change the data source. Keep the workflow.')}<div class="arch"><span class="eyebrow">PROPOSED ARCHITECTURE</span><div class="arch-grid">
      <div class="arch-node"><span class="arch-tag">Frontend</span><strong>Next.js</strong><small>Patient overview and dispatcher views</small></div>
      <div class="arch-link"><span>REST · JSON</span></div>
      <div class="arch-node arch-backend"><span class="arch-tag">Backend · API</span><strong>FastAPI</strong><small>Used Python to help with modelling</small></div>
      <div class="arch-link"><span>SQL</span></div>
      <div class="arch-node"><span class="arch-tag">Data layer</span><strong>PostgreSQL</strong><small>Local database: runs, events, hospital state</small></div>
      <div class="arch-split"><div class="arch-side hosp"><span>🏥 Hospital side</span><ul><li>Eligibility rules</li><li>Offload prediction</li><li>Queue + inbound state</li></ul></div><div class="arch-side amb"><span>🚑 Ambulance side</span><ul><li>Hospital ranking</li><li>Decision endpoint</li><li>Fleet status</li></ul></div></div>
      <div class="arch-feed"><b>↑</b><div><strong>Simulator</strong><small>Synthetic calls and hospital reports today</small></div><div class="arch-future"><strong>Operational feeds</strong><small>Future, through an adapter</small></div></div>
    </div></div>`,
    evaluation: () => `<div class="live-toolbar"><span class="muted">The real app · Evaluation page · matched seeds, nearest vs coordinated</span><div><span id="connection" role="status">Connecting…</span><button id="retry">Reload</button><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><iframe src="${esc(appLink('evaluation'))}" title="Routing evaluation" allow="fullscreen"></iframe><div id="offline" hidden><h2>Start the app to continue</h2><code>cd ambulance-flow && npm run dev</code><button id="reconnect">Retry connection</button></div></div>`,
    results,
    closing: () => `<div class="title-slide closing"><span class="eyebrow">KINETIC · EMERGENCY TRANSPORT COORDINATOR</span><h1>Thank you</h1><p class="tagline">Less time waiting at the hospital.</p><p class="questions">Questions?</p></div>`,
    limits: () => `${heading('The boundary of our proof')}<div class="limits"><section><h2>Shown in Our MVP</h2><ul class="proven"><li>End-to-end data flow</li><li>Dynamic state updates</li><li>Destination comparison</li><li>Quantitative evaluation</li></ul></section><section><h2>Not proven</h2><ul class="unproven"><li>Actual Ontario operational data</li><li>Patient Distribution System / hospital integration</li><li>Clinical outcome improvement</li></ul></section></div><p class="takeaway">Next: real operational data + EMS partners.</p>`,
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
  // Product slide: clickable copy of the Overview with an autoplay cursor, or the real app.
  let mock = null;
  function mountProduct() {
    const frame = $('#app-frame'), tag = $('#connection').textContent;
    const startMock = () => {
      frame.innerHTML = '<div class="mock-host" id="mock"></div>';
      mock = window.mountMock($('#mock'));
      $('#mock').addEventListener('mockplay', e => { $('#mock-play').textContent = e.detail ? '■ Stop' : '▶ Play demo'; $('#mock-pause').hidden = !e.detail; });
      $('#mock').addEventListener('mockpause', e => { $('#mock-pause').textContent = e.detail ? '▶ Resume' : '❚❚ Pause'; });
    };
    startMock();
    $('#mock-play').onclick = () => mock && (mock.playing ? mock.stop() : mock.play());
    $('#mock-reset').onclick = () => mock?.reset();
    $('#mock-pause').onclick = () => mock?.togglePause();
    $('#fullscreen').onclick = () => { const p = document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen?.(); p?.catch(() => {}); };
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      const live = b.dataset.mode === 'live';
      mock?.destroy(); mock = null;
      document.querySelectorAll('[data-mode]').forEach(btn => btn.setAttribute('aria-pressed', String(btn === b)));
      $('#mock-play').hidden = $('#mock-reset').hidden = live; $('#mock-pause').hidden = true;
      if (!live) { startMock(); $('#connection').textContent = tag; return; }
      frame.innerHTML = `<iframe src="${esc(appLink('overview'))}" title="Patient overview" allow="fullscreen"></iframe><div id="offline" hidden><h2>Start the app to continue</h2><code>cd ambulance-flow && npm run dev</code><button id="reconnect">Retry connection</button></div>`;
      $('#connection').textContent = 'Connecting…';
      $('#reconnect').onclick = () => { frame.querySelector('iframe').src += ''; void healthCheck(); };
      void healthCheck();
    });
  }
  // Evaluation slide: the real app's Evaluation page.
  function mountEvaluation() {
    const frame = $('#app-frame iframe');
    const reload = () => { frame.src = frame.src; void healthCheck(); };
    $('#retry').onclick = reload; $('#reconnect').onclick = reload;
    $('#fullscreen').onclick = () => { const p = document.fullscreenElement ? document.exitFullscreen() : $('#app-frame').requestFullscreen?.(); p?.catch(() => {}); };
    void healthCheck();
  }
  const readHash = () => Math.max(0,D.chapters.findIndex(c => c.id===location.hash.slice(1)));
  let index=readHash();
  function render() {
    generation++; mock?.destroy(); mock = null;
    $('video')?.pause();
    const c=D.chapters[index];
    $('#chapter').innerHTML = slides[c.id]();
    $('#chapters').innerHTML=D.chapters.map((ch,i)=>`<button data-go="${i}" aria-label="Slide ${ch.number}: ${ch.label}" ${i===index?'aria-current="step"':''}>${ch.number}</button>`).join('');
    document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(Number(b.dataset.go)));
    $('#timing').textContent=`${c.time} · ${c.label}`;
    $('#prev').disabled=index===0; $('#next').disabled=index===D.chapters.length-1;
    if(c.id==='evaluation') mountEvaluation();
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
