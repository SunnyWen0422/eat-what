"""Compile templates with the installed WeChat compilers, without IDE launch/network."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--compiler-dir",required=True)
    parser.add_argument("--output-dir",required=True)
    args=parser.parse_args()
    output=Path(args.output_dir).resolve()
    output.mkdir(parents=True,exist_ok=True)
    results=[]
    for name,extension in [("wcc.exe",".wxml"),("wcsc.exe",".wxss")]:
        binary=(Path(args.compiler_dir)/name).absolute()
        if not binary.is_file():raise RuntimeError('Native compiler is missing: '+name)
        files=[str(p.relative_to(ROOT)).replace("\\","/") for directory in ["pages","components","templates","styles"] for p in (ROOT/directory).rglob("*"+extension)]
        if extension==".wxss":
            files.append("app.wxss")
        process=subprocess.run([str(binary),"-o",str(output/(name+".js")),*files],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        (output/(name+".log")).write_bytes(process.stdout)
        results.append({"compiler":name,"fileCount":len(files),"exitCode":process.returncode,"compiledBytes":(output/(name+".js")).stat().st_size if (output/(name+".js")).exists() else 0})
    report={"scope":"WXML/WXSS compile only; native runtime and device acceptance pending","results":results}
    (output/"native-compile.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report))
    if any(row["exitCode"]!=0 or row["compiledBytes"]==0 for row in results):
        raise SystemExit(1)


if __name__=="__main__":
    main()
