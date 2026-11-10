"""Download the public EPA, Census and CDC inputs; no API credentials required."""
import concurrent.futures,json,pathlib,sys,urllib.parse,urllib.request
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
urls={'sites.zip':'https://aqs.epa.gov/aqsweb/airdata/aqs_sites.zip','monitors.zip':'https://aqs.epa.gov/aqsweb/airdata/aqs_monitors.zip'}
for st in ['10','24','34','36','42']:urls[f'centers-{st}.txt']=f'https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR{st}.txt'
def download(x):
 name,url=x;data=urllib.request.urlopen(url,timeout=90).read();(out/name).write_bytes(data);print(name,len(data),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:list(ex.map(download,urls.items()))
base='https://services3.arcgis.com/ZvidGQkLaDJxRSJ2/ArcGIS/rest/services/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2/query'
where="ST IN ('10','24','34','36','42')"
def query(p):return json.load(urllib.request.urlopen(base+'?'+urllib.parse.urlencode(p),timeout=90))
count=query({'where':where,'returnCountOnly':'true','f':'json'})['count']
def page(offset):
 p={'where':where,'resultOffset':offset,'resultRecordCount':2000,'orderByFields':'FIPS','outFields':'FIPS,ST_ABBR,LOCATION,E_TOTPOP,E_POV150,E_MINRTY,E_AFAM,E_HISP,E_ASIAN,E_AIAN,E_NHPI,E_TWOMORE,E_OTHERRACE,EP_POV150,RPL_THEMES','returnGeometry':'true','outSR':4326,'maxAllowableOffset':.003,'geometryPrecision':4,'f':'geojson'}
 return query(p)['features']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:features=[f for rows in ex.map(page,range(0,count,2000)) for f in rows]
assert len(features)==count
(out/'svi-tracts.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
print('Saved',count,'tracts')
