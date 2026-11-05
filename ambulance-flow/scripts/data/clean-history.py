"""Rebuild local historical data. Python standard library only; no runtime network."""
import csv, hashlib, json, statistics
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
# Chart page 3: blue bar endpoints in PDF points, zero=227.9956, 60=522.185.
# These are digitized approximations, not published numeric table values.
names = ['North York General', 'Sunnybrook', 'Michael Garron', 'Scarborough Birchmount', 'Humber River', 'Etobicoke General', 'Mount Sinai', 'Scarborough Centenary', 'Scarborough General', 'Toronto General', 'St. Michael’s', 'Toronto Western', "St. Joseph's"]
ends = [341.88,363.12,402.48,404.399,408.48,430.32,440.399,441.36,462.36,510.12,511.56,517.92,522.43]
offloads = [{'hospital': n, 'meanMinutes': round((x-227.9956)/(522.185-227.9956)*60), 'period': '2022–2023', 'approximate': True} for n,x in zip(names,ends)]
(DATA/'toronto-offload.json').write_text(json.dumps(offloads, indent=2)+'\n')
rows=[]
source_rows=list(csv.DictReader((DATA/'ontario-ed-source.csv').open()))
for r in source_rows:
    try:
        mean, p90, cases = float(r['mean_hours']), float(r['p90_hours']), int(r['cases'])
        if min(mean,p90,cases)<0: continue
    except (ValueError,TypeError): continue
    rows.append({'month':r['month'],'indicator':r['indicator'],'snum':r['snum'],'hospital':r['hospital'],'meanMinutes':round(mean*60,2),'p90Minutes':round(p90*60,2),'cases':cases})
with (DATA/'ontario-ed-clean.csv').open('w') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
# Stable source IDs prevent confusing St Joseph's Toronto with Hamilton/London.
matching={'tgh':('1359','Toronto General'),'twh':('1364','Toronto Western'),'mgh':('4935','Michael Garron'),'sun':('4931','Sunnybrook'),'sjh':('4800',"St. Joseph's")}
# Use common latest month; peer median across Ontario first-assessment means.
month=max(r['month'] for r in rows)
peer=statistics.median(r['meanMinutes'] for r in rows if r['month']==month and r['indicator']=='first_assessment')
sites={}
for id,(snum,name) in matching.items():
    selected=[r for r in rows if r['snum']==snum]
    latest=[r for r in selected if r['month']==month]
    fa=next((r for r in latest if r['indicator']=='first_assessment'),None)
    sites[id]={'offloadMinutes':next(r['meanMinutes'] for r in offloads if r['hospital']==name),'edSourceId':snum,'edHospital':selected[0]['hospital'] if selected else None,'edMonth':month,'edIndicators':latest,'edRelativeCongestion':round(max(.5,min(1.5,fa['meanMinutes']/peer)),3) if fa else 1}
result={'sources':{'offload':'https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf','ed':'https://raw.githubusercontent.com/Nshipyard/ontario-er-waits/main/public/data/er_waits_ranked.csv'},'sourceSha256':{n:hashlib.sha256((DATA/n).read_bytes()).hexdigest() for n in ['ontario-ed-source.csv','toronto-offload-source.pdf']},'offloadPeriod':'2022–2023','offloadApproximate':True,'edMonth':month,'edPeerMedianAssessmentMinutes':peer,'cleanRows':len(rows),'droppedRows':len(source_rows)-len(rows),'fallbackOffloadMinutes':statistics.median(r['meanMinutes'] for r in offloads),'hospitals':sites}
(DATA/'hospital-history.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Cleaned {len(rows)} ED rows; {len(sites)} matched sites; latest ED month {month}')
