(() => {
  const D = window.DECK;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const heading = (title) => `<h1>${title}</h1>`;
  const appLink = (hash) => { const url = new URL(D.appUrl); url.hash = hash; return url.href; };
  const flow = (items) => `<ol class="flow">${items.map(item => `<li>${item}</li>`).join('')}</ol>`;
  function media(kind, path, label, duration) {
    if (!path) return `<div class="media-placeholder"><span class="media-symbol">${kind === 'video' ? '▷' : '▧'}</span><h2>${label}</h2><p>${duration}</p></div>`;
    return kind === 'video' ? `<video class="media" controls preload="metadata" src="${esc(path)}" aria-label="${label}"></video>` : `<img class="media screenshot" src="${esc(path)}" alt="${label}">`;
  }
  function live(title, hash, simulator = false) {
    return `${heading(title)}<div class="live-toolbar">${simulator ? '<div class="view-tabs"><button data-view="scenarios" aria-pressed="true">Setup</button><button data-view="operations" aria-pressed="false">Live operations</button></div>' : '<span class="muted">Matched seeds · nearest vs coordinated</span>'}<div><span id="connection" role="status">Connecting…</span><button id="retry">Reload</button><a id="open-app" href="${esc(appLink(hash))}" target="_blank" rel="noreferrer">Open app ↗</a><button id="fullscreen">Full screen</button></div></div><div class="app-frame" id="app-frame"><iframe src="${esc(appLink(hash))}" title="${simulator ? 'Ambulance simulator' : 'Routing evaluation'}" allow="fullscreen"></iframe><div id="offline" hidden><h2>Start the app to continue</h2><code>cd ambulance-flow && npm run dev</code><button id="reconnect">Retry connection</button></div></div>`;
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
    baseline: () => `${heading('For the patient, arriving is not the end of the wait')}<div class="baseline-layout"><ol class="timeline">${['911 call','Patient assessment','Suitable hospitals','Destination decision','Transport','ARRIVAL / DROP-OFF','WAITING FOR CARE','Hospital care begins'].map((s,i) => `<li class="${i===6?'bottleneck':i===5?'arrival':''}"><span>${s}</span></li>`).join('')}</ol><div class="baseline-message"><span class="eyebrow">THE BOTTLENECK</span><h2>At the hospital.<br>Still waiting<br>for care.</h2><p>Hospital arrival ≠ care begins</p></div></div>`,
    concept: () => `${heading('What if offload time became part of the destination decision?')}<div class="comparison"><section><h2>Current</h2>${flow(['Suitable hospitals','Current information','Choose destination','Travel','<em>Unknown offload wait</em>'])}</section><section class="target"><h2>Target</h2>${flow(['Suitable hospitals','<b>Travel + hospital state<br>+ inbound ambulances + predicted offload</b>','Compare destinations','<strong>Human chooses</strong>','Handover sooner → return to service'])}</section></div><p class="takeaway">Compare clinically appropriate hospitals by travel + expected offload.<br><strong>The user makes the final decision.</strong></p>`,
    product: () => `${heading('From patient details to a destination.')} ${media('video',D.media.productVideo,'Working product demo','30 seconds · video to be added')}`,
    screenshot: () => `${heading('Compare. Choose. Start the journey.')} ${media('image',D.media.productScreenshot,'Actual app screenshot','Image to be added')}`,
    simulator: () => live('Testing live coordination without live EMS data','scenarios',true),
    architecture: () => `${heading('Change the data source. Keep the workflow.')}<div class="architecture"><section class="architecture-flow"><span class="eyebrow">PROPOSED ARCHITECTURE</span>${flow(['<strong>Frontend</strong><small>Next.js</small>','<strong>Backend · API</strong><small>FastAPI · eligibility / prediction / ranking</small>','<strong>Data layer</strong><small>PostgreSQL / Supabase</small>'])}<div class="data-source">↑<strong>Simulator</strong><span>Future: operational feeds</span></div></section><dl class="decisions"><div><dt>Context</dt><dd>Dynamic hospital + ambulance state</dd></div><div><dt>Constraint</dt><dd>No live EMS integration</dd></div><div><dt>Options</dt><dd>Hardcoded demo / fake data in UI / simulator</dd></div><div class="chosen"><dt>Decision</dt><dd>Separate data generation from decision logic</dd></div><div><dt>Tradeoff</dt><dd>Controlled tests ≠ clinical effectiveness</dd></div></dl></div><p class="implementation">Current prototype: React/Vinext · TypeScript API + simulator · Cloudflare D1. Source replacement still requires an adapter.</p>`,
    evaluation: () => live('Does predicted offload improve the outcome?','evaluation'),
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
  const readHash = () => Math.max(0,D.chapters.findIndex(c => c.id===location.hash.slice(1)));
  let index=readHash();
  function render() {
    generation++;
    $('video')?.pause();
    const c=D.chapters[index];
    $('#chapter').innerHTML = slides[c.id]();
    $('#chapters').innerHTML=D.chapters.map((ch,i)=>`<button data-go="${i}" aria-label="Slide ${ch.number}: ${ch.label}" ${i===index?'aria-current="step"':''}>${ch.number}</button>`).join('');
    document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(Number(b.dataset.go)));
    $('#timing').textContent=`${c.time} · ${c.label}`;
    $('#prev').disabled=index===0; $('#next').disabled=index===D.chapters.length-1;
    if(c.id==='simulator'||c.id==='evaluation') mountLive();
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
    else if(/^[1-8]$/.test(e.key))go(D.chapters.findIndex(c=>c.number===e.key));
  });
  let left=600, running=false, deadline=0;
  function paintTimer(){ $('#timer-main').textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;$('#timer-main').classList.toggle('running',running);$('#timer-main').setAttribute('aria-pressed',String(running)); }
  function toggleTimer(){if(running){left=Math.max(0,Math.ceil((deadline-Date.now())/1000));running=false;}else if(left>0){deadline=Date.now()+left*1000;running=true;}paintTimer();}
  setInterval(()=>{if(running){left=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(!left)running=false;paintTimer();}},250);
  $('#timer-main').onclick=toggleTimer;$('#timer-reset').onclick=()=>{running=false;left=600;paintTimer();};
  paintTimer();render();
})();
