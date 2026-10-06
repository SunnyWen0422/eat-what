"""Export only mini-program runtime files; do not scan private/test/backend directories."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
DIRECTORIES=('pages','components','utils','templates','styles','assets')
FILES=('app.js','app.json','app.wxss','project.config.json','sitemap.json')
EXTENSIONS={'.js','.json','.wxml','.wxss','.wxs','.png','.jpg','.jpeg','.webp','.gif'}

def export(source,destination):
 source=Path(os.path.abspath(source)).resolve();destination=Path(os.path.abspath(destination)).resolve()
 if destination==source or destination.is_relative_to(source):raise ValueError('Export must be outside the source tree')
 if destination.exists():raise ValueError('Export destination already exists; use a new directory to preserve local edits')
 files=[source/name for name in FILES if (source/name).is_file()]
 for name in DIRECTORIES:
  files.extend(p for p in (source/name).rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS and '__pycache__' not in p.parts)
 manifest=[];destination.mkdir(parents=True)
 for file in sorted(files):
  if file.is_symlink():raise ValueError('Runtime symlinks are unsupported')
  relative=file.relative_to(source);target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,target)
  manifest.append({'path':relative.as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 (destination/'source-manifest.json').write_text(json.dumps({'source':str(source),'files':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
 return {'fileCount':len(manifest),'output':str(destination)}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);args=parser.parse_args();print(json.dumps(export(ROOT,args.out),ensure_ascii=False))
