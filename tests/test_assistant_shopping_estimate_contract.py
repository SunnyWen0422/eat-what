"""Strict shopping-price transport checks; no environment, database or provider access."""
import copy
import json
from pathlib import Path
import sys
import unittest

SERVICE = Path(__file__).resolve().parents[1] / "recommend-service"
sys.path.insert(0, str(SERVICE))
from assistant_v4_schema import StepValidationError, read_result, tool_call
sys.path.remove(str(SERVICE))


def estimate(covered=1, missing=1, subtotal=360, available=True):
    complete = covered > 0 and missing == 0
    return {"scope": "pending_source_items", "coveredCount": covered,
            "missingCount": missing, "totalCount": covered + missing,
            "knownSubtotalCents": subtotal, "totalCents": subtotal if complete else None,
            "complete": complete, "serviceAvailable": available,
            "quoteDates": ["2026-10-28"] if covered else [],
            "sources": [{"quoteDate": "2026-10-28", "sourceUrl": None,
                         "sourceLabel": "合成官方来源"}] if covered else [],
            "sourcesTruncated": False}


def shopping_read(price=None):
    value = {"callId": "shopping", "name": "read_shopping", "items": [],
             "nextCursor": None, "truncated": False, "sourceVersion": "12", "unknownFields": []}
    if price is not None:
        value["priceEstimate"] = price
    return value


def validate_java_reads(reads):
    """Shared with the Java -> Python -> Java serializer boundary process."""
    for value in reads:
        read_result(value)
        assert json.loads(json.dumps(value, ensure_ascii=False)) == value


class AssistantShoppingEstimateContractTest(unittest.TestCase):
    def test_legacy_complete_partial_zero_unknown_and_unavailable_envelopes(self):
        reads = [shopping_read(), shopping_read(estimate()), shopping_read(estimate(2, 0, 720)),
                 shopping_read(estimate(1, 0, 0)), shopping_read(estimate(0, 2, None)),
                 shopping_read(estimate(0, 2, None, False)), shopping_read(estimate(0, 0, None))]
        validate_java_reads(reads)

    def test_include_prices_accepts_only_real_booleans(self):
        for arguments in ({}, {"includePrices": True}, {"includePrices": False}):
            call = {"id": "price", "type": "function", "function": {
                "name": "read_shopping", "arguments": json.dumps(arguments)}}
            tool_call(call, {"read_shopping"})
        for invalid in (None, 0, 1, "true", [], {}):
            call = {"id": "price", "type": "function", "function": {
                "name": "read_shopping", "arguments": json.dumps({"includePrices": invalid})}}
            with self.subTest(invalid=invalid), self.assertRaises(StepValidationError):
                tool_call(call, {"read_shopping"})

    def test_count_completeness_and_total_fields_must_agree(self):
        changes = [{"totalCount": 99}, {"complete": True}, {"totalCents": 360},
                   {"knownSubtotalCents": None}, {"serviceAvailable": False}]
        for patch in changes:
            bad = shopping_read(estimate()); bad["priceEstimate"].update(patch)
            with self.subTest(patch=patch), self.assertRaises(StepValidationError):
                read_result(bad)
        for patch in ({"knownSubtotalCents": 0}, {"totalCents": 0}, {"complete": True}):
            bad = shopping_read(estimate(0, 2, None)); bad["priceEstimate"].update(patch)
            with self.subTest(patch=patch), self.assertRaises(StepValidationError):
                read_result(bad)
        bad = shopping_read(estimate(2, 0, 720)); bad["priceEstimate"]["totalCents"] = 719
        with self.assertRaises(StepValidationError): read_result(bad)

    def test_strict_types_unknown_fields_dates_and_safe_integer_limit(self):
        for patch in ({"coveredCount": True}, {"complete": 1}, {"serviceAvailable": "true"},
                      {"knownSubtotalCents": -1}, {"knownSubtotalCents": 9007199254740992},
                      {"knownSubtotalCents": 3.6}, {"scope": "actual_expenses"},
                      {"quoteDates": ["2026-02-30"]}, {"untrusted": "paid"}):
            bad = shopping_read(estimate()); bad["priceEstimate"].update(patch)
            with self.subTest(patch=patch), self.assertRaises(StepValidationError):
                read_result(bad)
        for bad in (None, False, [], "paid"):
            value = shopping_read(); value["priceEstimate"] = bad
            with self.subTest(bad=bad), self.assertRaises(StepValidationError): read_result(value)
        value = shopping_read(estimate()); value["priceEstimate"]["sources"][0]["sourceUrl"] = "x" * 2001
        with self.assertRaises(StepValidationError): read_result(value)

    def test_estimate_cannot_be_attached_to_a_different_read(self):
        value = shopping_read(estimate()); value["name"] = "read_current_meal"
        with self.assertRaises(StepValidationError): read_result(value)

    def test_material_paging_does_not_change_whole_pending_estimate_contract(self):
        value = shopping_read(estimate(35, 0, 12600)); value["truncated"] = True; value["nextCursor"] = "1"
        value["items"] = [{"id": 1, "name": "盐", "quantityText": "适量", "userOverride": False,
                           "quantityProvenance": "unknown", "quantityValue": None, "checked": False}]
        validate_java_reads([value])
        bad = copy.deepcopy(value); bad["items"][0]["quantityValue"] = 1
        with self.assertRaises(StepValidationError): read_result(bad)


if __name__ == "__main__": unittest.main()
