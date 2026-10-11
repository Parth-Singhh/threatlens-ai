"""Lightweight lexical feature extraction for URL-risk modelling.

These features inspect the supplied string only. No URL is fetched or opened.
"""

from __future__ import annotations

import ipaddress
import math
import re
from collections import Counter
from urllib.parse import parse_qsl, urlsplit

SUSPICIOUS_TERMS = (
    "login", "signin", "verify", "verification", "account", "secure",
    "update", "password", "confirm", "banking", "wallet", "payment",
    "billing", "auth", "recover", "suspended", "limited", "support",
)

SHORTENER_HOSTS = {
    "bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy",
    "ow.ly", "buff.ly", "shorturl.at", "rebrand.ly",
}

URL_FEATURE_NAMES = (
    "url_length", "host_length", "path_length", "query_length",
    "host_dot_count", "subdomain_count", "host_hyphen_count",
    "url_hyphen_count", "underscore_count", "at_symbol_count",
    "question_mark_count", "equals_count", "ampersand_count",
    "percent_count", "digit_count", "alphabetic_count", "digit_ratio",
    "special_character_ratio", "is_https", "is_http", "host_is_ip",
    "has_www_prefix", "has_port", "host_uses_punycode",
    "suspicious_term_count", "is_shortener", "path_depth",
    "query_parameter_count", "tld_length", "host_double_hyphen",
    "host_character_entropy",
)


def normalize_url(value: str) -> str:
    """Add a scheme if missing and reject values without a hostname."""
    raw = value.strip()
    if not raw:
        raise ValueError("Enter a URL to analyze.")
    if not re.match(r"^https?://", raw, flags=re.IGNORECASE):
        raw = "http://" + raw
    try:
        parsed = urlsplit(raw)
        host = parsed.hostname
        # Accessing .port also checks malformed port values.
        _ = parsed.port
    except ValueError as exc:
        raise ValueError("Enter a valid URL or domain name.") from exc
    if not host or any(ch.isspace() for ch in host):
        raise ValueError("Enter a valid URL or domain name.")
    return raw


def _entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = Counter(value.lower())
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def extract_url_features(value: str) -> list[float]:
    """Return stable numeric features used by both training and inference."""
    normalized = normalize_url(value)
    parsed = urlsplit(normalized)
    url_lower = normalized.lower()
    host = (parsed.hostname or "").lower().strip(".")
    host_parts = [part for part in host.split(".") if part]
    tld = host_parts[-1] if host_parts else ""
    digits = sum(character.isdigit() for character in normalized)
    alphabetic = sum(character.isalpha() for character in normalized)
    special = sum(not character.isalnum() for character in normalized)
    length = max(len(normalized), 1)

    try:
        ipaddress.ip_address(host.strip("[]"))
        host_is_ip = 1.0
    except ValueError:
        host_is_ip = 0.0

    try:
        has_port = 1.0 if parsed.port is not None else 0.0
    except ValueError:
        has_port = 1.0

    suspicious_term_count = float(sum(term in url_lower for term in SUSPICIOUS_TERMS))
    shortener = 1.0 if host in SHORTENER_HOSTS else 0.0
    path_segments = [segment for segment in parsed.path.split("/") if segment]
    try:
        query_parameter_count = float(len(parse_qsl(parsed.query, keep_blank_values=True)))
    except ValueError:
        query_parameter_count = 0.0

    features = [
        float(len(normalized)),
        float(len(host)),
        float(len(parsed.path)),
        float(len(parsed.query)),
        float(host.count(".")),
        float(max(len(host_parts) - 2, 0)),
        float(host.count("-")),
        float(normalized.count("-")),
        float(normalized.count("_")),
        float(normalized.count("@")),
        float(normalized.count("?")),
        float(normalized.count("=")),
        float(normalized.count("&")),
        float(normalized.count("%")),
        float(digits),
        float(alphabetic),
        float(digits / length),
        float(special / length),
        float(parsed.scheme.lower() == "https"),
        float(parsed.scheme.lower() == "http"),
        host_is_ip,
        float(host.startswith("www.")),
        has_port,
        float("xn--" in host),
        suspicious_term_count,
        shortener,
        float(len(path_segments)),
        query_parameter_count,
        float(len(tld)),
        float("--" in host),
        float(_entropy(host)),
    ]
    if len(features) != len(URL_FEATURE_NAMES):
        raise RuntimeError("URL feature count does not match the declared schema.")
    return features


def explain_url_signals(value: str) -> list[str]:
    """Return simple, human-readable URL characteristics, not model attribution."""
    normalized = normalize_url(value)
    parsed = urlsplit(normalized)
    host = (parsed.hostname or "").lower()
    signals: list[str] = []

    if len(normalized) >= 100:
        signals.append("The URL is unusually long (100 or more characters).")
    if "@" in normalized:
        signals.append("The URL contains an @ symbol, which can obscure the destination in some URL formats.")
    if parsed.scheme.lower() != "https":
        signals.append("The URL does not use HTTPS. This alone does not prove a URL is malicious.")
    try:
        ipaddress.ip_address(host.strip("[]"))
        signals.append("The hostname is an IP address rather than a conventional domain name.")
    except ValueError:
        pass
    host_parts = [part for part in host.strip(".").split(".") if part]
    if max(len(host_parts) - 2, 0) >= 3:
        signals.append("The hostname contains multiple subdomain levels.")
    if host in SHORTENER_HOSTS:
        signals.append("The hostname belongs to a known URL-shortening service; the destination may be obscured.")
    matching_terms = [term for term in SUSPICIOUS_TERMS if term in normalized.lower()]
    if matching_terms:
        signals.append("The URL contains terms often seen in account or credential workflows: " + ", ".join(matching_terms[:5]) + ".")
    if "xn--" in host:
        signals.append("The hostname contains punycode, which can be used by internationalized domains.")
    if not signals:
        signals.append("No simple lexical warning signals were detected; that does not establish that the URL is safe.")
    return signals
