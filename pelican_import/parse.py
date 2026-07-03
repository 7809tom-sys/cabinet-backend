import json, re
SRC="/home/ubuntu/cabinet-dealz/pelican_import/nls.txt"
OUT="/home/ubuntu/cabinet-dealz/pelican_import/pelican_seed.json"
PRICE=r"\$[0-9,]+\.[0-9]{2}"
price_re=re.compile(PRICE)
tail=re.compile(r"^(.*?)((?:\s+"+PRICE+r"){1,4})\s*$")
def money(s): return float(s.replace("$","").replace(",",""))
def norm(s): return re.sub(r"\s+"," ",s).strip()
raw=open(SRC,encoding="utf-8",errors="replace").read().splitlines()
lines=[]
for ln in raw:
    t=ln.strip()
    if not t: continue
    if re.fullmatch(r"Page\s+\d+(\s+of\s+\d+)?",t,re.I): continue
    if t.lower().startswith("price list"): continue
    if t.startswith(("BILL TO","SHIP TO","First Class Flooring","470 North","Osprey","United States")): continue
    if t.startswith("Product Image") or t.startswith("Item"): continue
    if re.fullmatch(r"[\d\s/]+",t): continue
    lines.append(t)
recs=[]; i=0; n=len(lines)
while i<n:
    m=tail.match(lines[i])
    if m and price_re.search(lines[i]):
        name=norm(m.group(1)); prices=[money(x) for x in price_re.findall(m.group(2))]
        dp=[]; j=i+1
        while j<n and not price_re.search(lines[j]) and len(dp)<3: dp.append(lines[j]); j+=1
        if name: recs.append({"name":name,"prices":prices,"description":norm(" ".join(dp))})
        i=j
    else: i+=1
MERCH=["t-shirt","tshirt","t shirt","shirt","polo","hoodie","trucker hat","beanie","stuffed","plush","stress ball","lanyard","usb","flash drive","lookbook","look book","brochure","display rack","display box","display stand","waterfall display","swag","keychain","tote","mug","koozie","banner","poster","sticker","folder","fixture catalog","catalog","display box c","display","pen","folding rack","rack"]
def blob(r): return (r["name"]+" "+r["description"]).lower()
def cat(r):
    b=blob(r)
    if "sample" in b or "swatch" in b: return ("Samples","Sample Chips",False)
    if r["name"].strip().lower()=="pen" or any(k in b for k in MERCH): return ("Marketing & Merchandise","Merchandise",False)
    if "quartz slab" in b or (len(r["prices"])>=2 and "slab" in b): return ("Quartz Slabs (Countertops)","Quartz Slab",True)
    if ("valve" in b and ("shower" in b or "tub" in b)) or "pressure balance" in b or "shower set" in b or "tub/shower" in b: return ("Shower & Bath","Shower Valves & Systems",True)
    if any(k in b for k in ["shower door","tub door","sliding door","bypass door"]): return ("Shower & Bath","Shower & Tub Doors",True)
    if any(k in b for k in ["shower surround","tub surround","alcove","glue up","glue-up"]): return ("Shower & Bath","Shower Surrounds",True)
    if any(k in b for k in ["shower head","showerhead","tub spout","shower niche","soap dish","shower base","shower pan"]): return ("Shower & Bath","Shower Accessories",True)
    if any(k in b for k in ["urinal","flushometer","water closet"]): return ("Toilets & Bidets","Commercial Flush Valves",True)
    if any(k in b for k in ["toilet","bidet","tank lid","flush valve","fill valve","flush button","flush handle","seat cover","toilet seat"]): return ("Toilets & Bidets","Toilets & Bidets" if ("toilet" in b or "bidet" in b) else "Toilet Parts",True)
    if any(k in b for k in ["mosaic","tile","backsplash"]): return ("Tile & Mosaic","Mosaic" if "mosaic" in b else "Tile",True)
    if any(k in b for k in ["vinyl","lvp","spc","laminate","engineered","plank","flooring"]): return ("Flooring","Underlayment" if "underlayment" in b else "Planks & Flooring",True)
    if "underlayment" in b: return ("Flooring","Underlayment",True)
    if any(k in b for k in ["t-molding","t molding","reducer","quarter round","stair nose","stairnose","baseboard","molding","moulding","transition","end cap","wall base","flooring board"]): return ("Flooring","Moldings & Trim",True)
    if any(k in b for k in ["faucet","pull-down","pull down","pot filler","bar faucet"]): return ("Sinks & Faucets","Faucets",True)
    if any(k in b for k in ["disposal","disposer","garbage disposal","food waste"]): return ("Sinks & Faucets","Disposals & Accessories",True)
    if any(k in b for k in ["sink","workstation","farmhouse","apron","undermount","topmount","drop-in","drop in","bar sink","prep sink","double bowl","single bowl"]): return ("Sinks & Faucets","Sinks",True)
    if any(k in b for k in ["drain","strainer","bottom grid","sink grid","colander","cutting board","soap dispenser","deck plate","air switch","disposal flange","sink clip","cartridge","sink caddy","roller mat","drying rack","hole cover"]): return ("Sinks & Faucets","Sink & Faucet Accessories",True)
    if any(k in b for k in ["dryback","drop lock","droplock","click lock","clicklock","rigid core","/box","sqft","pc/box","wpc"]) or re.search(r"\bmil\b",b): return ("Flooring","Planks & Flooring",True)
    nm=r["name"].upper()
    if nm.startswith(("PL-FC","PL-VS")): return ("Sinks & Faucets","Sinks",True)
    if nm.startswith("PL-8") or "18g" in b: return ("Sinks & Faucets","Sinks",True)
    return ("Uncategorized",None,True)
size_re=re.compile(r'(\d+(?:\.\d+)?"?\s*[xX]\s*\d+(?:\.\d+)?"?(?:\s*[xX]\s*\d+(?:\.\d+)?"?)?)')
def slug(s,u):
    base=re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")[:150] or "item"; sl=base; k=2
    while sl in u: sl=f"{base}-{k}"[:150]; k+=1
    u.add(sl); return sl
us=set(); uc=set(); prods=[]; counts={}
for r in recs:
    c,sub,vis=cat(r); counts[c]=counts.get(c,0)+1
    pr=r["prices"]; msrp=pr[0] if pr else None
    code=norm(r["name"])
    if code in uc:
        k=2
        while f"{code} #{k}" in uc: k+=1
        code=f"{code} #{k}"
    uc.add(code)
    sm=size_re.search(r["name"]+" "+r["description"]); size=norm(sm.group(1)) if sm else None
    prods.append({"pelicanCode":code[:191],"slug":slug(r["name"],us),"name":r["name"][:255],"description":(r["description"] or r["name"])[:2000],"category":c,"subCategory":sub,"size":size[:128] if size else None,"listPrice":msrp,"msrp":msrp,"priceTier2":pr[1] if len(pr)>1 else None,"priceTier3":pr[2] if len(pr)>2 else None,"priceTier4":pr[3] if len(pr)>3 else None,"tiered":len(pr)>=2,"showInCatalog":vis,"showInDesigner":vis})
POP={"Quartz Slabs (Countertops)":["calacatta","carrara","white","gold","terremotto","apollo"],"Flooring":["oak","greige","coastal","whitewash","natural","hickory"],"Sinks & Faucets":["workstation","farmhouse","matte black","pull-down","pull down","single bowl"],"Tile & Mosaic":["white","marble","hexagon","carrara"],"Toilets & Bidets":["one piece","one-piece","dual flush","elongated"],"Shower & Bath":["frameless","matte black","sliding"]}
pc={}
for p in prods:
    kws=POP.get(p["category"],[]); b=(p["name"]+" "+(p["description"] or "")).lower()
    if p["showInCatalog"] and any(k in b for k in kws) and pc.get(p["category"],0)<6 and p["listPrice"]:
        pc[p["category"]]=pc.get(p["category"],0)+1; p["isPopular"]=True; p["popularRank"]=pc[p["category"]]
    else: p["isPopular"]=False; p["popularRank"]=0
json.dump(prods,open(OUT,"w"))
print("PARSE kept:",len(prods),"uncat:",len([p for p in prods if p['category']=='Uncategorized']))
