#!/usr/bin/env python3
"""Fit a reproducible experimental calendar-transfer model to public APOT outcomes.
Requires numpy==2.2.6. Raw third-party records stay in ignored work/, not the app.
"""
import csv, datetime as dt, hashlib, json, math, pathlib, urllib.request
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
COMMIT = '4d004c2bf9bca7855d0bf901bb6b772d1c7af597'
URL = f'https://raw.githubusercontent.com/Myorignl/Final_Project7/{COMMIT}/CSV_file/Random_sample_50000.csv'
SHA = 'ca93f91a01fe02ce2a4f429ad1dec565e8d497f8ccd373e358aae1fbb9720381'
CACHE = ROOT / 'work/public-offload/sacramento.csv'

def calendar(t):
    hour = t.hour + t.minute / 60 + t.second / 3600
    angle = 2 * math.pi * hour / 24
    # Cyclic time is continuous across midnight; Monday is the reference weekday.
    return [math.sin(angle), math.cos(angle), math.sin(2*angle), math.cos(2*angle)] + [float(t.weekday()==d) for d in range(1, 7)]

def load():
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(URL, timeout=60) as response: CACHE.write_bytes(response.read())
    if hashlib.sha256(CACHE.read_bytes()).hexdigest() != SHA:
        raise ValueError('Public snapshot checksum mismatch; inspect a changed source before retraining.')
    rows, seen, excluded = [], set(), {'duplicate':0, 'invalid':0}
    for raw in csv.DictReader(CACHE.open()):
        if raw['record'] in seen: excluded['duplicate']+=1; continue
        seen.add(raw['record'])
        try:
            t = dt.datetime.fromisoformat(raw['pickup_date']+'T'+raw['arrival_time'])
            y = float(raw['apot'])
            if not math.isfinite(y) or y < 0: raise ValueError()
            rows.append({'t':t, 'end':t+dt.timedelta(minutes=y), 'y':y, 'h':raw['hospital_code']})
        except (ValueError, OverflowError): excluded['invalid']+=1
    return sorted(rows,key=lambda r:r['t']), excluded

def fit(rows, penalty):
    hospitals = sorted({r['h'] for r in rows})
    c = np.array([calendar(r['t']) for r in rows])
    # Hospital intercepts are nuisance parameters; only calendar effects transfer.
    fixed = np.array([[float(r['h']==h) for h in hospitals] for r in rows])
    x = np.column_stack((fixed,c))
    y = np.log1p([r['y'] for r in rows])
    ridge = np.diag([0.0]*len(hospitals) + [penalty]*c.shape[1])
    coef = np.linalg.solve(x.T @ x + ridge, x.T @ y)[len(hospitals):]
    means = {h:float(np.mean([r['y'] for r in rows if r['h']==h])) for h in hospitals}
    norms = {h:float(np.mean(np.exp(c[[r['h']==h for r in rows]] @ coef))) for h in hospitals}
    return coef, means, norms, float(np.mean(np.exp(c @ coef)))

def predict(rows, model):
    coef, means, norms, _ = model
    factors = np.exp(np.array([calendar(r['t']) for r in rows]) @ coef)
    return np.maximum(0, np.array([(means[r['h']]+1)/norms[r['h']] for r in rows])*factors-1)

def metrics(y,p):
    return {'maeMinutes':float(np.mean(abs(y-p))), 'rmseMinutes':float(np.sqrt(np.mean((y-p)**2))), 'biasMinutes':float(np.mean(p-y))}

def main():
    rows, excluded = load()
    tune_at, cal_at, test_at = [dt.datetime.fromisoformat(s) for s in ['2021-01-01','2021-07-01','2022-01-01']]
    train = [r for r in rows if r['end']<tune_at]
    tune = [r for r in rows if tune_at<=r['t'] and r['end']<cal_at]
    calibration = [r for r in rows if cal_at<=r['t'] and r['end']<test_at]
    test = [r for r in rows if test_at<=r['t']]
    scores=[]
    for penalty in [0, 1, 10, 100, 1000]:
        m=fit(train,penalty)
        scores.append({'penalty':penalty, **metrics(np.array([r['y'] for r in tune]),predict(tune,m))})
    best=min(scores,key=lambda s:(s['rmseMinutes'],-s['penalty']))
    # Refit only train+tune. Calibration and test outcomes never fit coefficients.
    model=fit(train+tune,best['penalty'])
    coef, means, norms, norm=model
    cp=predict(calibration,model); cy=np.array([r['y'] for r in calibration])
    residual=(cy+1)/(cp+1)
    q=np.quantile(residual,[.1,.5,.9])
    # Distribution of outcomes relative to historical hospital means, for a P90 anchor.
    unconditional=(cy+1)/np.array([means[r['h']]+1 for r in calibration])
    uq90=float(np.quantile(unconditional,.9))
    tp=predict(test,model); ty=np.array([r['y'] for r in test])
    baseline=np.array([means[r['h']] for r in test])
    medians={h:float(np.median([r['y'] for r in train+tune if r['h']==h])) for h in means}
    median_baseline=np.array([medians[r['h']] for r in test])
    lower=np.maximum(0,(tp+1)*q[0]-1);upper=(tp+1)*q[2]-1
    # Resample weeks, not individual patients, to acknowledge temporal clustering.
    week=np.array([r['t'].strftime('%G-%V') for r in test]); keys=sorted(set(week));rng=np.random.default_rng(491)
    improvements=abs(ty-baseline)-abs(ty-tp)
    groups=[improvements[week==k] for k in keys]
    boot=[float(np.concatenate([groups[i] for i in rng.integers(0,len(groups),len(groups))]).mean()) for _ in range(1000)]
    # Leave one hospital out of effect estimation; only its earlier mean anchors it.
    heldout=[]
    for h in means:
        other_train=[r for r in train if r['h']!=h]
        other_tune=[r for r in tune if r['h']!=h]
        other_y=np.array([r['y'] for r in other_tune])
        other_penalty=min([0,1,10,100,1000],key=lambda penalty:(metrics(other_y,predict(other_tune,fit(other_train,penalty)))['rmseMinutes'],-penalty))
        m=fit(other_train+other_tune,other_penalty)
        hr=[r for r in test if r['h']==h];hc=np.array([calendar(r['t']) for r in hr]);hy=np.array([r['y'] for r in hr])
        hp=np.maximum(0,(means[h]+1)*np.exp(hc@m[0])/m[3]-1)
        heldout.append({'hospitalCode':h,'selectedPenalty':other_penalty,'count':len(hr),**metrics(hy,hp),'baselineMaeMinutes':float(np.mean(abs(hy-means[h])))})
    validation={
      'region':'Sacramento County, California','testFrom':str(test[0]['t'].date()),'testTo':str(test[-1]['t'].date()),'testCount':len(test),
      'model':metrics(ty,tp),'hospitalMeanBaseline':metrics(ty,baseline),'hospitalMedianBaseline':metrics(ty,median_baseline),
      'central80Coverage':float(np.mean((ty>=lower)&(ty<=upper))),'meanRangeWidthMinutes':float(np.mean(upper-lower)),
      'maeImprovementWeekBootstrap95':np.quantile(boot,[.025,.975]).tolist(),'bootstrapWeeks':len(keys),
      'byHospital':heldout,'torontoValidated':False}
    artifact={
      'version':1,'availableFrom':'2026-11-19T00:00:00Z','method':'hospital-fixed-effects-log1p-ridge-calendar-transfer','status':'experimental-external-transfer',
      'source':{'url':URL,'repository':'https://github.com/Myorignl/Final_Project7','commit':COMMIT,'sha256':SHA,
        'description':'Third-party 50,000-record random sample of Sacramento County APOT outcomes; source authors attribute records to county EMS.',
        'license':'No explicit license in source repository; raw records are not redistributed.',
        'periodFrom':str(rows[0]['t'].date()),'periodTo':str(rows[-1]['t'].date()),'rows':len(rows),'hospitals':len(means),'excluded':excluded},
      'training':{'trainCount':len(train),'tuningCount':len(tune),'calibrationCount':len(calibration),'fitThrough':'2021-06-30',
        'splitBoundaryExcluded':len(rows)-len(train)-len(tune)-len(calibration)-len(test),'penalty':best['penalty'],'selectionMetric':'tuning RMSE in minutes','candidates':scores,'numpyVersion':np.__version__},
      'calendarCoefficients':coef.tolist(),'calendarNormalizer':norm,'residualRatios':{'p10':float(q[0]),'p50':float(q[1]),'p90':float(q[2])},
      'unconditionalP90Ratio':uq90,'validation':validation,
      'assumptions':['Calendar effects and normalized residual distribution transfer from Sacramento to Toronto.',
        'Toronto published hospital means or percentiles anchor the level; no paired Toronto outcomes validate the transfer.',
        'Source Date/pickup_date and arrival_time are interpreted as local calendar time; source availability latency is unknown.',
        'Live posted ED waits are separate context; their relationship to APOT is not fitted.']}
    destination=ROOT/'data/public-offload-model.json'
    temporary=destination.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(artifact,indent=2,allow_nan=False)+'\n')
    temporary.replace(destination)
    print(json.dumps({'rows':len(rows),'selectedPenalty':best['penalty'],'validation':validation},indent=2))

if __name__=='__main__':main()
