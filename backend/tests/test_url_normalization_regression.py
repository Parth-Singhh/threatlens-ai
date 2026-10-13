from urllib.parse import urlsplit

import math
import pytest

from app.services.url_features import (
    NORMALIZATION_VERSION,
    URL_FEATURE_NAMES,
    canonical_model_url_key,
    extract_url_features,
    normalize_url,
)


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("https://www.google.com/", "https://www.google.com"),
        ("https://www.wikipedia.org/", "https://www.wikipedia.org"),
        ("https://example.com/", "https://example.com"),
        ("https://www.google.com/?q=test", "https://www.google.com?q=test"),
        ("https://example.com/#section", "https://example.com#section"),
    ],
)
def test_empty_root_path_and_slash_are_canonicalized(first: str, second: str) -> None:
    assert normalize_url(first) == normalize_url(second)
    assert extract_url_features(first) == extract_url_features(second)


@pytest.mark.parametrize(
    "variants",
    [
        ["https://www.google.com", "https://www.google.com/", "http://google.com", "https://google.com/"],
        ["https://www.wikipedia.org", "http://wikipedia.org/", "https://wikipedia.org"],
        ["https://example.com", "https://example.com/", "https://www.example.com/"],
        ["https://www.bbc.co.uk", "http://bbc.co.uk/", "https://bbc.co.uk/"],
    ],
)
def test_scheme_www_and_root_slash_do_not_change_model_features(variants: list[str]) -> None:
    rows = [extract_url_features(url) for url in variants]
    assert all(row == rows[0] for row in rows[1:])


def test_non_root_paths_are_preserved_and_affect_features() -> None:
    assert normalize_url("https://example.com/login/") == "https://example.com/login/"
    assert normalize_url("https://example.com/login") == "https://example.com/login"
    assert extract_url_features("https://example.com/login/") != extract_url_features("https://example.com/login")


def test_normalization_is_idempotent() -> None:
    normalized = normalize_url("HTTPS://WWW.Example.com/?next=%2Flogin#top")
    assert normalize_url(normalized) == normalized


def test_host_parser_does_not_trust_brand_text_in_subdomain() -> None:
    assert urlsplit(normalize_url("https://google.com.example.org")).hostname == "google.com.example.org"


def test_userinfo_syntax_parses_actual_host_and_keeps_at_feature() -> None:
    value = "https://google.com@evil.example"
    assert urlsplit(normalize_url(value)).hostname == "evil.example"
    features = dict(zip(URL_FEATURE_NAMES, extract_url_features(value)))
    assert features["at_symbol_count"] == 1.0


def test_query_text_does_not_change_hostname() -> None:
    parsed = urlsplit(normalize_url("https://example.org/login?next=https://other.example"))
    assert parsed.hostname == "example.org"
    assert parsed.path == "/login"
    assert parsed.query == "next=https://other.example"


def test_public_suffix_aware_subdomain_count() -> None:
    features = dict(zip(URL_FEATURE_NAMES, extract_url_features("https://login.accounts.example.co.uk/path")))
    assert features["subdomain_count"] == 2.0
    assert features["tld_length"] == float(len("co.uk"))
    # www is ignored as a format marker, but substantive subdomains remain.
    features_www = dict(zip(URL_FEATURE_NAMES, extract_url_features("https://www.login.accounts.example.co.uk/path")))
    assert features_www["subdomain_count"] == 2.0


def test_features_have_expected_v3_schema_and_finite_values() -> None:
    assert NORMALIZATION_VERSION == "scheme-www-neutral-psl-v3"
    features = extract_url_features("https://example.org/login?next=%2Fhome")
    assert len(features) == len(URL_FEATURE_NAMES) == 28
    assert all(math.isfinite(value) for value in features)
    assert "is_https" not in URL_FEATURE_NAMES
    assert "is_http" not in URL_FEATURE_NAMES
    assert "has_www_prefix" not in URL_FEATURE_NAMES


@pytest.mark.parametrize(
    "value",
    [
        "", "   ", "https:///path", "bad url .com", "ftp://example.com/file",
        "javascript:alert(1)", "https:\\example.com", "https://example.com:99999/",
    ],
)
def test_invalid_or_unsupported_url_is_rejected(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_url(value)


@pytest.mark.parametrize(
    "variants",
    [
        ["https://www.google.com", "https://google.com/", "http://google.com"],
        ["https://www.wikipedia.org/wiki/URL", "http://wikipedia.org/wiki/URL"],
    ],
)
def test_canonical_model_key_collapses_feature_neutral_variants(variants: list[str]) -> None:
    keys = [canonical_model_url_key(value) for value in variants]
    assert all(key == keys[0] for key in keys)
    rows = [extract_url_features(value) for value in variants]
    assert all(row == rows[0] for row in rows)


def test_canonical_model_key_keeps_distinct_paths_and_queries() -> None:
    assert canonical_model_url_key("https://example.com/login") != canonical_model_url_key("https://example.com/account")
    assert canonical_model_url_key("https://example.com/search?q=one") != canonical_model_url_key("https://example.com/search?q=two")
