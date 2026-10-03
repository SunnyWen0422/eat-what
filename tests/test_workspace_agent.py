import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("workspace_agent", ROOT / "recommend-service/workspace_agent.py")

class WorkspaceAgentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.agent = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.agent)

    def test_internal_token_must_be_configured_and_exact(self):
        self.assertFalse(self.agent.authorized("", ""))
        self.assertFalse(self.agent.authorized("other", "configured-secret"))
        self.assertTrue(self.agent.authorized("configured-secret", "configured-secret"))

    def test_different_target_requires_switch_and_never_returns_dishes(self):
        result = self.agent.validate_result({"needsInput": False, "constraintsUnderstood": True, "date": "2026-10-04", "mealType": "dinner", "dishIds": [1]}, {"date": "2026-10-03", "mealType": "lunch"}, {1})
        self.assertTrue(result["needsInput"])
        self.assertEqual([], result["dishIds"])

    def test_fabricated_id_and_unresolved_constraints_are_rejected(self):
        base = {"needsInput": False, "constraintsUnderstood": True, "date": "2026-10-03", "mealType": "lunch", "dishIds": [99]}
        with self.assertRaises(ValueError): self.agent.validate_result(base, base, {1})
        base["dishIds"] = [1]; base["constraintsUnderstood"] = False
        self.assertTrue(self.agent.validate_result(base, base, {1})["needsInput"])

if __name__ == "__main__": unittest.main()
