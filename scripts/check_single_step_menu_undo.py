"""Opt-in owned-loopback HTTP regression for menu-only, single-step undo.

Only synthetic user 910002 is mutated; user 910001 is read-only checked.
Empty requirements keep generation on the Java rules path, with no model call.
Never starts a service. Run only after the owner has started the final build.
"""
import argparse
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import uuid

ACTOR, PROTECTED = 910002, 910001
ROOT = Path(__file__).resolve().parents[1]
COUNTS = dict(meat=1, veg=1, soup=0, staple=0, dessert=0)


def require(ok, message):
    if not ok: raise AssertionError(message)


def identity(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def preflight(output):
    from canonical_catalog_runtime import no_links
    no_links(output)
    output=Path(output).resolve()
    require(not output.is_relative_to(ROOT), "Outside-repository owned runtime required")
    no_links(output)
    state=json.loads((output/"private/runtime.json").read_text("utf-8"))
    api=urllib.parse.urlsplit(state.get("api", ""))
    require(state.get("purpose")=="canonical-catalog-isolated" and state.get("providerMode")=="mock", "Owned mock runtime required")
    require(api.scheme=="http" and api.hostname=="127.0.0.1" and api.port and api.path=="/api" and not api.username and not api.password and not api.query and not api.fragment, "Explicit loopback API required")
    require(re.fullmatch(r"eatwhat_catalog_local_[a-f0-9]{8}",state.get("database","")), "Dedicated synthetic database required")
    require(type(state.get("dbPort")) is int and 1024<=state["dbPort"]<=65535, "Owned MySQL port required")
    ready=json.loads((output/"ready.json").read_text("utf-8"))
    require(not (output/"cleanup.json").exists() and all(ready.get(key)==state.get(key) for key in ("api","jarSha256","sourceFingerprint")), "Live matching owner readiness required")
    return output,state


def protected_snapshot(db):
    """Hash only, never emit another account's business rows or private text."""
    with db.cursor() as c:
        c.execute("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND LOWER(COLUMN_NAME)='user_id' ORDER BY TABLE_NAME")
        tables=c.fetchall()
        result={}
        for table,column in tables:
            require(re.fullmatch(r"[A-Za-z0-9_]+",table) and re.fullmatch(r"[A-Za-z0-9_]+",column), "Unsafe owned schema identifier")
            c.execute(f"SELECT * FROM `{table}` WHERE `{column}`=%s",(PROTECTED,))
            rows=sorted((identity(row) for row in c.fetchall()))
            result[table]=dict(rows=len(rows),sha256=identity(rows))
        c.execute("SELECT * FROM users WHERE id=%s",(PROTECTED,))
        result["users"]=dict(sha256=identity(c.fetchall()))
    return result


def fresh_day(db):
    today=datetime.now(timezone(timedelta(hours=8))).date()
    for _ in range(20):
        day=str(today-timedelta(days=1+int(uuid.uuid4().hex[:8],16)%5000))
        with db.cursor() as c:
            c.execute("SELECT COUNT(*) FROM meal_workspace WHERE user_id IN (%s,%s) AND meal_date=%s AND meal_type='dinner'",(ACTOR,PROTECTED,day))
            workspaces=c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM recipe_records WHERE USER_ID IN (%s,%s) AND RECORD_DATE=%s AND MEAL_TYPE='dinner'",(ACTOR,PROTECTED,day))
            records=c.fetchone()[0]
        if workspaces==records==0:return day
    raise AssertionError("No empty synthetic meal slot found; no existing row was overwritten")


def scenario(checks, snapshot, day, light_code):
    before=snapshot()
    def http(path, body=None, **kwargs):
        require(path=="/meal-workspaces" or path.startswith("/meal-workspaces/current?") or re.fullmatch(r"/meal-workspaces/[A-Za-z0-9_-]+/(commands|context)",path), "Only Java workspace rule endpoints are allowed")
        require("user" not in kwargs, "Scenario identity cannot be overridden")
        return checks.http(path,body,user=ACTOR,**kwargs)
    context=dict(date=day,mealType="dinner",people=2,compositionMode="manual",counts=copy.deepcopy(COUNTS),requirements="",ownedIngredients=[],recommendationPolicy="balanced-v1")
    w=http("/meal-workspaces",dict(requestId=str(uuid.uuid4()),expectedWorkspaceRevision=0,context=context))
    require(w["draft"].get("canUndo") is False, "An empty menu cannot grant undo")
    def read():
        result=http("/meal-workspaces/current?"+urllib.parse.urlencode(dict(date=day,mealType="dinner")))
        return result.get("workspace",result)
    def body(command, dish=None):
        value=dict(requestId=str(uuid.uuid4()),expectedWorkspaceRevision=w["revision"],planVersion=w["draft"]["planVersion"],command=command)
        if dish is not None:value["dishId"]=dish
        return value
    def complete(value):
        deadline=time.monotonic()+45
        while value.get("status")=="generating" and time.monotonic()<deadline:
            time.sleep(.1);value=read()
        require(value.get("status")=="draft" and len(value["draft"]["dishes"])==2,"Two-dish rules task did not complete")
        require(value["context"].get("requirements","")=="","Scenario must never request model interpretation")
        return value
    commands="/meal-workspaces/"+w["id"]+"/commands"
    configuration="/meal-workspaces/"+w["id"]+"/context"
    w=complete(http(commands,body("generate")))
    original=copy.deepcopy(w["draft"]["dishes"])
    require(sorted(d["type"] for d in original)==["meat","veg"],"Manual 1 meat / 1 veg composition differs")
    require(w["draft"].get("canUndo") is False and not w["draft"].get("history"),"First generation must not create an undo target")
    w=complete(http(commands,body("replace",original[0]["id"])))
    replacement=copy.deepcopy(w["draft"]["dishes"])
    require(replacement!=original and w["draft"].get("canUndo") is True and len(w["draft"].get("history",[]))==1,"Actual replacement must grant exactly one undo")
    require([d["id"] for d in replacement[1:]]==[d["id"] for d in original[1:]],"Replacement changed unrelated dishes")
    new_context=copy.deepcopy(w["context"])
    new_context["people"]=3
    new_context.setdefault("recommendationPreferences",{})["includeTagCodes"]=[light_code]
    w=http(configuration,dict(requestId=str(uuid.uuid4()),expectedWorkspaceRevision=w["revision"],context=new_context),method="PATCH")
    require(w["draft"]["dishes"]==replacement and w["draft"].get("canUndo") is True and len(w["draft"].get("history",[]))==1,"Configuration must retain menu and its sole prior undo target")
    require(w["draft"].get("changeKind")=="configuration","Configuration response must not claim a menu transition")
    current_context=copy.deepcopy(w["context"])
    undo_body=body("undo")
    prior_revision,prior_plan=w["revision"],w["draft"]["planVersion"]
    w=http(commands,undo_body)
    require(w["draft"]["dishes"]==original,"Undo did not restore the immediately preceding menu")
    require(w["context"]["people"]==3 and w["context"].get("recommendationPreferences")==current_context.get("recommendationPreferences"),"Undo restored obsolete diners/preferences")
    require({key:value for key,value in w["context"]["counts"].items() if value}=={key:value for key,value in COUNTS.items() if value},"Undo did not restore the necessary menu composition")
    require({key:value for key,value in w["context"].items() if key!="counts"}=={key:value for key,value in current_context.items() if key!="counts"},"Undo changed configuration beyond necessary menu counts")
    require(w["draft"].get("canUndo") is False and not w["draft"].get("history") and w["draft"].get("changeKind")=="menu_undo","Undo must consume its only target")
    require(w["revision"]==prior_revision+1 and w["draft"]["planVersion"]==prior_plan+1,"Undo transition versions differ")
    undone=copy.deepcopy(read())
    http(commands,body("undo"),allowed=(400,409))
    require(read()==undone,"A second new undo request changed the workspace")
    replay=http(commands,undo_body)
    # Stored request receipts intentionally omit recipe snapshots and input text.
    # Match the committed identity/versions, then verify the full current state.
    require(all(replay.get(key)==w.get(key) for key in ("id","revision","status"))
            and replay.get("draft",{}).get("planVersion")==w["draft"]["planVersion"]
            and read()==undone,"Original undo request replay was not idempotent")
    after=snapshot()
    require(after==before,"Protected synthetic account 910001 changed")
    return dict(passed=True,actor=ACTOR,protectedAccount=PROTECTED,date=day,workspaceId=w["id"],
                checks=dict(firstGenerationNoUndo=True,replacementOneUndo=True,configurationKeepsMenu=True,
                            undoKeepsCurrentPeopleAndPreferences=True,undoConsumesEligibility=True,
                            secondNewUndoRejectedWithoutChange=True,sameRequestReplayIdempotent=True,protectedAccountUnchanged=True),
                undoRequestId=undo_body["requestId"],revision=w["revision"],planVersion=w["draft"]["planVersion"],
                menuIdsBefore=[d["id"] for d in original],menuIdsAfterReplace=[d["id"] for d in replacement],
                people=3,lightPreferenceCode=light_code,protectedFingerprint=identity(before),providerRequestsByScript=0,modelInterpretationRequested=False)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime",required=True)
    args=parser.parse_args()
    output,state=preflight(args.runtime)
    import pymysql
    from canonical_catalog_acceptance import validate_owned,Checks
    from canonical_catalog_runtime import validate_database_identity
    db=pymysql.connect(host="127.0.0.1",port=state["dbPort"],user="root",password=state["password"],database=state["database"],charset="utf8mb4",autocommit=True,connect_timeout=5)
    destination=output/("single-step-menu-undo-"+uuid.uuid4().hex+".json")
    try:
        validate_database_identity(db,output/"private/mysql",state)
        bundle=validate_owned(state,db,output)
        light=[key for key,value in bundle["taxonomy"]["entries"].items() if value.get("label")=="清淡"]
        require(len(light)==1,"One authoritative light-flavor code required")
        checks=Checks(state,bundle,output)
        report=scenario(checks,lambda:protected_snapshot(db),fresh_day(db),light[0])
        with db.cursor() as c:
            c.execute("SELECT COUNT(*) FROM workspace_request_log WHERE user_id=%s AND request_id=%s",(ACTOR,report["undoRequestId"]))
            require(c.fetchone()[0]==1,"Undo replay created duplicate request receipts")
        validate_owned(state,db,output)
        report.update(httpRequests=checks.count,sourceFingerprint=state["sourceFingerprint"],catalogSha256=state["catalogSha256"],productionTouched=False)
        with destination.open("x",encoding="utf-8") as stream:json.dump(report,stream,ensure_ascii=False,indent=2)
        print(json.dumps(dict(passed=True,report=str(destination),httpRequests=checks.count)),flush=True)
    finally:db.close()


if __name__=="__main__":main()
