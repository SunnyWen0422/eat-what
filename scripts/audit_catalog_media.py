"""Read-only image diagnostics. No probing unless explicitly requested."""
import argparse,csv,hashlib,json,ssl
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
from urllib.request import Request,build_opener,HTTPRedirectHandler,HTTPSHandler
from urllib.error import HTTPError,URLError

PROBE_HOSTS=frozenset(['cp1.douguo.com'])
def normalize(value):
    if not isinstance(value,str) or len(value)>2048:return None
    text=value.strip()
    if any(ord(c)<32 for c in text):return None
    try:
        url=urlsplit(text)
        if url.scheme.lower() not in ['http','https'] or not url.hostname or url.username or url.password:return None
        host=url.hostname.lower()
        port=url.port
        if host in ['cp1.douguo.net','cp2.douguo.net']:host='cp1.douguo.com'
        if port not in [None,443]:return None
        return urlunsplit(('https',host,url.path,url.query,url.fragment))
    except ValueError:return None
class RestrictedRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if urlsplit(newurl).hostname not in PROBE_HOSTS:raise ValueError('Redirect outside diagnostic source')
        return super().redirect_request(req,fp,code,msg,headers,newurl)
def probe(url):
    if urlsplit(url).hostname not in PROBE_HOSTS:return {'state':'not_probed_source'}
    try:
        opener=build_opener(RestrictedRedirect(),HTTPSHandler(context=ssl.create_default_context()))
        with opener.open(Request(url,headers={'Range':'bytes=0-32767','User-Agent':'EatWhat-Image-Diagnostic/1.0'}),timeout=8) as response:
            content_type=response.headers.get('Content-Type','').split(';')[0].lower()
            payload=response.read(65536)
            state='available' if content_type.startswith('image/') and payload else 'not_image'
            return {'state':state,'status':response.status,'contentType':content_type,'sampleBytes':len(payload)}
    except HTTPError as error:return {'state':'http_error','status':error.code}
    except URLError as error:return {'state':'certificate_error' if isinstance(error.reason,ssl.SSLCertVerificationError) else 'network_error'}
    except (TimeoutError,OSError,ValueError):return {'state':'network_error'}
def audit(rows,do_probe=False,sample_size=20):
    if not 0<=sample_size<=20:raise ValueError('Image probes are bounded to 20')
    values=[];probed=0
    for row in rows:
        original=row.get('image')
        url=normalize(original)
        result={'dishId':row.get('id'),'type':row.get('type'),'sourceUrl':original,'displayUrl':url,
            'imageRightsStatus':'UNKNOWN','state':'missing' if not original else 'syntax_valid' if url else 'invalid_url'}
        if do_probe and url and probed<sample_size and urlsplit(url).hostname in PROBE_HOSTS:
            result.update(probe(url));probed+=1
        values.append(result)
    return {'total':len(values),'probeAttempts':probed,'states':dict(Counter(r['state'] for r in values)),
            'hosts':dict(Counter(urlsplit(r['displayUrl']).hostname for r in values if r['displayUrl'])),
            'rows':values,'limitations':['URL语法、可达性和图片使用依据分别判断','不关闭证书校验、不创建代理、不修改原地址','网络检查最多20次且只访问精确限定图片源']}
def main():
    p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--out',required=True)
    p.add_argument('--probe',action='store_true');p.add_argument('--sample-size',type=int,default=20)
    args=p.parse_args();source=Path(args.input);out=Path(args.out)
    if out.exists():raise FileExistsError('Keep previous image diagnostics; use a fresh directory')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    if source.suffix.lower()=='.jsonl':rows=[json.loads(x) for x in source.read_text(encoding='utf-8-sig').splitlines() if x.strip()]
    else:
        with source.open(encoding='utf-8-sig',newline='') as handle:rows=list(csv.DictReader(handle))
    # Stratify the first bounded probes across dish categories without modifying source rows.
    rows=sorted(rows,key=lambda r:(str(r.get('type') or ''),str(r.get('id') or '')))
    groups={}
    for row in rows:groups.setdefault(row.get('type'),[]).append(row)
    ordered=[]
    while any(groups.values()):
        for key in sorted(groups,key=str):
            if groups[key]:ordered.append(groups[key].pop(0))
    result=audit(ordered,args.probe,args.sample_size);result['sourceHash']=before
    if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise RuntimeError('Input changed')
    out.mkdir(parents=True);(out/'media-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['total','probeAttempts','states','sourceHash']},ensure_ascii=False))
if __name__=='__main__':main()
