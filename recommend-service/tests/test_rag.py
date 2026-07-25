import rag


def setup_function():
    rag._dish_meta = []
    rag._ingredient_map = {}


def test_parse_ingredients_handles_delimiters_and_amounts():
    parsed = rag.parse_ingredients("鸡蛋：2个#番茄：200克#盐：少许")
    assert "鸡蛋" in parsed
    assert "番茄" in parsed
    assert "盐" in parsed


def test_search_by_ingredients_supports_exact_and_fuzzy_match():
    rag._dish_meta = [
        {"id": 1, "name": "番茄炒蛋"},
        {"id": 2, "name": "土豆丝"},
    ]
    rag._ingredient_map = {"番茄": [1], "土豆": [2]}

    assert [d["id"] for d in rag.search_by_ingredients(["番茄"])] == [1]
    assert [d["id"] for d in rag.search_by_ingredients(["小土豆"])] == [2]


def test_semantic_search_ranks_matching_documents():
    rag._dish_meta = [
        {"id": 1, "name": "清蒸鱼", "doc": "清淡清蒸鱼"},
        {"id": 2, "name": "红烧肉", "doc": "浓郁红烧"},
    ]

    result = rag.search_semantic("清蒸鱼", top_k=1)
    assert result[0]["id"] == 1


def test_make_doc_normalizes_whitespace_and_list_tags():
    value = rag._make_doc({"name": "番茄 炒蛋", "cl": "番茄\n鸡蛋", "tags": ["家常"]})
    assert " " not in value
    assert "\n" not in value
    assert "家常" in value
