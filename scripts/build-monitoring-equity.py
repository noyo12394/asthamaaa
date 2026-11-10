"""Rebuild with downloaded official source snapshots. See docs/monitoring-equity.md."""
import csv,json,math,pathlib,zipfile,hashlib,datetime,sys,io
raw=pathlib.Path(sys.argv[1]);out=pathlib.Path('public/research');out.mkdir(parents=True,exist_ok=True)
states={'10':'DE','24':'MD','34':'NJ','36':'NY','42':'PA'}
centers={}
for st in states:
 with (raw/f'centers-{st}.txt').open(encoding='utf-8-sig',newline='') as f:
  for r in csv.DictReader(f):
   centers[r['STATEFP']+r['COUNTYFP']+r['TRACTCE']]=[float(r['LONGITUDE']),float(r['LATITUDE'])]
z=zipfile.ZipFile(raw/'monitors.zip')
rows=list(csv.DictReader(z.open(z.namelist()[0]).read().decode('utf-8-sig').splitlines()))
extracted=max(r['Extraction Date'] for r in rows)
sz=zipfile.ZipFile(raw/'sites.zip')
site_rows=csv.DictReader(io.TextIOWrapper(sz.open(sz.namelist()[0]),encoding='utf-8-sig'))
closed={r['State Code']+'-'+r['County Code']+'-'+r['Site Number'] for r in site_rows if r['Site Closed Date'] and r['Site Closed Date']<=extracted}
cutoff=(datetime.date.fromisoformat(extracted)-datetime.timedelta(days=365)).isoformat(); monitors={}
for r in rows:
 if r['Parameter Code']!='88101' or r['Last Sample Date']<cutoff:continue
 lat,lon=float(r['Latitude']),float(r['Longitude'])
 if not (-180<=lon<=180 and -90<=lat<=90) or (lat==0 and lon==0):continue
 ident=r['State Code']+'-'+r['County Code']+'-'+r['Site Number']
 if ident in closed:continue
 if ident in monitors and monitors[ident]['lastSample']>=r['Last Sample Date']:continue
 monitors[ident]={'id':ident,'name':r['Local Site Name'] or (r['City Name']+' PM2.5'),'lat':lat,'lng':lon,'state':r['State Name'],'stateCode':r['State Code'],'lastSample':r['Last Sample Date'],'type':r['Monitor Type'],'scale':r['Measurement Scale']}
monitors=sorted(monitors.values(),key=lambda m:m['id'])
def xyz(lon,lat):
 a,b=math.radians(lat),math.radians(lon);return math.cos(a)*math.cos(b),math.cos(a)*math.sin(b),math.sin(a)
mx=[xyz(m['lng'],m['lat']) for m in monitors]
fc=json.load(open(raw/'svi-tracts.geojson'));features=[];excluded={'zeroPopulation':0,'noPopulationCenter':0,'sviUnavailable':0};border=0
fields={'black':'E_AFAM','hispanic':'E_HISP','asian':'E_ASIAN','aian':'E_AIAN','nhpi':'E_NHPI','multiracial':'E_TWOMORE','other':'E_OTHERRACE'}
def val(p,k):
 v=p.get(k);return None if v is None or v<0 else v
for f in fc['features']:
 p=f['properties'];ident=str(p['FIPS']).zfill(11);pop=val(p,'E_TOTPOP')
 if not pop:excluded['zeroPopulation']+=1;continue
 c=centers.get(ident)
 if not c:excluded['noPopulationCenter']+=1;continue
 x,y,z=xyz(*c);best=-2;idx=-1
 for i,(a,b,d) in enumerate(mx):
  v=x*a+y*b+z*d
  if v>best:best=v;idx=i
 distance=6371.0088*math.acos(min(1,max(-1,best)))
 svi=val(p,'RPL_THEMES')
 if svi is None:excluded['sviUnavailable']+=1
 minor=val(p,'E_MINRTY');white=None if minor is None else pop-minor
 pr={'id':ident,'state':p['ST_ABBR'],'name':p['LOCATION'],'pop':pop,'svi':svi,'poverty':val(p,'EP_POV150'),'distance':round(distance,5),'monitor':idx,'lng':c[0],'lat':c[1],'white':white}
 for key,col in fields.items():pr[key]=val(p,col)
 if monitors[idx]['stateCode']!=ident[:2]:border+=1
 f['properties']=pr;f['id']=ident;features.append(f)
def summary(fs):
 pop=sum(f['properties']['pop'] for f in fs);ordered=sorted((f['properties']['distance'],f['properties']['pop']) for f in fs);cum=0;median=0
 for d,p in ordered:
  cum+=p
  if cum>=pop/2:median=d;break
 return {'tracts':len(fs),'population':pop,'weightedMedianKm':round(median,2),'weightedMeanKm':round(sum(d*p for d,p in ordered)/pop,2),'beyond25Population':sum(p for d,p in ordered if d>25),'doubleDisadvantagePopulation':sum(f['properties']['pop'] for f in fs if f['properties']['distance']>25 and f['properties']['svi'] is not None and f['properties']['svi']>=.75)}
meta={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'monitorExtractionDate':max(r['Extraction Date'] for r in rows),'monitorCutoff':cutoff,'monitorParameter':'88101','monitorDefinition':f'Unique AQS sites with PM2.5 88101 samples reported on or after {cutoff} (365 days before source extraction). Known closed sites excluded using AQS site inventory. Recent-reporting proxy; not verified operational status today.','referenceMonitorSites':len(monitors),'regionMonitorSites':sum(m['stateCode'] in states for m in monitors),'excluded':excluded,'crossStateNearestTracts':border,'summary':summary(features),'byState':{s:summary([f for f in features if f['properties']['state']==s]) for s in states.values()},'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in raw.iterdir() if p.suffix in ['.zip','.txt','.geojson']}}
json.dump({'type':'FeatureCollection','features':features},open(out/'monitoring-tracts.geojson','w'),separators=(',',':'),allow_nan=False)
json.dump({'meta':meta,'monitors':monitors},open(out/'monitoring-meta.json','w'),separators=(',',':'),allow_nan=False)
print(json.dumps(meta,indent=2))
