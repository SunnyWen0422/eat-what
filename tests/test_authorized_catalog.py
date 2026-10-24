import sys
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "recommend-service"))
from canonical_catalog_fixture import canonical_row
from authorized_catalog import execute_read_tool


class AuthorizedCatalogTest(unittest.TestCase):
    def context(self):
        return {"ownerUserId": 7, "catalog": [
            canonical_row(1, "本人私房鱼", ("鱼", "姜"), "CAT_MEAT_AQUATIC", ("LIGHT",)),
            canonical_row(2, "青菜", ("青菜",), codes=("HOME_STYLE",))]}

    def test_foreign_scope_and_unlisted_dish_are_rejected(self):
        for owner, ids in ((8, [1]), (7, [9])):
            with self.assertRaises(ValueError):
                execute_read_tool(self.context(), owner, "get_dish_details", {"dish_ids": ids})

    def test_private_recipe_only_in_authorized_task(self):
        self.assertEqual([1], [row["id"] for row in execute_read_tool(self.context(), 7, "search_dishes", {"query": "私房"})])
        self.assertEqual([2], [row["id"] for row in execute_read_tool(self.context(), 7, "search_by_ingredients", {"ingredients": ["青菜"]})])

    def test_unknown_filters_and_writes_rejected(self):
        for name, args in (("search_dishes", {"filters": {"invented": True}}), ("create_calendar_records", {})):
            with self.assertRaises(ValueError):
                execute_read_tool(self.context(), 7, name, args)

    def test_tags_or_and_exclusions(self):
        filters = {"include_tag_codes": ["LIGHT", "HOME_STYLE"]}
        self.assertEqual([1, 2], [row["id"] for row in execute_read_tool(self.context(), 7, "search_dishes", {"filters": filters})])
        filters["exclude_tag_codes"] = ["HOME_STYLE"]
        self.assertEqual([1], [row["id"] for row in execute_read_tool(self.context(), 7, "search_dishes", {"filters": filters})])


if __name__ == "__main__":
    unittest.main()
