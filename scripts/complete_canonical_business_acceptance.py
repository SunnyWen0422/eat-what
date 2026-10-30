"""Finish only unified-record/shopping checks against unchanged pinned full-read evidence."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import time
import canonical_catalog_acceptance as acceptance
from assistant_v4_acceptance import require

PRIOR_STAGES=("javaFastApiMockProvider","allPrivateDetails","allPublicPages","fixedRecipeAndOptional","strictFilters")
ROOT=Path(__file__).resolve().parents[1]


def validate_prior_evidence(prior,state,bundle,current_java,current_python):
    require(prior.get("preliminary") is False and prior.get("productionTouched") is False
            and prior.get("externalProviderRequests")==0,"Final-scope isolated prior evidence required")
    for key in ("catalogSha256","jarSha256","sourceFingerprint"):
        require(prior.get(key)==state.get(key) and bool(state.get(key)),"Prior evidence identity differs: "+key)
    require(prior.get("catalogRevision")==bundle["catalogRevision"],"Prior catalog revision differs")
    require(current_java==state["sourceFingerprint"]==prior.get("currentSourceFingerprintAtStart")==prior.get("currentSourceFingerprintAtEnd"),"Java source changed since full-read evidence")
    require(current_python==prior.get("pythonSourceFingerprint") and bool(current_python),"Python source changed since full-read evidence")
    stages=prior.get("stages",{})
    require(all(stages.get(name,{}).get("passed") is True for name in PRIOR_STAGES),"All prior read/selection stages must have passed")
    detail=stages["allPrivateDetails"].get("result",{})
    require(all(detail.get(key)==5407 for key in ("recipes","defaultNutritionCompared","defaultQuantitiesCompared"))
            and detail.get("sharingRequests")==16221 and detail.get("dinersChecked")==[1,2,8],"Complete 5407-recipe read evidence required")
    public=stages["allPublicPages"].get("result",{})
    require(public.get("recipes")==len(state["publicCatalogAllowedIds"]),"Public allowlist evidence differs")
    assistant=stages["javaFastApiMockProvider"].get("result",{})
    require(assistant.get("actualFastApi") is True and assistant.get("externalProviderCalls")==0
            and assistant.get("catalogRevision")==bundle["catalogRevision"]
            and assistant.get("javaSharedGeneration")==assistant.get("javaPythonCanonicalReads")=="passed", "Actual guarded assistant evidence required")


def run(state,db,runtime,output):
    from maturity_runtime import backend_fingerprint
    runtime=Path(runtime).resolve();output=Path(output).resolve();state=dict(state)
    require(not output.exists() and not output.is_relative_to(ROOT)
            and not output.is_relative_to(runtime/"private"),"New outside-repository business report directory required")
    bundle=acceptance.validate_owned(state,db,runtime)
    evidence=runtime/"canonical-acceptance-progress.json";raw=evidence.read_bytes();prior=json.loads(raw)
    evidence_sha=hashlib.sha256(raw).hexdigest();java=backend_fingerprint();python=acceptance.python_fingerprint()
    validate_prior_evidence(prior,state,bundle,java,python)
    output.mkdir(parents=True,exist_ok=False)
    report={"passed":False,"finalAcceptance":False,"completed":False,"preliminary":False,
            "acceptanceMode":"pinned_prior_reads_plus_new_business","allRecipeReadsRepeated":False,
            "productionTouched":False,"externalProviderRequests":0,"nativeDeviceVerified":False,
            "catalogRevision":bundle["catalogRevision"],"catalogSha256":state["catalogSha256"],
            "jarSha256":state["jarSha256"],"sourceFingerprint":java,"pythonSourceFingerprint":python,
            "priorEvidence":{"path":str(evidence),"sha256":evidence_sha,"httpRequests":prior.get("httpRequests"),
                             "acceptanceScriptSha256":prior.get("acceptanceScriptSha256")},
            "completionScriptSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "currentAcceptanceScriptSha256":hashlib.sha256(Path(acceptance.__file__).read_bytes()).hexdigest(),
            "reusedStages":{name:copy.deepcopy(prior["stages"][name]) for name in PRIOR_STAGES},"stages":{}}
    destination=output/"business-acceptance.json";checks=acceptance.Checks(state,bundle,output)
    try:
        for name,action in (("sharedWorkspaceCalendarActual",checks.workspace),("shopping",checks.shopping)):
            started=time.monotonic();result=action();report["stages"][name]={"passed":True,"elapsedSeconds":round(time.monotonic()-started,2),"result":result}
            report["newBusinessHttpRequests"]=checks.count;destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
            print("New business acceptance stage passed: "+name,flush=True)
        require(backend_fingerprint()==java and acceptance.python_fingerprint()==python,"Application source changed during business completion")
        require(hashlib.sha256(evidence.read_bytes()).hexdigest()==evidence_sha,"Prior evidence changed during completion")
        report.update(passed=True,finalAcceptance=True,completed=True)
        return report
    except Exception as error:
        report["failure"]={"class":type(error).__name__,"message":str(error)}
        raise
    finally:
        report["newBusinessHttpRequests"]=checks.count
        destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")


def main():
    import pymysql
    parser=argparse.ArgumentParser();parser.add_argument("--runtime",required=True);parser.add_argument("--output",required=True);args=parser.parse_args()
    runtime=Path(args.runtime).resolve();state=json.loads((runtime/"private/runtime.json").read_text("utf-8"))
    require(state.get("purpose")=="canonical-catalog-isolated" and state.get("providerMode")=="mock"
            and re.fullmatch(r"eatwhat_catalog_local_[0-9a-f]{8}",state.get("database","")),"Owned isolated runtime required")
    db=pymysql.connect(host="127.0.0.1",port=state["dbPort"],user="root",password=state["password"],database=state["database"],charset="utf8mb4",autocommit=True,connect_timeout=5)
    try:
        report=run(state,db,runtime,args.output)
        print(json.dumps({"passed":report["passed"],"allRecipeReadsRepeated":False,"newBusinessHttpRequests":report["newBusinessHttpRequests"]}),flush=True)
    finally:db.close()


if __name__=="__main__":main()
