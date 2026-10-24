"""Opt-in acceptance against the owner-created canonical MySQL/Java runtime.

No ambient configuration, production endpoint, provider credential or image is
read. The source is pinned by the runtime receipt. Reports contain no secrets.
"""
from __future__ import annotations

import concurrent.futures
import copy
from datetime import date, timedelta
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from assistant_v4_acceptance import bearer, require, uid

NUTRIENTS = ("energyKcal", "proteinG", "fatG", "carbohydrateG", "fiberG", "sodiumMg")
TOLERANCE = Decimal("0.00000001")
INTERNAL_FIELDS = {"compositionSource", "sourceAttribution", "provenance", "dependencySha256",
                   "quantifiedSubtotal", "unknownReasons", "unknownLineIds", "conversionNote",
                   "scaling", "scaleRule", "batches", "stepTextBasisServings"}
QUANTITY_POLICY = "fixed-recipe-v1"


def python_fingerprint():
    root = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    for path in sorted((root / "recommend-service").rglob("*.py")):
        digest.update((path.relative_to(root).as_posix() + ":" + hashlib.sha256(path.read_bytes()).hexdigest() + "\n").encode())
    return digest.hexdigest()


def numeric_equal(actual, expected, message):
    if expected is None:
        require(actual is None, message + ": unknown value became numeric")
        return
    require(actual is not None and not isinstance(actual, bool), message + ": number missing")
    require(abs(Decimal(str(actual)) - Decimal(str(expected))) <= TOLERANCE, message + ": value differs")


def nutrition_equal(actual, expected, label):
    require(isinstance(actual, dict), label + ": nutrition missing")
    for basis in ("total", "perServing"):
        wanted = expected.get(basis)
        found = actual.get(basis)
        if wanted is None:
            require(found is None, label + ": unknown " + basis + " must remain null")
        else:
            require(isinstance(found, dict), label + ": " + basis + " missing")
            for nutrient in NUTRIENTS:
                numeric_equal(found.get(nutrient), wanted[nutrient], label + ": " + basis + "." + nutrient)
    require(actual.get("completeness") == expected.get("completeness"), label + ": completeness differs")


def check_nutrition_summary(recipes, summary):
    known = [recipe["calculatedNutrition"]["total"] for recipe in recipes if recipe["calculatedNutrition"]["total"] is not None]
    covered = len(known)
    complete = bool(recipes) and covered == len(recipes)
    require(summary.get("entryCount") == len(recipes) and summary.get("coveredCount") == covered
            and summary.get("unknownCount") == len(recipes) - covered and summary.get("complete") is complete,
            "Diet review nutrition coverage differs")
    require(summary.get("personalIntakeAvailable") is False, "Recipe nutrition was claimed as individual intake")
    for field, available in (("knownTotal", bool(known)), ("total", complete)):
        actual = summary.get(field)
        if not available:
            require(actual is None, "Diet review fabricated " + field)
        else:
            require(isinstance(actual, dict), "Diet review omitted " + field)
            for nutrient in NUTRIENTS:
                expected = sum((Decimal(str(total[nutrient])) for total in known), Decimal(0))
                numeric_equal(actual.get(nutrient), expected, "Diet review " + field + "." + nutrient)


def no_internal_fields(value):
    if isinstance(value, dict):
        require(not INTERNAL_FIELDS.intersection(value), "Consumer response contains maintenance-only fields")
        for child in value.values():
            no_internal_fields(child)
    elif isinstance(value, list):
        for child in value:
            no_internal_fields(child)


def check_fixed_calculation(source, result, diners=None, baseline=None):
    label = "fixed recipe " + str(source["id"])
    require(isinstance(result, dict) and result.get("recipeId") == source["id"], label + ": calculation missing")
    require(result.get("quantityPolicy") == QUANTITY_POLICY and result.get("quantityBasis") == "fixed_recipe"
            and result.get("portionBasis") == "equal_share_reference", label + ": wrong quantity policy")
    require("diners" in result, label + ": explicit sharing basis missing")
    numeric_equal(result.get("diners"), diners, label + ": diners")
    numeric_equal(result.get("baseServings"), source.get("baseServings"), label + ": recorded base")
    nutrition = copy.deepcopy(source["calculatedNutrition"])
    nutrition["perServing"] = ({key: Decimal(str(value)) / Decimal(str(diners))
                               for key, value in nutrition["total"].items()}
                              if diners is not None and nutrition["total"] is not None else None)
    nutrition_equal(result.get("nutrition"), nutrition, label)
    original = {line["id"]: line for line in source["ingredients"]}
    found = {line["lineId"]: line for line in result["ingredients"]}
    require(set(original) == set(found), label + ": ingredient set changed")
    for line_id, line in original.items():
        actual = found[line_id]
        require(actual.get("ingredientId") == line["ingredientId"] and actual.get("enabled") == line["defaultEnabled"], label + ": ingredient identity or selection changed")
        numeric_equal(actual.get("quantity"), line["quantity"] if line["defaultEnabled"] else 0, label + ": quantity " + line_id)
        if line["quantity"] is None and line["defaultEnabled"]:
            require(actual.get("grams") is None and actual.get("procurementQuantity") is None
                    and actual.get("quantityDisplay") == "适量", label + ": discretionary amount guessed")
    if baseline is not None:
        require(result["ingredients"] == baseline["ingredients"], label + ": diners changed ingredients or procurement")
        require(result["steps"] == baseline["steps"], label + ": diners changed fixed recipe steps")
    no_internal_fields(result)


def check_detail(source, detail, revision):
    identifier = source["id"]
    label = "recipe " + str(identifier)
    recipe = detail.get("recipe")
    scaled = detail.get("scaledRecipe")
    require(detail.get("id") == identifier and detail.get("name") == source["name"], label + ": identity differs")
    require(detail.get("catalogRevision") == revision and isinstance(recipe, dict), label + ": release missing")
    require(recipe.get("catalogContractVersion") == 4, label + ": wrong contract")
    require(detail.get("quantityPolicy") == QUANTITY_POLICY and recipe.get("quantityPolicy") == QUANTITY_POLICY, label + ": fixed policy missing")
    require(recipe.get("baseServings") == source.get("baseServings"), label + ": base servings changed")
    require(recipe.get("timing") == source.get("timing"), label + ": timing changed")
    require(recipe.get("servingRole") == source.get("servingRole"), label + ": serving role changed")
    require(recipe.get("categoryCode") == source.get("categoryCode"), label + ": category changed")
    for field in ("mealCodes", "dietaryCodes", "allergenCodes"):
        expected = source.get(field)
        require(recipe.get(field) is None if expected is None else set(recipe.get(field) or []) == set(expected),
                label + ": " + field + " changed")
    require(isinstance(scaled, dict) and scaled.get("recipeId") == identifier, label + ": default calculation absent")
    check_fixed_calculation(source, scaled)
    nutrition_equal(recipe.get("calculatedNutrition"), source["calculatedNutrition"], label + " display")
    original = {line["id"]: line for line in source["ingredients"]}
    projected = {line["id"]: line for line in recipe["ingredients"]}
    quantities = {line["lineId"]: line for line in scaled["ingredients"]}
    require(set(original) == set(projected) == set(quantities), label + ": ingredients incomplete")
    for line_id, line in original.items():
        shown, actual = projected[line_id], quantities[line_id]
        require(shown.get("quantity") == line.get("quantity"), label + ": authoring quantity changed")
        require(actual.get("ingredientId") == line["ingredientId"], label + ": ingredient identity changed")
        require(actual.get("enabled") == line["defaultEnabled"], label + ": optional default changed")
        wanted = line["quantity"] if line["defaultEnabled"] else 0
        numeric_equal(actual.get("quantity"), wanted, label + ": line " + line_id)
        if line["quantity"] is None and line["defaultEnabled"]:
            require(actual.get("quantityDisplay") == "适量" and actual.get("grams") is None,
                    label + ": discretionary amount was guessed")
    require(recipe.get("steps") and scaled.get("steps"), label + ": rendered steps missing")
    require(all("{{" not in step["text"] for step in recipe["steps"] + scaled["steps"]), label + ": raw amount token leaked")
    no_internal_fields(detail)


def validate_owned(state, db, output):
    endpoint = urllib.parse.urlsplit(state.get("api", ""))
    require(state.get("purpose") == "canonical-catalog-isolated" and state.get("providerMode") == "mock",
            "Owner-created canonical mock runtime is required")
    require(endpoint.scheme == "http" and endpoint.hostname == "127.0.0.1" and endpoint.port
            and endpoint.path == "/api" and not endpoint.username and not endpoint.query and not endpoint.fragment,
            "Only the dedicated loopback API is allowed")
    require(re.fullmatch(r"eatwhat_catalog_local_[0-9a-f]{8}", state.get("database", "")) is not None,
            "Dedicated catalog database is required")
    output = Path(output).resolve()
    receipt = json.loads((output / "private/runtime.json").read_text(encoding="utf-8"))
    require(all(receipt.get(key) == state.get(key) for key in ("api", "database", "dbPort", "tokenSecret", "serviceToken", "catalogSha256")),
            "Runtime receipt differs from owner state")
    from build_canonical_catalog import verify_build
    build = verify_build(output/'private/candidate.jar',output/'build-manifest.json')
    require(build['jarSha256'] == state['jarSha256'] and build['sourceAfter'] == state['sourceFingerprint'],
            'Runtime package differs from the bound build receipt')
    db.ping(reconnect=False)
    with db.cursor() as cursor:
        cursor.execute("SELECT DATABASE(), @@port, @@datadir")
        database, port, directory = cursor.fetchone()
    require(database == state["database"] and port == state["dbPort"]
            and Path(directory).resolve().is_relative_to(output / "private"), "Database ownership differs")
    path = Path(state["catalogPath"])
    require(hashlib.sha256(path.read_bytes()).hexdigest() == state["catalogSha256"], "Pinned catalog changed")
    bundle = json.loads(path.read_text(encoding="utf-8-sig"))
    require(bundle.get("catalogContractVersion") == 4 and bundle.get("quantityPolicy") == QUANTITY_POLICY
            and len(bundle["recipes"]) == 5407 and len(bundle["ingredients"]) == 1779,
            "The approved v4 release is required")
    require(all("scaling" not in recipe and recipe["calculatedNutrition"].get("perServing") is None
                and all("scaleRule" not in line for line in recipe["ingredients"]) for recipe in bundle["recipes"]),
            "Only fixed recipes without default per-person nutrition are allowed")
    # Read only this owned runtime property; never print or persist its other configuration.
    lines = [line.split("=", 1)[1] for line in (output / "private/application.properties").read_text(encoding="utf-8").splitlines()
             if line.startswith("public-catalog.allowed-dish-ids=")]
    require(len(lines) == 1 and re.fullmatch(r"[0-9]+(?:,[0-9]+)*", lines[0]), "Explicit public allowlist property required")
    allowed = [int(value) for value in lines[0].split(",")]
    require(state.get("publicCatalogAllowedIds") in (None, allowed), "Public allowlist differs from runtime state")
    require(isinstance(allowed, list) and 1 <= len(allowed) <= 500 and len(set(allowed)) == len(allowed)
            and set(allowed).issubset({recipe["id"] for recipe in bundle["recipes"]}), "Explicit bounded public allowlist required")
    state["publicCatalogAllowedIds"] = allowed
    return bundle


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise AssertionError("Acceptance API must never redirect")


class Checks:
    def __init__(self, state, bundle, output):
        self.state, self.bundle, self.output = state, bundle, Path(output)
        self.recipes = {item["id"]: item for item in bundle["recipes"]}
        self.ingredients = {item["id"]: item for item in bundle["ingredients"]}
        self.revision = bundle["catalogRevision"]
        self.count, self.lock = 0, threading.Lock()

    def http(self, path, body=None, method=None, user=910001, allowed=(200, 201, 202, 204)):
        require(path.startswith("/") and not path.startswith("//"), "Relative API path required")
        headers = {"Content-Type": "application/json"}
        if user is not None:
            headers["Authorization"] = "Bearer " + bearer(self.state, user)
        request = urllib.request.Request(self.state["api"] + path, data=None if body is None else json.dumps(body).encode(),
                                         headers=headers, method=method)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            with opener.open(request, timeout=40) as response:
                status, raw = response.status, response.read(4_000_001)
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read(4_000_001)
        with self.lock:
            self.count += 1
        require(len(raw) <= 4_000_000, "Unexpectedly large API response")
        require(status in allowed, "HTTP " + str(status) + " for " + path)
        return json.loads(raw) if raw else None

    def all_details(self):
        completed = 0
        progress = self.output / "catalog-detail-progress.json"
        def checkpoint():
            progress.write_text(json.dumps({"catalogRevision": self.revision, "verifiedRecipes": completed,
                                            "expectedRecipes": len(self.recipes), "completed": completed == len(self.recipes)}), encoding="utf-8")
        checkpoint()
        def one(recipe):
            detail = self.http("/dishes/" + str(recipe["id"]))
            check_detail(recipe, detail, self.revision)
            for diners in (1, 2, 8):
                shared = self.http("/dishes/" + str(recipe["id"]) + "/scale?servings=" + str(diners))
                check_fixed_calculation(recipe, shared, diners, detail["scaledRecipe"])
            return recipe["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for _ in pool.map(one, self.bundle["recipes"]):
                completed += 1
                if completed % 500 == 0:
                    checkpoint()
                    print("Canonical HTTP details validated: " + str(completed) + "/5407", flush=True)
        checkpoint()
        return {"recipes": completed, "defaultNutritionCompared": completed, "defaultQuantitiesCompared": completed,
                "sharingRequests": completed * 3, "dinersChecked": [1, 2, 8],
                "completeNutrition": sum(r["calculatedNutrition"]["total"] is not None for r in self.recipes.values()),
                "unknownBaseServings": sum(r["baseServings"] is None for r in self.recipes.values())}

    def pages(self, namespace="/public/catalog/dishes", query=None):
        ids, page, total = [], 1, None
        while True:
            parameters = {"page": page, "pageSize": 100, **(query or {})}
            result = self.http(namespace + "?" + urllib.parse.urlencode(parameters), user=None if namespace.startswith("/public") else 910001)
            require(isinstance(result.get("list"), list) and len(result["list"]) <= 100, "Unbounded catalog page")
            require(total is None or total == result["total"], "Catalog total changed during pagination")
            total = result["total"]
            require(result["list"] or len(ids) == total, "Catalog page omitted remaining results")
            for row in result["list"]:
                require(row["id"] not in ids, "Catalog pagination repeated an ID")
                ids.append(row["id"])
                if namespace.startswith("/public"):
                    check_detail(self.recipes[row["id"]], row, self.revision)
            if len(ids) >= total:
                break
            page += 1
            require(page <= 100, "Catalog pagination did not converge")
        require(len(ids) == total, "Catalog pagination total mismatch")
        return ids

    def scaling(self):
        # Full-catalog sharing invariance is covered by all_details; this stage changes the recipe itself.
        choices = [(r, line) for r in self.recipes.values() if r["calculatedNutrition"]["total"] is not None and r["id"] in self.state["publicCatalogAllowedIds"]
                   for line in r["ingredients"] if line["optional"] and line["defaultEnabled"]
                   and line["quantity"] is not None and self.ingredients[line["ingredientId"]].get("nutritionPer100g")
                  ]
        require(choices, "No independently calculable optional fixture")
        optional_recipe, line = choices[0]
        disabled = self.http("/dishes/" + str(optional_recipe["id"]) + "/scale", {"servings": None, "optionalOverrides": {line["id"]: False}})
        selected = next(item for item in disabled["ingredients"] if item["lineId"] == line["id"])
        require(selected["enabled"] is False and selected["quantity"] == 0, "Optional toggle did not apply")
        definition = self.ingredients[line["ingredientId"]]
        for nutrient in NUTRIENTS:
            contribution = Decimal(str(line["quantity"])) * Decimal(str(definition["gramsPerUnit"])) * Decimal(str(definition["nutritionPer100g"][nutrient])) / 100
            contribution *= Decimal(str(line.get("nutrientRetention", {}).get(nutrient, 1)))
            expected = Decimal(str(optional_recipe["calculatedNutrition"]["total"][nutrient])) - contribution
            numeric_equal(disabled["nutrition"]["total"][nutrient], expected, "Optional nutrition recalculation")
        public = self.http("/public/catalog/dishes/" + str(optional_recipe["id"]) + "/scale",
                           {"servings": None, "optionalOverrides": {line["id"]: False}}, user=None)
        require(public["ingredients"] == disabled["ingredients"] and public["nutrition"] == disabled["nutrition"], "Public scale diverged")
        shared = self.http("/dishes/" + str(optional_recipe["id"]) + "/scale",
                           {"servings": 8, "optionalOverrides": {line["id"]: False}})
        require(shared["ingredients"] == disabled["ingredients"] and shared["steps"] == disabled["steps"], "Sharing changed optional recipe")
        for nutrient in NUTRIENTS:
            numeric_equal(shared["nutrition"]["total"][nutrient], disabled["nutrition"]["total"][nutrient], "Optional fixed total")
            numeric_equal(shared["nutrition"]["perServing"][nutrient], Decimal(str(disabled["nutrition"]["total"][nutrient])) / 8, "Optional equal share reference")
        require(disabled["nutrition"]["perServing"] is None, "Optional recipe inferred default people")
        return {"optionalRecipe": optional_recipe["id"], "optionalNutritionRecomputed": True, "optionalSharingDiners": 8}

    def filters(self):
        options = self.http("/recommend/options")
        codes = {item["code"] for group in options["groups"].values() for item in group if item.get("code")}
        codes.update(item["code"] for item in options.get("constraintOptions", []) if item.get("code"))
        require("DIET_VEGAN" in codes and "ALLERGEN_SOY" in codes, "Canonical recommendation options missing")
        vegan = self.pages("/dishes", {"tagCodes": "DIET_VEGAN"})
        no_soy = self.pages("/dishes", {"excludeTagCodes": "ALLERGEN_SOY"})
        quick = self.pages("/dishes", {"maxCookMinutes": 15})
        for identifier in vegan:
            require("DIET_VEGAN" in (self.recipes[identifier]["dietaryCodes"] or []), "Unknown/non-vegan recipe passed strict diet")
        for identifier in no_soy:
            facts = self.recipes[identifier]["allergenCodes"]
            require(facts is not None and "ALLERGEN_SOY" not in facts, "Unknown/soy recipe passed explicit exclusion")
        for identifier in quick:
            minutes = self.recipes[identifier]["timing"]["totalMinutes"]
            require(minutes is not None and minutes <= 15, "Unknown duration passed time limit")
        require(vegan and no_soy and quick, "Valid strict candidates disappeared")
        return {"veganCandidates": len(vegan), "knownSoyFreeCandidates": len(no_soy), "knownQuickCandidates": len(quick)}

    def workspace(self):
        # Distinct past slot makes actual-eaten validation legal without sharing another run's records.
        day = str(date.today() - timedelta(days=1000 + int(uid().replace("-", "")[:8], 16) % 5000))
        context = {"date": day, "mealType": "dinner", "people": 2, "compositionMode": "manual",
                   "counts": {"meat": 1, "veg": 1, "soup": 1, "staple": 0, "dessert": 0},
                   "requirements": "", "ownedIngredients": [], "recommendationPolicy": "balanced-v1"}
        workspace = self.http("/meal-workspaces", {"requestId": uid(), "expectedWorkspaceRevision": 0, "context": context})
        def read():
            value = self.http("/meal-workspaces/current?" + urllib.parse.urlencode({"date": day, "mealType": "dinner"}))
            return value.get("workspace", value)
        def command(name, dish_id=None):
            nonlocal workspace
            body = {"requestId": uid(), "expectedWorkspaceRevision": workspace["revision"], "planVersion": workspace["draft"]["planVersion"], "command": name}
            if dish_id is not None:
                body["dishId"] = dish_id
            workspace = self.http("/meal-workspaces/" + workspace["id"] + "/commands", body)
            deadline = time.monotonic() + 45
            while workspace["status"] == "generating" and time.monotonic() < deadline:
                time.sleep(.1)
                workspace = read()
            require(workspace["status"] == "draft" and len(workspace["draft"]["dishes"]) == 3, "Shared menu generation did not complete")
            for dish in workspace["draft"]["dishes"]:
                check_detail(self.recipes[dish["id"]], dish, self.revision)
                require(dish["recipe"]["servingRole"] == "dish" and "MEAL_DINNER" in dish["recipe"]["mealCodes"], "Condiment or wrong meal occupied automatic slot")
            return [dish["id"] for dish in workspace["draft"]["dishes"]]
        first = command("generate")
        second = command("replace", first[0])
        require(first[0] not in second and set(first[1:]).issubset(second), "Single replacement changed unrelated dishes")
        third = command("regenerate")
        require(set(third).isdisjoint(second), "Continuous generation repeated available dishes")
        require({self.recipes[value]["dishGroupId"] for value in third}.isdisjoint(
                {self.recipes[value]["dishGroupId"] for value in second}), "Continuous generation repeated an available dish group")
        require(workspace.get("recommendationCycle"), "Persistent recommendation cycle is missing")
        before_dishes = copy.deepcopy(workspace["draft"]["dishes"])
        sharing_context = copy.deepcopy(workspace["context"])
        sharing_context["people"] = 8
        workspace = self.http("/meal-workspaces/" + workspace["id"] + "/context",
                              {"requestId": uid(), "expectedWorkspaceRevision": workspace["revision"], "context": sharing_context}, method="PATCH")
        require(workspace["status"] == "draft" and workspace["context"]["people"] == 8
                and workspace["draft"]["dishes"] == before_dishes,
                "Home diner-only adjustment changed the fixed menu or required regeneration")
        favorite = third[0]
        require(self.http("/favorite-dishes", {"dishId": favorite})["success"], "Favorite write failed")
        require(self.http("/favorite-dishes/check?dishId=" + str(favorite))["isFavorite"], "Favorite read failed")
        require(not self.http("/favorite-dishes/check?dishId=" + str(favorite), user=910002)["isFavorite"], "Favorite escaped ownership")
        confirm_body = {"requestId": uid(), "expectedWorkspaceRevision": workspace["revision"], "planVersion": workspace["draft"]["planVersion"], "expectedPlanRevision": 0}
        workspace = self.http("/meal-workspaces/" + workspace["id"] + "/confirm", confirm_body)
        repeated = self.http("/meal-workspaces/" + workspace["id"] + "/confirm", confirm_body)
        require(repeated["confirmation"] == workspace["confirmation"], "Plan replay changed receipt")
        overview = self.http("/recipe-records/overview?startDate=" + day + "&endDate=" + day)
        require(len(overview["plans"]) == 1 and not overview["consumptions"], "Saving a plan invented actual consumption")
        planned = overview["plans"][0]
        require(set(planned["dishIds"]) == set(third), "Calendar lost selected canonical IDs")
        actual_body = {"requestId": uid(), "expectedRevision": 0, "expectedPlanRevision": planned["revision"], "status": "eaten", "usePlan": True}
        actual = self.http("/meal-consumptions/" + day + "/dinner", actual_body, method="PUT")
        require(actual["status"] == "eaten" and len(actual["actualDishes"]) == 3, "Actual meal did not preserve the plan snapshot")
        for entry in actual["actualDishes"]:
            expected = self.recipes[int(entry["dishId"])]["calculatedNutrition"]
            snapshot = entry["nutritionSnapshot"]
            require(snapshot.get("catalogRevision") == self.revision, "Actual nutrition lost canonical release")
            nutrition_equal({**snapshot, "perServing": None}, expected, "Actual fixed recipe snapshot")
        require(self.http("/meal-consumptions/" + day + "/dinner", actual_body, method="PUT")["revision"] == actual["revision"], "Actual meal replay duplicated revision")
        review = self.http("/diet-reviews?startDate=" + day + "&endDate=" + day)
        nutrition = review["blocks"]["actualDetails"]["nutrition"]
        check_nutrition_summary([self.recipes[identifier] for identifier in third], nutrition)
        expected_covered = sum(self.recipes[identifier]["calculatedNutrition"]["total"] is not None for identifier in third)
        other = self.http("/recipe-records/overview?startDate=" + day + "&endDate=" + day, user=910002)
        require(not other["plans"] and not other["consumptions"], "Calendar/actual records escaped ownership")
        return {"generation": first, "singleReplacement": second, "nextRound": third, "planAndActualReplay": True,
                "homePeopleChange": {"from": 2, "to": 8, "fixedMenu": True},
                "favoriteOwnership": True, "actualNutritionCovered": expected_covered,
                "favoriteWeightNeutralityEvidence": "requires separate deterministic policy regression"}

    def shopping(self):
        recipe = next(r for r in self.recipes.values() if r["baseServings"] is not None
                      and any(line["quantity"] is None and line["defaultEnabled"] for line in r["ingredients"]))
        before = self.http("/shopping-list")
        preview = self.http("/shopping-list/preview", {"dishIds": [recipe["id"]], "targetPeople": recipe["baseServings"], "clientRequestId": uid()})
        groups = preview["dishes"]
        require(len(groups) == 1, "Shopping preview lost recipe")
        discretionary = [item for item in groups[0]["items"] if item["quantityKind"] == "DISCRETIONARY"]
        require(discretionary and all(item.get("quantityValue") is None and item.get("quantityText") in (None, "") for item in discretionary), "Shopping guessed unknown quantities")
        body = {"requestId": uid(), "previewId": preview["previewId"], "targetPeople": recipe["baseServings"],
                "expectedListVersion": before["version"], "dishes": [{key: group[key] for key in ("selectionKey", "targetPeople", "items")} for group in groups]}
        saved = self.http("/shopping-list/items:batch-add", body)
        replay = self.http("/shopping-list/items:batch-add", body)
        require(replay["list"]["version"] == saved["list"]["version"], "Shopping replay duplicated items")
        rows = [item for group in saved["list"]["dishes"] if group["dishId"] == recipe["id"] for item in group["items"]]
        require(rows and any(item.get("quantityValue") is None for item in rows), "Persisted shopping list lost null quantities")
        unknown = next(r for r in self.recipes.values() if r["baseServings"] is None)
        original = self.http("/shopping-list/preview", {"dishIds": [unknown["id"]], "targetPeople": None, "clientRequestId": uid()})
        require(original["dishes"][0]["targetPeople"] is None, "Fixed-recipe shopping fabricated people")
        def quantities(items):
            return [{key: item.get(key) for key in ("canonicalName", "normalizedVariant", "quantityValue", "quantityText", "quantityKind", "unitCode", "sourceQuantityText")}
                    for item in items]
        for diners in (1, 2, 8):
            shared = self.http("/shopping-list/preview", {"dishIds": [unknown["id"]], "targetPeople": diners, "clientRequestId": uid()})
            require(quantities(shared["dishes"][0]["items"]) == quantities(original["dishes"][0]["items"]), "Diners changed shopping quantities")
        require(not self.http("/shopping-list", user=910002)["dishes"], "Shopping list escaped ownership")
        return {"recipeId": recipe["id"], "discretionaryLines": len(discretionary), "unknownBaseRecipe": unknown["id"], "fixedQuantityDiners": [1, 2, 8], "idempotent": True}


def diagnose_remaining(state, db, output):
    """Explicit preliminary-only independent diagnostics after full-read evidence."""
    marker = Path(output) / "preliminary.json"
    require(marker.exists() and json.loads(marker.read_text(encoding="utf-8")) == {"enabled": True},
            "Independent diagnostics require explicit preliminary marker")
    state = dict(state)
    bundle = validate_owned(state, db, output)
    checks = Checks(state, bundle, output)
    from maturity_runtime import backend_fingerprint
    from canonical_assistant_acceptance import run as assistant
    report = {"passed": False, "preliminary": True, "finalAcceptance": False,
              "catalogRevision": bundle["catalogRevision"], "catalogSha256": state["catalogSha256"],
              "jarSha256": state["jarSha256"], "sourceFingerprint": state["sourceFingerprint"],
              "currentSourceFingerprint": backend_fingerprint(), "pythonSourceFingerprint": python_fingerprint(),
              "allRecipeReadsRepeated": False, "productionTouched": False, "externalProviderRequests": 0, "stages": {}}
    destination = Path(output) / "preliminary-stage-diagnostics.json"
    for name, action in (("strictFilters", checks.filters), ("sharedWorkspaceCalendarActual", checks.workspace),
                         ("shopping", checks.shopping), ("javaFastApiMockProvider", lambda: assistant(state, db, Path(output) / "assistant-acceptance"))):
        started = time.monotonic()
        try:
            result = {"passed": True, "result": action()}
        except Exception as error:
            result = {"passed": False, "error": type(error).__name__, "message": str(error)}
        result["elapsedSeconds"] = round(time.monotonic() - started, 2)
        report["stages"][name] = result
        report["httpRequests"] = checks.count
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Preliminary diagnostic " + name + ": " + ("passed" if result["passed"] else "failed"), flush=True)
    report["completed"] = True
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def run(state, db, output):
    state = dict(state)
    bundle = validate_owned(state, db, output)
    from maturity_runtime import backend_fingerprint
    marker = Path(output) / "preliminary.json"
    preliminary = marker.exists() and json.loads(marker.read_text(encoding="utf-8")) == {"enabled": True}
    if not preliminary:
        require(backend_fingerprint() == state["sourceFingerprint"], "Java source changed after owned runtime startup")
    checks = Checks(state, bundle, output)
    report = {"passed": False, "preliminary": preliminary, "finalAcceptance": False,
              "catalogRevision": bundle["catalogRevision"], "catalogSha256": state["catalogSha256"],
              "sourceFingerprint": state["sourceFingerprint"], "jarSha256": state["jarSha256"], "productionTouched": False,
              "externalProviderRequests": 0, "nativeDeviceVerified": False, "pythonSourceFingerprint": python_fingerprint(),
              "currentSourceFingerprintAtStart": backend_fingerprint(),
              "acceptanceScriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "stages": {}}
    destination = Path(output) / "canonical-acceptance-progress.json"
    def stage(name, action):
        started = time.monotonic()
        result = action()
        report["stages"][name] = {"passed": True, "elapsedSeconds": round(time.monotonic() - started, 2), "result": result}
        report["httpRequests"] = checks.count
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Canonical acceptance stage passed: " + name, flush=True)
        return result
    try:
        # Exercise the changed assistant boundary first, before the long catalog sweep.
        from canonical_assistant_acceptance import run as assistant
        stage("javaFastApiMockProvider", lambda: assistant(state, db, Path(output) / "assistant-acceptance"))
        stage("allPrivateDetails", checks.all_details)
        def public_pages():
            ids = checks.pages()
            require(set(ids) == set(state["publicCatalogAllowedIds"]), "Public directory differs from explicit release allowlist")
            outside = next(identifier for identifier in checks.recipes if identifier not in ids)
            checks.http("/public/catalog/dishes/" + str(outside), user=None, allowed=(404,))
            return {"recipes": len(ids), "pageSize": 100, "excludedRecipeRejected": outside}
        stage("allPublicPages", public_pages)
        stage("fixedRecipeAndOptional", checks.scaling)
        stage("strictFilters", checks.filters)
        stage("sharedWorkspaceCalendarActual", checks.workspace)
        stage("shopping", checks.shopping)
        if not preliminary:
            require(backend_fingerprint() == state["sourceFingerprint"] and python_fingerprint() == report["pythonSourceFingerprint"],
                    "Application source changed during acceptance; rerun against the final build")
        report["completed"] = True
        report["passed"] = report["finalAcceptance"] = not preliminary
        return report
    except Exception as error:
        report["failure"] = {"class": type(error).__name__, "message": str(error)}
        raise
    finally:
        report["httpRequests"] = checks.count
        report["currentSourceFingerprintAtEnd"] = backend_fingerprint()
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    import argparse
    import pymysql
    from canonical_catalog_import import assert_owned_target
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True)
    args = parser.parse_args()
    output = Path(args.runtime).resolve()
    state = json.loads((output/'private/runtime.json').read_text('utf-8'))
    require(state.get('purpose') == 'canonical-catalog-isolated' and state.get('providerMode') == 'mock', 'Owned isolated runtime required')
    assert_owned_target('127.0.0.1',state['database'])
    db = pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'],
                         database=state['database'],charset='utf8mb4',autocommit=True,connect_timeout=5)
    try:
        report = run(state,db,output)
        (output/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'passed':report['passed'],'httpRequests':report['httpRequests']}),flush=True)
    finally:
        db.close()


if __name__ == '__main__':
    main()
