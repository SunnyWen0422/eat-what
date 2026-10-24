"""Build an offline local candidate and bind its exact bytes to unchanged source."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from maturity_runtime import ROOT, backend_fingerprint, digest, new_output
from local_v4 import validate_jar


def verify_build(jar, manifest):
    jar, manifest = Path(jar).resolve(), Path(manifest).resolve()
    receipt = json.loads(manifest.read_text('utf-8'))
    if receipt.get('purpose') != 'canonical-catalog-isolated-build' or receipt.get('sourceBefore') != receipt.get('sourceAfter'):
        raise ValueError('Invalid canonical build receipt')
    if receipt.get('sourceAfter') != backend_fingerprint() or receipt.get('jarSha256') != digest(jar):
        raise ValueError('Candidate does not match the built source and archive')
    validate_jar(jar)
    return receipt


def main():
    parser = argparse.ArgumentParser()
    for key in ('output','maven','repository','java-home'):
        parser.add_argument('--'+key, required=True)
    args = parser.parse_args()
    output = new_output(args.output)
    before = backend_fingerprint()
    output.mkdir(parents=True)
    build = output / 'target'
    command = [args.maven,'-o','-f',str(ROOT/'backend/pom.xml'),'-Dmaven.repo.local='+str(Path(args.repository).resolve()),
               '-Deatwhat.build.directory='+str(build),'-DskipTests','package']
    env = {key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','TEMP','TMP','USERPROFILE'}}
    env['JAVA_HOME'] = str(Path(args.java_home).resolve())
    with (output/'build.log').open('wb') as log:
        subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                       creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0), check=True)
    after = backend_fingerprint()
    if before != after:
        raise ValueError('Backend source changed during build; no usable receipt created')
    jar = build / 'eatwhat-backend-1.0.0.jar'
    validate_jar(jar)
    receipt = {'purpose':'canonical-catalog-isolated-build','sourceBefore':before,'sourceAfter':after,'jarSha256':digest(jar)}
    manifest = output/'build-manifest.json'
    manifest.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    verify_build(jar,manifest)
    print(json.dumps(receipt),flush=True)


if __name__ == '__main__':
    main()
