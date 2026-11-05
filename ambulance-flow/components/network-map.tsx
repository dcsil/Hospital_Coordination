'use client';
import { useRef, useState } from 'react';
import { Plus, Minus, LocateFixed, Layers } from 'lucide-react';
import { HOSPITAL_SITES, forecast, patientTransports, type Run, type Point } from '@/lib/simulation';
const xy = (p: Point) => ({ x: 70 + (p.lng + 79.49) / .2 * 850, y: 510 - (p.lat - 43.63) / .11 * 450 });
export default function NetworkMap({ run, onAmbulance, onHospital, selected }: { run: Run | null; onAmbulance?: (id: string) => void; onHospital?: (id: string) => void; selected?: string }) {
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const [routes, setRoutes] = useState(true); const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const hospitals = run?.hospitals ?? HOSPITAL_SITES.slice(0, 5);
  return <div className="network-map">
    <div className="map-label"><span className="status-dot"/> TORONTO REGION <span>/</span> {hospitals.length} SITES</div>
    <svg className="map-canvas" viewBox="0 0 1000 590" aria-label="Patient transport simulation map. Select hospital or ambulance markers to inspect them." onPointerDown={e => { if ((e.target as Element).closest('[role="button"]')) return; drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current) { const scale = 1000 / e.currentTarget.getBoundingClientRect().width; setPan({ x: drag.current.px + (e.clientX - drag.current.x) * scale, y: drag.current.py + (e.clientY - drag.current.y) * scale }); } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <defs><pattern id="blocks" width="45" height="36" patternTransform="rotate(-13)" patternUnits="userSpaceOnUse"><rect width="45" height="36" fill="#eaf0eb"/><rect x="3" y="3" width="38" height="29" rx="2" fill="#e2e8e2"/><path d="M0 0H45M0 0V36" stroke="#fafbf8" strokeWidth="3"/></pattern><filter id="marker-shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity=".12"/></filter></defs>
      <rect width="1000" height="590" fill="#dcebea"/>
      <g transform={`translate(${pan.x} ${pan.y}) translate(500 295) scale(${zoom}) translate(-500 -295)`}>
        <path d="M-500 -500H1500V430L940 419 835 460 754 435 680 481 590 465 510 502 435 508 368 481 260 480 165 459 82 450 -500 610Z" fill="url(#blocks)"/>
        <path d="M580 -40Q650 80 615 160T660 260 675 360L730 455" fill="none" stroke="#cbdcca" strokeWidth="25"/><path d="M580 -40Q650 80 615 160T660 260 675 360L730 455" fill="none" stroke="#d2e5e6" strokeWidth="5"/>
        <path d="M140 300l65 -16 20 95 -62 15zM355 140l58 -16 18 85 -54 17zM720 50l125 -20 10 90 -110 23z" fill="#cadcc7"/>
        {[90,175,270,370,460].map(y => <g key={y}><path d={`M-50 ${y + 120}L1100 ${y - 130}`} stroke="#d9ddd4" strokeWidth="13"/><path d={`M-50 ${y + 120}L1100 ${y - 130}`} stroke="#fffefa" strokeWidth="8"/></g>)}
        {[150,260,390,510,790,890].map(x => <path key={x} d={`M${x - 80} -50L${x + 60} 500`} stroke="#fffefa" strokeWidth="7"/>)}
        <path d="M-20 430Q200 370 380 420T760 400L1030 320" stroke="#d5cdb0" strokeWidth="11" fill="none"/><path d="M-20 430Q200 370 380 420T760 400L1030 320" stroke="#f8f0d8" strokeWidth="7" fill="none"/>
        <g className="map-place"><text x="195" y="238">WEST END</text><text x="380" y="82">MIDTOWN</text><text x="810" y="310">EAST YORK</text><text x="470" y="437">DOWNTOWN</text><text x="675" y="550" className="lake-label">LAKE ONTARIO</text></g>
        <g className="map-road"><text x="80" y="398" transform="rotate(-12 80 398)">BLOOR STREET</text><text x="670" y="185" transform="rotate(-12 670 185)">EGLINTON AVENUE</text></g>

        {routes && run?.ambulances.filter(a => a.status === 'EN_ROUTE').map(a => { const h = run.hospitals.find(h => h.id === a.destination)!; const start = xy(a), end = xy(h); return <path key={a.id} d={`M${start.x} ${start.y}L${start.x} ${end.y}L${end.x} ${end.y}`} fill="none" stroke={a.id === selected ? '#114d3e' : '#70a38c'} strokeWidth={a.id === selected ? 3 : 1.7} strokeDasharray="5 4" opacity={a.id === selected ? 1 : .55}/>; })}
        {hospitals.map(h => { const p = xy(h); const live = run?.hospitals.find(x => x.id === h.id); const pred = live && run ? forecast(run, live).offload : 0; const color = pred > 45 ? '#c15b42' : pred > 30 ? '#b98d35' : '#287761'; return <g key={h.id} role="button" tabIndex={0} aria-label={`Inspect ${h.name}`} onClick={() => onHospital?.(h.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHospital?.(h.id); } }} className="map-marker" transform={`translate(${p.x} ${p.y})`}><circle r="28" fill={color} opacity=".09"/><rect x="-14" y="-14" width="28" height="28" rx="8" fill="white" stroke={color} strokeWidth="2" filter="url(#marker-shadow)"/><path d="M-6 0H6M0 -6V6" stroke={color} strokeWidth="3"/><rect x="19" y="-12" rx="5" width={h.short.length * 9 + 16} height="24" fill="#ffffffed"/><text x="27" y="4" className="map-hospital-label">{h.short}</text></g>; })}
        {(run?patientTransports(run):[]).map(a => { const p = xy(a); const color = a.status === 'AWAITING_DECISION' ? '#b67f22' : '#256e59'; return <g key={a.id} transform={`translate(${p.x} ${p.y})`} className="map-marker" role="button" tabIndex={0} aria-label={`Inspect ${a.id}: ${a.status}`} onClick={() => onAmbulance?.(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAmbulance?.(a.id); } }}><circle r={selected === a.id ? 14 : 8} fill={color} stroke="white" strokeWidth="2"/><path d="M-3 0H3M0 -3V3" stroke="white" strokeWidth="1.5"/></g>; })}
      </g>
    </svg>
    <div className="map-tools"><button aria-label="Zoom in" onClick={() => setZoom(Math.min(3, zoom + .3))}><Plus size={16}/></button><button aria-label="Zoom out" onClick={() => setZoom(Math.max(.7, zoom - .3))}><Minus size={16}/></button><button aria-label="Reset map" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><LocateFixed size={16}/></button><button aria-label="Toggle routes" aria-pressed={routes} onClick={() => setRoutes(!routes)}><Layers size={16}/></button></div>
    <div className="map-legend"><span><i className="legend-hospital"/>Hospital</span><span><i className="legend-dot"/>Ambulance</span><span className="map-disclaimer">Simulation schematic · estimated travel</span></div>
  </div>;
}
