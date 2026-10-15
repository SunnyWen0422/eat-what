"""Create a new evidence-aware public catalog bundle; never applies it to a DB."""
import argparse
import json
from catalog_quality import build_bundle, audit_catalog

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source-csv',required=True);p.add_argument('--out',required=True);p.add_argument('--reviews')
    p.add_argument('--audit-only',action='store_true',help='Read CSV or JSONL and profile a fresh output without transforming recipes')
    args=p.parse_args()
    if args.audit_only:
        from pathlib import Path
        destination=Path(args.out)
        if destination.exists():raise FileExistsError('Use a new audit directory')
        result=audit_catalog(args.source_csv);destination.mkdir(parents=True)
        (destination/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        (destination/'review-decisions.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in result['reviewQueue']),encoding='utf-8')
        (destination/'audit.md').write_text('# 全量菜谱质量审计\n\n'+f"记录{result['counts']['rows']}，字段{result['counts']['columns']}；原件未修改。来源SHA256：{result['sourceHash']}。\n\n"+
            f"待核验工作集{len(result['reviewQueue'])}道，均保留UNKNOWN。缺失、重复、异常与分布见audit.json；逐条处理结论见review-decisions.jsonl。\n\n"+
            '\n'.join(result['limitations'])+'\n',encoding='utf-8')
        result={'rows':result['counts']['rows'],'candidates':len(result['reviewQueue']),'sourceHash':result['sourceHash']}
    else:result=build_bundle(args.source_csv,args.out,args.reviews)
    print(json.dumps({k:v for k,v in result.items() if k!='files'},ensure_ascii=False))
