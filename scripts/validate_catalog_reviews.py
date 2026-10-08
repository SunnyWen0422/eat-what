import argparse,csv,json
from pathlib import Path
from catalog_quality import normalize_recipe
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source-csv',required=True);parser.add_argument('--reviews',required=True);args=parser.parse_args()
    with Path(args.source_csv).open(encoding='utf-8-sig',newline='') as f:rows={int(r['id']):r for r in csv.DictReader(f)}
    seen=set()
    for line in Path(args.reviews).read_text(encoding='utf-8').splitlines():
        if not line.strip():continue
        review=json.loads(line);key=review.get('dishId')
        if key in seen or key not in rows:raise ValueError('Duplicate or unknown review ID')
        normalize_recipe(rows[key],review=review);seen.add(key)
    print(json.dumps({'reviewRecordsValidated':len(seen),'sourceFactsStillRequireHumanReview':True}))
if __name__=='__main__':main()
