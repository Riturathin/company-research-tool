import pytest

from app.providers import ProviderError, parse_json_response


def test_parse_json_response_allows_fenced_json():
    parsed = parse_json_response('Here is the data:\n```json\n{"key_people": [{"name": "A", "title": "CEO"}]}\n```')
    assert parsed["key_people"][0]["title"] == "CEO"


def test_parse_json_response_allows_surrounding_text():
    parsed = parse_json_response('Result follows {"overview": "Useful briefing."} Thanks')
    assert parsed == {"overview": "Useful briefing."}


def test_parse_json_response_rejects_non_json():
    with pytest.raises(ProviderError):
        parse_json_response("I could not do that.")
