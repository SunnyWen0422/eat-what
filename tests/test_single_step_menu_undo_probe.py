"""Pure scenario/guard checks. No server, SQL, API, provider or credentials."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/"scripts/check_single_step_menu_undo.py"
SPEC=importlib.util.spec_from_file_location("single_step_menu_undo_probe",SCRIPT)
probe=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class FakeChecks:
    def __init__(self, fault=None):self.w=None;self.calls=[];self.count=0;self.fault=fault;self.receipts={}
    def http(self,path,body=None,method=None,user=None,allowed=(200,201,202,204)):
        self.calls.append((path,copy.deepcopy(body),user));self.count+=1
        assert user==probe.ACTOR
        if "/current?" in path:return dict(workspace=copy.deepcopy(self.w))
        if path=="/meal-workspaces":
            self.w=dict(id="synthetic-workspace",revision=0,status="draft",context=copy.deepcopy(body["context"]),draft=dict(planVersion=0,dishes=[],history=[],canUndo=False,changeKind="none"))
            return copy.deepcopy(self.w)
        request=body["requestId"]
        if request in self.receipts:
            if self.fault=="replay-mutates":self.w["revision"]+=1;return copy.deepcopy(self.w)
            result=copy.deepcopy(self.receipts[request])
            # The Java request log stores a sanitized identity/version receipt.
            result["draft"]={"planVersion":result["draft"]["planVersion"]}
            if self.fault=="replay-wrong-workspace":result["id"]="other-workspace"
            if self.fault=="replay-wrong-version":result["draft"]["planVersion"]+=1
            if self.fault=="replay-wrong-status":result["status"]="generating"
            return result
        draft=self.w["draft"]
        if path.endswith("/context"):
            self.w["context"]=copy.deepcopy(body["context"]);draft["changeKind"]="configuration"
            if self.fault=="config-history":draft["history"].append(copy.deepcopy(draft["dishes"]))
        elif body["command"]=="generate":
            draft.update(dishes=[dict(id=11,type="meat",recipe=dict(quantity=100)),dict(id=21,type="veg",recipe=dict(quantity=200))],canUndo=self.fault=="first-undo",changeKind="menu")
        elif body["command"]=="replace":
            draft["history"]=[copy.deepcopy(draft["dishes"])];draft["dishes"][0]["id"]=12;draft.update(canUndo=True,changeKind="menu")
        elif body["command"]=="undo":
            if not draft["canUndo"]:
                status=200 if self.fault=="second-accepted" else 400
                assert status in allowed,"Unexpected successful second undo"
                return dict(error="No undo target")
            draft["dishes"]=draft["history"][0];draft.update(history=[],canUndo=self.fault=="repeated-eligibility",changeKind="menu_undo")
            if self.fault=="undo-config":self.w["context"]["people"]=2
        self.w["revision"]+=1;draft["planVersion"]+=1
        self.receipts[request]=copy.deepcopy(self.w)
        return copy.deepcopy(self.w)


class ProbeTests(unittest.TestCase):
    def run_probe(self,fault=None,snapshot=lambda:{"business":"same"}):
        checks=FakeChecks(fault)
        report=probe.scenario(checks,snapshot,"2026-01-02","INTENSITY_LIGHT")
        return checks,report
    def test_success_chain_only_mutates_second_account_and_replays_original_exact_request(self):
        checks,report=self.run_probe()
        self.assertTrue(report["passed"])
        self.assertTrue(all(report["checks"].values()))
        self.assertEqual(3,report["people"])
        self.assertTrue(all(call[2]==910002 for call in checks.calls))
        replay=[body for _,body,_ in checks.calls if body and body.get("requestId")==report["undoRequestId"]]
        self.assertEqual(2,len(replay));self.assertEqual(replay[0],replay[1])
        created=checks.calls[0][1]["context"]
        self.assertEqual("",created["requirements"]);self.assertEqual(probe.COUNTS,created["counts"])
        self.assertEqual([11,21],report["menuIdsBefore"]);self.assertEqual([12,21],report["menuIdsAfterReplace"])
    def test_policy_regressions_are_detected(self):
        for fault in ("config-history","undo-config","repeated-eligibility","second-accepted","replay-mutates","replay-wrong-workspace","replay-wrong-version","replay-wrong-status","first-undo"):
            with self.subTest(fault=fault):
                with self.assertRaises(AssertionError):self.run_probe(fault)
    def test_protected_account_change_is_detected(self):
        count=[0]
        def snapshot():count[0]+=1;return {"state":count[0]}
        with self.assertRaisesRegex(AssertionError,"Protected synthetic account"):self.run_probe(snapshot=snapshot)
    def test_preflight_refuses_production_or_stopped_owner_before_any_connections(self):
        with tempfile.TemporaryDirectory() as directory:
            out=Path(directory);(out/"private").mkdir()
            state=dict(api="http://127.0.0.1:15001/api",database="eatwhat_catalog_local_1234abcd",dbPort=15002,purpose="canonical-catalog-isolated",providerMode="mock",jarSha256="a"*64,sourceFingerprint="b"*64)
            def save():
                (out/"private/runtime.json").write_text(json.dumps(state),encoding="utf-8")
                (out/"ready.json").write_text(json.dumps({key:state[key] for key in ("api","jarSha256","sourceFingerprint")}),encoding="utf-8")
            with patch.dict(sys.modules,{"canonical_catalog_runtime":types.SimpleNamespace(no_links=lambda _:None)}):
                save();self.assertEqual(state,probe.preflight(out)[1])
                state["api"]="https://production.invalid/api";save()
                with self.assertRaises(AssertionError):probe.preflight(out)
                state["api"]="http://127.0.0.1:15001/api";save();(out/"cleanup.json").write_text("{}",encoding="utf-8")
                with self.assertRaises(AssertionError):probe.preflight(out)


if __name__=="__main__":unittest.main()
