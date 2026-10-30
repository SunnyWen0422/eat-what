"""Unified-record business acceptance and safe reuse of pinned full-read evidence."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import canonical_catalog_acceptance as acceptance
import complete_canonical_business_acceptance as completion


class UnifiedWorkspaceFixture(acceptance.Checks):
    def __init__(self):
        self.revision="canonical-fixture";self.count=0;self.calls=[];self.saved=None;self.confirmations={}
        values={key:80 for key in acceptance.NUTRIENTS}
        self.recipes={i:{"id":i,"dishGroupId":i,"calculatedNutrition":{"completeness":"complete","total":values,"perServing":None}} for i in range(1,10)}
        self.workspace_row=None

    def http(self,path,body=None,method=None,user=910001,**kwargs):
        self.calls.append((path,copy.deepcopy(body),method,user));self.count+=1
        if path.startswith("/recipe-records/overview"):
            plans=[] if self.saved is None or user==910002 else [self.saved]
            records=[] if not plans else [{"id":10,"sourceRecordId":10,"revision":1,"status":"recorded","actualDishes":[{"dishId":str(i),"nutritionSnapshot":{**self.recipes[i]["calculatedNutrition"],"catalogRevision":self.revision}} for i in self.saved["dishIds"]]}]
            return {"recordPolicy":"calendar-records-v1","plans":copy.deepcopy(plans),"consumptions":copy.deepcopy(records)}
        if path=="/meal-workspaces":
            self.workspace_row={"id":"owned-workspace","revision":0,"status":"empty","context":copy.deepcopy(body["context"]),"draft":{"planVersion":0,"dishes":[]}}
            return copy.deepcopy(self.workspace_row)
        if path.endswith("/commands"):
            ids={"generate":[1,2,3],"replace":[4,2,3],"regenerate":[7,8,9]}[body["command"]]
            self.workspace_row.update(status="draft",recommendationCycle={"round":1});self.workspace_row["revision"]+=1;self.workspace_row["draft"]["planVersion"]+=1
            self.workspace_row["draft"]["dishes"]=[{"id":i,"recipe":{"servingRole":"dish","mealCodes":["MEAL_DINNER"]}} for i in ids]
            return copy.deepcopy(self.workspace_row)
        if path.endswith("/context"):
            self.workspace_row["context"]=copy.deepcopy(body["context"]);self.workspace_row["revision"]+=1;return copy.deepcopy(self.workspace_row)
        if path=="/favorite-dishes":return {"success":True}
        if path.startswith("/favorite-dishes/check"):return {"isFavorite":user==910001}
        if path.endswith("/confirm"):
            if body["requestId"] not in self.confirmations:
                self.saved={"id":10,"revision":1,"dishIds":[7,8,9]};self.workspace_row["confirmation"]={"date":self.workspace_row["context"]["date"],"mealType":"dinner","planRevision":1};self.confirmations[body["requestId"]]=copy.deepcopy(self.workspace_row)
            return copy.deepcopy(self.confirmations[body["requestId"]])
        if path.startswith("/diet-reviews"):
            summary={"entryCount":3,"coveredCount":3,"unknownCount":0,"complete":True,"personalIntakeAvailable":False,"knownTotal":{key:240 for key in acceptance.NUTRIENTS},"total":{key:240 for key in acceptance.NUTRIENTS}}
            return {"blocks":{"actualDetails":{"nutrition":summary}}}
        raise AssertionError("Unexpected or retired business API: "+path)


class UnifiedBusinessAcceptanceTest(unittest.TestCase):
    def test_summary_energy_rounds_only_after_precise_sum_and_other_nutrients_stay_exact(self):
        recipes=[{"calculatedNutrition":{"total":{key:(100.49 if key=="energyKcal" else .125) for key in acceptance.NUTRIENTS}}} for _ in range(2)]
        totals={key:(201 if key=="energyKcal" else .25) for key in acceptance.NUTRIENTS}
        summary={"entryCount":2,"coveredCount":2,"unknownCount":0,"complete":True,"personalIntakeAvailable":False,"knownTotal":totals,"total":totals}
        acceptance.check_nutrition_summary(recipes,summary)
        for key,wrong in (("energyKcal",200),("energyKcal",200.98),("proteinG",.251)):
            bad=copy.deepcopy(summary);bad["knownTotal"][key]=wrong
            with self.subTest(key=key,wrong=wrong),self.assertRaises(AssertionError):acceptance.check_nutrition_summary(recipes,bad)
        self.assertEqual(100.49,recipes[0]["calculatedNutrition"]["total"]["energyKcal"])

    def test_calendar_save_is_the_only_record_and_never_calls_retired_consumption_write(self):
        fixture=UnifiedWorkspaceFixture()
        with patch.object(acceptance,"check_detail"):
            report=fixture.workspace()
        self.assertEqual("calendar_records",report["recordBasis"])
        self.assertTrue(report["calendarSaveReplay"])
        self.assertFalse(any(path.startswith("/meal-consumptions/") for path,*_ in fixture.calls))
        self.assertEqual(2,sum(path.endswith("/confirm") for path,*_ in fixture.calls))

    def test_shopping_accepts_literal_to_taste_and_never_invents_a_quantity(self):
        checks=object.__new__(acceptance.Checks)
        checks.recipes={1:{"id":1,"baseServings":2,"ingredients":[{"quantity":None,"defaultEnabled":True}]},2:{"id":2,"baseServings":None,"ingredients":[]}}
        item={"canonicalName":"盐","normalizedVariant":"salt","quantityKind":"DISCRETIONARY","quantityValue":None,"quantityText":"适量","unitCode":"g","sourceQuantityText":"盐 适量"}
        group={"dishId":1,"selectionKey":"dish-1","targetPeople":2,"items":[item]}
        def http(path,body=None,user=910001,**kwargs):
            if path=="/shopping-list":return {"version":0,"dishes":[]}
            if path=="/shopping-list/preview":return {"previewId":"owned-preview","dishes":[{**copy.deepcopy(group),"dishId":body["dishIds"][0],"targetPeople":body["targetPeople"]}]}
            if path=="/shopping-list/items:batch-add":return {"list":{"version":1,"dishes":[copy.deepcopy(group)]}}
            raise AssertionError(path)
        checks.http=http
        self.assertTrue(checks.shopping()["idempotent"])
        item["quantityValue"]=1
        with self.assertRaisesRegex(AssertionError,"unknown quantities"):checks.shopping()


class BusinessEvidenceCompletionTest(unittest.TestCase):
    def fixture(self):
        state={"catalogSha256":"catalog","jarSha256":"jar","sourceFingerprint":"java","publicCatalogAllowedIds":[1,2]}
        bundle={"catalogRevision":"approved"}
        stages={name:{"passed":True,"result":{}} for name in completion.PRIOR_STAGES}
        stages["allPrivateDetails"]["result"]={"recipes":5407,"defaultNutritionCompared":5407,"defaultQuantitiesCompared":5407,"sharingRequests":16221,"dinersChecked":[1,2,8]}
        stages["allPublicPages"]["result"]={"recipes":2}
        stages["javaFastApiMockProvider"]["result"]={"actualFastApi":True,"externalProviderCalls":0,"catalogRevision":"approved","javaSharedGeneration":"passed","javaPythonCanonicalReads":"passed"}
        prior={**state,"catalogRevision":"approved","preliminary":False,"productionTouched":False,"externalProviderRequests":0,"currentSourceFingerprintAtStart":"java","currentSourceFingerprintAtEnd":"java","pythonSourceFingerprint":"python","httpRequests":21788,"stages":stages,"failure":{"message":"old unified-record assertion"}}
        return state,bundle,prior

    def test_prior_catalog_build_sources_and_all_read_stages_are_required(self):
        state,bundle,prior=self.fixture();completion.validate_prior_evidence(prior,state,bundle,"java","python")
        for field,value in (("catalogSha256","other"),("jarSha256","other"),("sourceFingerprint","other"),("pythonSourceFingerprint","other"),("currentSourceFingerprintAtEnd","other"),("preliminary",True),("productionTouched",True),("externalProviderRequests",1)):
            bad=copy.deepcopy(prior);bad[field]=value
            with self.subTest(field=field),self.assertRaises(AssertionError):completion.validate_prior_evidence(bad,state,bundle,"java","python")
        for name in completion.PRIOR_STAGES:
            bad=copy.deepcopy(prior);bad["stages"][name]["passed"]=False
            with self.subTest(stage=name),self.assertRaises(AssertionError):completion.validate_prior_evidence(bad,state,bundle,"java","python")
        bad=copy.deepcopy(prior);bad["stages"]["allPrivateDetails"]["result"]["recipes"]=5406
        with self.assertRaises(AssertionError):completion.validate_prior_evidence(bad,state,bundle,"java","python")

    def test_completion_reuses_sha_pinned_prior_reads_without_overwriting_or_rereading(self):
        state,bundle,prior=self.fixture();checks=Mock(count=17);checks.workspace.return_value={"recordBasis":"calendar_records"};checks.shopping.return_value={"idempotent":True}
        with tempfile.TemporaryDirectory() as temporary:
            runtime=Path(temporary)/"runtime";runtime.mkdir();evidence=runtime/"canonical-acceptance-progress.json";raw=json.dumps(prior).encode();evidence.write_bytes(raw);output=Path(temporary)/"business"
            with patch.object(acceptance,"validate_owned",return_value=bundle),patch.object(acceptance,"Checks",return_value=checks),patch.object(acceptance,"python_fingerprint",return_value="python"),patch("maturity_runtime.backend_fingerprint",return_value="java"):
                report=completion.run(state,Mock(),runtime,output)
            self.assertTrue(report["passed"]);self.assertTrue(report["finalAcceptance"]);self.assertFalse(report["allRecipeReadsRepeated"]);self.assertEqual(17,report["newBusinessHttpRequests"]);self.assertEqual(hashlib.sha256(raw).hexdigest(),report["priorEvidence"]["sha256"]);self.assertEqual(raw,evidence.read_bytes());self.assertTrue((output/"business-acceptance.json").exists())
            checks.all_details.assert_not_called();checks.pages.assert_not_called();checks.filters.assert_not_called();checks.workspace.assert_called_once();checks.shopping.assert_called_once()
            with self.assertRaisesRegex(AssertionError,"New outside-repository"):
                completion.run(state,Mock(),runtime,output)

    def test_invalid_prior_evidence_stops_before_business_reads_or_new_output(self):
        state,bundle,prior=self.fixture();prior["stages"]["strictFilters"]["passed"]=False
        with tempfile.TemporaryDirectory() as temporary:
            runtime=Path(temporary)/"runtime";runtime.mkdir();(runtime/"canonical-acceptance-progress.json").write_text(json.dumps(prior));output=Path(temporary)/"business"
            with patch.object(acceptance,"validate_owned",return_value=bundle),patch.object(acceptance,"Checks") as checks,patch.object(acceptance,"python_fingerprint",return_value="python"),patch("maturity_runtime.backend_fingerprint",return_value="java"):
                with self.assertRaisesRegex(AssertionError,"prior read/selection"):
                    completion.run(state,Mock(),runtime,output)
            checks.assert_not_called();self.assertFalse(output.exists())


if __name__=="__main__":unittest.main()
