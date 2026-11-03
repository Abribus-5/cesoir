import json, datetime as dt, collections, re
d=json.load(open('data/all.json'))
now=dt.datetime(2026,11,3,19,0)
def p(s):
    if not s: return None
    try: return dt.datetime.fromisoformat(s.replace('Z','+00:00')).replace(tzinfo=None)
    except: return None
# occurrences format?
ex=[r['occurrences'] for r in d if r.get('occurrences')][:3]
print("occurrences samples:", [str(e)[:160] for e in ex])
no_date=sum(1 for r in d if not r.get('date_start'))
print("total",len(d),"sans date_start",no_date)
# parse occurrences into list of (start,end)
def occs(r):
    out=[]
    o=r.get('occurrences')
    if o:
        for seg in o.split(';'):
            parts=seg.split('_')
            if len(parts)==2:
                a,b=p(parts[0]),p(parts[1])
                if a and b: out.append((a,b))
    if not out and r.get('date_start') and r.get('date_end'):
        out=[(p(r['date_start']),p(r['date_end']))]
    return [x for x in out if x[0] and x[1]]
live=[];past=[];future=[]
tonight=[];weekend=[];week=[];ending_week=[]
sat=dt.datetime(2026,11,7,0,0); sun_end=dt.datetime(2026,11,9,0,0)
week_end=dt.datetime(2026,11,10,0,0)
for r in d:
    o=occs(r)
    if not o: continue
    last=max(b for a,b in o); first=min(a for a,b in o)
    if last<now: past.append(r); continue
    if first>now+dt.timedelta(days=90): future.append(r)
    live.append(r)
    if any(a.date()==now.date() and b>now for a,b in o): tonight.append(r)
    if any(a<sun_end and b>sat for a,b in o): weekend.append(r)
    if any(a<week_end and b>now for a,b in o): week.append(r)
    if now<last<week_end: ending_week.append(r)
print("passés",len(past),"à venir (début ou en cours)",len(live),"dont début >90j",len(future))
print("ce soir",len(tonight),"ce weekend",len(weekend),"d'ici 7j",len(week),"se terminent d'ici 7j",len(ending_week))
# freshness
upd=[p(r['updated_at']) for r in live if r.get('updated_at')]
rec=sum(1 for u in upd if u and (now-u).days<=30)
print("live mis à jour <30j",rec,"/",len(upd))
# field completeness on live
def nz(r,k): v=r.get(k); return v not in (None,'',[],0.0)
for k in ['lead_text','description','cover_url','lat_lon','address_street','price_detail','qfap_tags','audience','access_link','date_description','event_indoor','contact_url']:
    print(f"  {k:18s} {sum(1 for r in live if nz(r,k))/len(live):5.0%}")
geo0=sum(1 for r in live if r.get('lat_lon') and r['lat_lon'].get('lat')==0.0)
print("  lat_lon à 0:",geo0)
# tonight sample
print("\n--- CE SOIR (échantillon) ---")
for r in tonight[:15]:
    o=[x for x in occs(r) if x[0].date()==now.date()][0]
    print(f"{o[0].strftime('%H:%M')}-{o[1].strftime('%H:%M')} | {r['qfap_tags']} | {r['price_type']} {r.get('price_detail') or ''} | {r['title'][:60]} | {r.get('address_zipcode')}")
# tags distribution live
c=collections.Counter()
for r in live:
    for t in (r.get('qfap_tags') or '').split(';'):
        if t: c[t]+=1
print("\ntags live:",c.most_common(30))
# duration of events (days)
dur=collections.Counter()
for r in live:
    o=occs(r); days=(max(b for a,b in o)-min(a for a,b in o)).days
    dur['1 jour' if days==0 else '2-7j' if days<=7 else '8-30j' if days<=30 else '>30j']+=1
print("durée:",dur)
json.dump(live,open('data/live.json','w'),ensure_ascii=False)
json.dump(tonight,open('data/tonight.json','w'),ensure_ascii=False)
json.dump(weekend,open('data/weekend.json','w'),ensure_ascii=False)
