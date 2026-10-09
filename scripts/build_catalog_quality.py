"""Create a new evidence-aware public catalog bundle; never applies it to a DB."""
import argparse
import json
from catalog_quality import build_bundle

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source-csv',required=True);p.add_argument('--out',required=True);p.add_argument('--reviews')
    args=p.parse_args();result=build_bundle(args.source_csv,args.out,args.reviews)
    print(json.dumps({k:v for k,v in result.items() if k!='files'},ensure_ascii=False))
