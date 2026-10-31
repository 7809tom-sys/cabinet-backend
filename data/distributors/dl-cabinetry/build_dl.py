import json,re,csv,statistics,openpyxl
D='/workspace/dl/'
n=lambda s:re.sub(r'[^A-Z0-9]','',str(s).upper())
rows=json.load(open('/tmp/dlrows.json'))
# ---- master data
wb=openpyxl.load_workbook('/workspace/cabinetdealz_master_UPDATED_2026-10-03.xlsx',read_only=True)
cab=list(wb['Cabinets (updated)'].iter_rows(values_only=True))[1:]
cabinfo={}
for r in cab:
  if r[1]: cabinfo[r[1]]=dict(desc=r[2],cat=r[5],sub=r[6],w=r[8],h=r[9],d=r[10],active=str(r[17]).upper()=='TRUE')
site=json.load(open(D+'site_prices.json'))
sitecodes={}
for s,lst in site.items():
  for x in lst: sitecodes.setdefault(x['masterCode'],{})[s]=x
masters={}  # normalized -> masterCode, prefer site code, then active
for c,i in cabinfo.items():
  k=n(c)
  if k not in masters or c in sitecodes or (i['active'] and not cabinfo[masters[k]]['active']): 
    if k in masters and masters[k] in sitecodes: continue
    masters[k]=c
for c in sitecodes: masters[n(c)]=c
alias={}
for r in list(wb['Alias map'].iter_rows(values_only=True))[1:]:
  if r[0] and r[4] and str(r[2]).upper()=='TRUE' and 'MASTER CODE' not in str(r[7]):
    alias.setdefault(r[5] or n(r[4]),(r[0],r[7]))
def exists(c): return c in cabinfo or c in sitecodes
# ---- dims/desc
def parse(code):
  c=code.upper(); m=None
  def g(p): return re.fullmatch(p,c)
  if (m:=g(r'B(\d\d)')): return 'Base cabinet',m[1],'34.5','24'
  if (m:=g(r'DB(\d\d)')): return 'Drawer base (3 drawers per CD parse rule)',m[1],'34.5','24'
  if (m:=g(r'2DB(\d\d)')): return '2-drawer base',m[1],'34.5','24'
  if (m:=g(r'F?SB(\d\d)')): return ('Farm sink base' if c[0]=='F' else 'Sink base'),m[1],'34.5','24'
  if (m:=g(r'FDB(\d\d)')): return 'FDB base (type unconfirmed)',m[1],'34.5','24'
  if (m:=g(r'W(\d\d)(\d\d)')): return 'Wall cabinet',m[1],m[2],'12'
  if (m:=g(r'W(\d\d)(\d\d)(\d\d)')): return 'Wall cabinet (deep)',m[1],m[2],m[3]
  if (m:=g(r'WP(\d\d)(\d\d)(\d\d)')): return 'Pantry (tall)',m[1],m[2],m[3]
  if (m:=g(r'OVD(\d\d)(\d\d)(\d\d)')): return 'Oven tall cabinet',m[1],m[2],m[3]
  if (m:=g(r'WDCG?(\d\d)(\d\d)(\d\d)')): return 'Diagonal corner wall'+(' glass door' if 'G' in c[:4] else ''),m[1],m[2],m[3]
  if (m:=g(r'WBC(\d\d)(\d\d)')): return 'Wall blind corner',m[1],m[2],'12'
  if (m:=g(r'WG(\d\d)(\d\d)')): return 'Wall glass door (door only? unconfirmed)',m[1],m[2],''
  if (m:=g(r'VAN(\d\d).*')): return 'Vanity',m[1],'',''
  if (m:=g(r'VDB(\d\d)')): return 'Vanity drawer base',m[1],'',''
  if (m:=g(r'VSB(\d\d)')): return 'Vanity sink base',m[1],'',''
  if (m:=g(r'LZS(\d\d)(\d\d)?')): return 'Lazy susan corner',m[1],'',''
  if (m:=g(r'WRC(\d\d)(\d\d)|WMC(\d\d)(\d\d)')): return 'Wall rack/microwave cabinet', (m[1] or m[3]),(m[2] or m[4]),''
  if 'DRAWER SLIDES' in c or 'PULLOUT' in c or c in('TRASH CAN',): return 'Accessory','','',''
  if (m:=re.search(r'(\d+)X(\d+)',c)): return 'Panel/filler/trim',m[1],m[2],''
  return 'Accessory / trim / misc','','',''
# ---- typo + ratio
prices=[]
for code,core,slim,luxe in rows:
  desc,w,h,dp=parse(code)
  sr=slim/core; lr=luxe/core; notes=[]
  if code.startswith('VAN36'): notes.append('SUSPECTED TYPO: Luxe $%d is %.2fx Core; family norm ~2.0x (expected ~$410); also VAN48D-6 Luxe is only $690'%(luxe,lr))
  if code=='SAMPLE DOOR': notes.append('SUSPECTED TYPO: Slim $22 > Luxe $20 (Luxe should be >= Slim); flat-priced accessories elsewhere are equal across tiers')
  if not (code.startswith('VAN36') or code=='SAMPLE DOOR'):
    if abs(sr-1)<0.005 and abs(lr-1)<0.005: notes.append('flat price all tiers (accessory)')
    elif abs(sr-1)<0.005 and 1.85<=lr<=2.1: notes.append('slim=core (non-door item), luxe~2x')
    elif not (1.07<=sr<=1.13 and 1.85<=lr<=2.1): notes.append('RATIO OUTLIER')
  prices.append(dict(dlSku=code,description=desc,width=w,height=h,depth=dp,core=core,slim=slim,luxe=luxe,slimOverCore=round(sr,3),luxeOverCore=round(lr,3),notes='; '.join(notes)))
with open(D+'dl_prices.csv','w',newline='') as f:
  wr=csv.DictWriter(f,prices[0].keys());wr.writeheader();wr.writerows(prices)
# ---- crosswalk
rules=[ # regex -> (template, conf, note)
 (r'WP(\d\d)(\d\d)27',lambda m:f'U{m[1]}{m[2]}24','medium','DL WP=pantry; DL code depth 27 vs master 24 - confirm DL actual depth'),
 (r'OVD(\d\d)(\d\d)27',lambda m:f'O{m[1]}{m[2]}24','medium','oven cabinet; DL depth digits 27 vs master 24 - confirm'),
 (r'W36(\d\d)27',lambda m:f'W36{m[1]}24','medium','24"-deep refrigerator wall; DL depth digits 27 vs master 24 - confirm'),
 (r'WDC24(\d\d)12',lambda m:f'WDC24{m[1]}','high','diagonal corner wall 24x{h}x12'),
 (r'VAN(\d\d)',lambda m:f'V{m[1]}21','medium','vanity sink base; assumes 21" depth'),
 (r'VAN(\d\d)D([LR])',lambda m:f'V{m[1]}21D{m[2]}','medium','vanity w/ drawers left/right; assumes 21" depth'),
 (r'VDB(1[258])',lambda m:f'VDB{m[1]}21(3VDB{m[1]})','medium','vanity 3-drawer base; assumes 21" depth'),
 (r'VDB(24)',lambda m:f'VDB{m[1]}21','medium','vanity drawer base; assumes 21" depth'),
 (r'VSB(\d\d)',lambda m:f'VS{m[1]}','medium','vanity sink base'),
 (r'LZS33',lambda m:'LSB33','medium','lazy susan 33; LSB33/LS3312 same item per Tom (alias recs)'),
 (r'LZS3612',lambda m:'LS3612','medium','lazy susan 36'),
 (r'FILLER3X96',lambda m:'WF396','medium','3x96 filler'),
 (r'BWBKT18',lambda m:'BWB18','low','wastebasket base vs kit - confirm'),
]
xw=[]
for p in prices:
  code=p['dlSku']; k=n(code); mc=mt=conf=note=''
  if k in masters: mc,mt,conf,note=masters[k],'exact','high','normalized code equals master'
  elif k in alias:
    mc,st=alias[k]; mt,conf,note='alias','high' if 'PARSE' in str(st) or 'ACTIVE' in str(st) else 'medium',f'Alias map: {st}'
  else:
    for pat,f,c,nt in rules:
      m=re.fullmatch(pat,k)
      if m:
        t=f(m)
        if exists(t): mc,mt,conf,note=t,'dimension-equivalent',c,nt
        break
  if mc and not exists(mc): note+=f' | WARNING master {mc} not found'; 
  if not mc: mt,conf='none','';note={'FDB':'FDB type unconfirmed (possibly full-door base, B##FH?) - ask Rich','2DB33':'no 2DB33 master','BBC33-9':'no BBC33 master (BBC36+ only)','WG':'glass door insert/door - no master','VAN48D-6':'no matching 48" vanity master confirmed'}.get(next((x for x in ['FDB','2DB33','BBC33-9','WG','VAN48D-6'] if code.startswith(x)),''),'no master/alias found')
  live=', '.join(sorted(sitecodes.get(mc,{}).keys())) if mc else ''
  xw.append(dict(dlSku=code,masterCode=mc,matchType=mt,confidence=conf,onSiteStyles=live,note=note))
with open(D+'dl_crosswalk.csv','w',newline='') as f:
  wr=csv.DictWriter(f,xw[0].keys());wr.writeheader();wr.writerows(xw)
# ---- KC
kw=openpyxl.load_workbook('/workspace/dl/kc_price_2022.xlsx',read_only=True,data_only=True)['List Price (Updated)']
kc={}
for r in list(kw.iter_rows(values_only=True))[3:]:
  if r[0] and isinstance(r[2],(int,float)):
    k=n(r[0]); mc=masters.get(k) or (alias.get(k) or (None,))[0]
    if mc: kc.setdefault(mc,(r[0],r[2]))
def cat(mc):
  c=mc.upper()
  if c.startswith(('U','O')): return 'Tall'
  if c.startswith('V'): return 'Vanity'
  if c.startswith('W'): return 'Wall'
  if re.match(r'(\d?DB|B\d|SB|FSB|LS|BMC|BF|2DB|3DB)',c): return 'Base'
  return 'Other'
cmp=[]
for x,p in zip(xw,prices):
  mc=x['masterCode']
  if not mc or x['confidence']=='low': continue
  row=dict(dlSku=x['dlSku'],masterCode=mc,matchType=x['matchType'],category=cat(mc),dlCore=p['core'],dlSlim=p['slim'],dlLuxe=p['luxe'])
  if mc in kc:
    row['kcCode']=kc[mc][0];row['kc2022ListSW']=kc[mc][1];row['kc2022Cost40pct']=round(kc[mc][1]*0.4,2)
    row['dlCoreVsKcList_pct']=round((p['core']/kc[mc][1]-1)*100,1)
  for s,lbl in [('330014','madisonSW'),('390001','prestonSW'),('330013','ashfordWS')]:
    v=sitecodes.get(mc,{}).get(s)
    if v:
      row[f'site_{lbl}_list']=v['listPrice'];row[f'site_{lbl}_contractor']=v['contractorPrice']
      row[f'dlCoreVs_{lbl}_contractor_pct']=round((p['core']/float(v['contractorPrice'])-1)*100,1)
  if len(row)>7: cmp.append(row)
keys=[];[keys.append(k) for r in cmp for k in r if k not in keys]
with open(D+'price_compare.csv','w',newline='') as f:
  wr=csv.DictWriter(f,keys);wr.writeheader();wr.writerows(cmp)
# summary
out={}
for col in ['dlCoreVsKcList_pct']+[f'dlCoreVs_{l}_contractor_pct' for l in ['madisonSW','prestonSW','ashfordWS']]:
  for c in ['Base','Wall','Tall','Vanity','Other','ALL']:
    v=[r[col] for r in cmp if col in r and (c=='ALL' or r['category']==c)]
    if v: out[f'{col}|{c}']=(len(v),statistics.median(v),sum(x<0 for x in v))
# KC cost comparison
v=[(r['dlCore']/r['kc2022Cost40pct']-1)*100 for r in cmp if 'kc2022Cost40pct' in r]
out['dlCoreVsKcCost40|ALL']=(len(v),round(statistics.median(v),1),sum(x<0 for x in v))
json.dump(out,open(D+'summary.json','w'),indent=1)
from collections import Counter
print(len(prices),Counter(x['matchType'] for x in xw),Counter((x['matchType'],x['confidence']) for x in xw))
for k,v in out.items(): print(k,v)
print('UNMAPPED',[x['dlSku'] for x in xw if x['matchType']=='none'])
print([ (x['dlSku'],x['masterCode'],x['note']) for x in xw if x['matchType'] in('alias','dimension-equivalent') or 'WARN' in x['note']])
print([p['dlSku']+':'+p['notes'] for p in prices if 'OUTLIER' in p['notes'] or 'TYPO' in p['notes']])
