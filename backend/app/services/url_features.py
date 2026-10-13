"""URL lexical features for the ThreatLens phishing-risk research model.

The model deliberately does not use URL scheme (HTTP/HTTPS) or a leading
``www`` marker as classifier features. The source dataset strongly correlates
both with its labels, and neither is reliable evidence that a URL is benign.
Feature strings are canonicalized so optional ``www`` and an empty root path
cannot create different model inputs. The displayed/submitted URL is retained
separately by normalize_url(). No URL is fetched or opened.
"""

from __future__ import annotations

import ipaddress
import math
import re
from collections import Counter
from urllib.parse import parse_qsl, urlsplit

import tldextract

SUSPICIOUS_TERMS = (
    "login", "signin", "verify", "verification", "account", "secure",
    "update", "password", "confirm", "banking", "wallet", "payment",
    "billing", "auth", "recover", "suspended", "limited", "support",
)

SHORTENER_HOSTS = {
    "bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy",
    "ow.ly", "buff.ly", "shorturl.at", "rebrand.ly",
}

# Scheme and www-specific features were removed. Length and character features
# are measured on a canonical URL view with both omitted, to avoid encoding the
# dataset's source-formatting artifacts indirectly through those counts.
URL_FEATURE_NAMES = (
    "url_length", "host_length", "path_length", "query_length",
    "host_dot_count", "subdomain_count", "host_hyphen_count",
    "url_hyphen_count", "underscore_count", "at_symbol_count",
    "question_mark_count", "equals_count", "ampersand_count",
    "percent_count", "digit_count", "alphabetic_count", "digit_ratio",
    "special_character_ratio", "host_is_ip", "has_port",
    "host_uses_punycode", "suspicious_term_count", "is_shortener",
    "path_depth", "query_parameter_count", "tld_length",
    "host_double_hyphen", "host_character_entropy",
)

NORMALIZATION_VERSION = "scheme-www-neutral-psl-v3"

# Use the bundled PSL snapshot and avoid network access at inference time.
# Include PSL private domains such as github.io so host structure is counted
# relative to the hosting boundary, not just the last two labels.
_PSL_EXTRACT = tldextract.TLDExtract(
    suffix_list_urls=(),
    include_psl_private_domains=True,
)


def normalize_url(value: str) -> str:
    """Validate and normalize an HTTP(S) URL, canonicalizing a root slash.

    URLs without an explicit scheme are treated as host/path and receive
    ``http://`` for backward compatibility. Explicit unsupported schemes,
    whitespace/control characters, backslashes, invalid ports and hostless
    URLs are rejected. Non-root paths and query/fragment strings are preserved.
    """
    if not isinstance(value, str):
        raise ValueError("Enter a valid URL or domain name.")

    raw = value.strip()
    if not raw:
        raise ValueError("Enter a URL to analyze.")
    if any(character.isspace() or ord(character) < 0x20 for character in raw):
        raise ValueError("URLs must not contain unescaped whitespace or control characters.")
    if "\\" in raw:
        raise ValueError("Backslashes are not supported in URLs; encode them if they are part of the path.")

    if re.match(r"^https?://", raw, flags=re.IGNORECASE):
        pass
    elif re.match(r"^https?:", raw, flags=re.IGNORECASE):
        raise ValueError("Enter a valid HTTP or HTTPS URL including '://'.")
    elif re.match(r"^[a-z][a-z0-9+.-]*://", raw, flags=re.IGNORECASE):
        raise ValueError("Only HTTP and HTTPS URLs are supported.")
    elif re.match(r"^(?:javascript|data|file|ftp|mailto|tel|blob|ws|wss):", raw, flags=re.IGNORECASE):
        raise ValueError("Only HTTP and HTTPS URLs are supported.")
    else:
        raw = "http://" + raw

    try:
        parsed = urlsplit(raw)
        host = parsed.hostname
        _ = parsed.port  # raises ValueError for malformed/out-of-range ports
    except ValueError as exc:
        raise ValueError("Enter a valid URL or domain name.") from exc

    if parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS URLs are supported.")
    if not host or any(character.isspace() for character in host):
        raise ValueError("Enter a valid URL or domain name.")

    canonical_path = "" if parsed.path == "/" else parsed.path
    return parsed._replace(scheme=parsed.scheme.lower(), path=canonical_path).geturl()


def _ascii_hostname(host: str) -> str:
    """Return a lower-case ASCII hostname view for consistent host features."""
    value = host.strip(".").lower()
    try:
        ipaddress.ip_address(value.strip("[]"))
        return value
    except ValueError:
        pass
    try:
        return value.encode("idna").decode("ascii").lower()
    except UnicodeError:
        # Keep malformed IDN input visible to the feature extractor; validation
        # remains explicit at the URL parser/API boundary rather than crashing.
        return value


def _feature_view(normalized: str) -> tuple[str, str, str, bool, bool, float, float]:
    """Create a format-neutral URL view and PSL-aware host properties.

    Returns feature text, canonical host, path, is-ip, has-port, subdomain
    count, and effective public suffix length. Scheme and a single leading
    www. are intentionally omitted from model input; userinfo is retained so
    deceptive ``user@host`` syntax remains visible.
    """
    parsed = urlsplit(normalized)
    parsed_host = _ascii_hostname(parsed.hostname or "")

    try:
        ipaddress.ip_address(parsed_host.strip("[]"))
        host_is_ip = True
    except ValueError:
        host_is_ip = False

    feature_host = parsed_host
    if not host_is_ip and feature_host.startswith("www."):
        feature_host = feature_host[4:]

    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Enter a valid URL or domain name.") from exc
    has_port = port is not None

    # Preserve explicit user-info syntax and any explicit port, but do not use
    # scheme or a single leading www. in classifier character statistics.
    userinfo = parsed.netloc.rsplit("@", 1)[0] + "@" if "@" in parsed.netloc else ""
    host_for_netloc = feature_host
    # Parsed IPv6 hostnames lack brackets; keep them bracketed in reconstructed text.
    try:
        ip_obj = ipaddress.ip_address(feature_host.strip("[]"))
        if ip_obj.version == 6:
            host_for_netloc = f"[{feature_host.strip('[]')}]"
    except ValueError:
        pass
    feature_netloc = userinfo + host_for_netloc + (f":{port}" if port is not None else "")
    feature_text = feature_netloc + parsed.path
    if parsed.query:
        feature_text += "?" + parsed.query
    if parsed.fragment:
        feature_text += "#" + parsed.fragment

    try:
        ipaddress.ip_address(feature_host.strip("[]"))
        host_is_ip = True
    except ValueError:
        host_is_ip = False

    subdomain_count = 0.0
    suffix_length = 0.0
    if not host_is_ip and feature_host:
        suffix_info = _PSL_EXTRACT(feature_host)
        if suffix_info.suffix and suffix_info.domain:
            subdomain_count = float(
                len([label for label in suffix_info.subdomain.split(".") if label])
            )
            suffix_length = float(len(suffix_info.suffix))
        else:
            # Unknown/internal suffix fallback: don't pretend the last two
            # labels are always a registrable domain. Record zero subdomains
            # and expose the final label length only as a weak lexical feature.
            final_label = feature_host.rsplit(".", 1)[-1]
            suffix_length = float(len(final_label))

    return feature_text, feature_host, parsed.path, host_is_ip, has_port, subdomain_count, suffix_length



def canonical_model_url_key(value: str) -> str:
    """Return exact URL identity under the model's scheme/www-neutral view.

    Unlike the numeric feature vector, this keeps the path, query, fragment,
    user-info syntax, and port. It intentionally collapses only the URL
    representation differences that the feature extractor itself ignores.
    Use this key to detect duplicate or conflicting labels before training.
    """
    normalized = normalize_url(value)
    feature_text, *_ = _feature_view(normalized)
    return feature_text


def registered_domain_key(value: str) -> str:
    """Return a PSL-aware registrable-domain grouping key for evaluation.

    The key is for dataset splitting/leakage checks only, not a safety verdict.
    One leading ``www.`` is ignored so www and apex rows cannot cross split
    boundaries as if they were unrelated domains. IP literals are grouped by
    their normalized address. Unknown/internal suffixes fall back to hostname.
    """
    normalized = normalize_url(value)
    host = _ascii_hostname(urlsplit(normalized).hostname or "")
    try:
        ipaddress.ip_address(host.strip("[]"))
        return f"ip:{host}"
    except ValueError:
        pass
    if host.startswith("www."):
        host = host[4:]
    result = _PSL_EXTRACT(host)
    if result.domain and result.suffix:
        return f"{result.domain}.{result.suffix}"
    return host

def _entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = Counter(value.lower())
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def extract_url_features(value: str) -> list[float]:
    """Return finite numeric features for the v3 model's canonical URL view."""
    normalized = normalize_url(value)
    parsed = urlsplit(normalized)
    (feature_text, host, path, host_is_ip, has_port,
     subdomain_count, suffix_length) = _feature_view(normalized)

    digits = sum(character.isdigit() for character in feature_text)
    alphabetic = sum(character.isalpha() for character in feature_text)
    special = sum(not character.isalnum() for character in feature_text)
    length = max(len(feature_text), 1)
    path_segments = [segment for segment in path.split("/") if segment]

    try:
        query_parameter_count = float(len(parse_qsl(parsed.query, keep_blank_values=True)))
    except ValueError:
        query_parameter_count = 0.0

    features = [
        float(len(feature_text)),
        float(len(host)),
        float(len(path)),
        float(len(parsed.query)),
        float(host.count(".")),
        subdomain_count,
        float(host.count("-")),
        float(feature_text.count("-")),
        float(feature_text.count("_")),
        float(feature_text.count("@")),
        float(feature_text.count("?")),
        float(feature_text.count("=")),
        float(feature_text.count("&")),
        float(feature_text.count("%")),
        float(digits),
        float(alphabetic),
        float(digits / length),
        float(special / length),
        float(host_is_ip),
        float(has_port),
        float("xn--" in host),
        float(sum(term in feature_text.lower() for term in SUSPICIOUS_TERMS)),
        float(host in SHORTENER_HOSTS),
        float(len(path_segments)),
        query_parameter_count,
        suffix_length,
        float("--" in host),
        float(_entropy(host)),
    ]
    if len(features) != len(URL_FEATURE_NAMES):
        raise RuntimeError("URL feature count does not match the declared v3 schema.")
    if not all(math.isfinite(feature) for feature in features):
        raise RuntimeError("URL feature extraction produced a non-finite value.")
    return features


def explain_url_signals(value: str) -> list[str]:
    """Return human-readable URL characteristics, not neural-model attribution."""
    normalized = normalize_url(value)
    parsed = urlsplit(normalized)
    host = _ascii_hostname(parsed.hostname or "")
    signals: list[str] = []

    if len(normalized) >= 100:
        signals.append("The URL is unusually long (100 or more characters).")
    if "@" in parsed.netloc:
        signals.append("The URL contains user-information syntax (@), which can obscure the destination host.")
    if parsed.scheme.lower() != "https":
        signals.append("The URL does not use HTTPS. This alone does not prove a URL is malicious.")
    try:
        ipaddress.ip_address(host.strip("[]"))
        signals.append("The hostname is an IP address rather than a conventional domain name.")
    except ValueError:
        pass
    feature_host = host[4:] if host.startswith("www.") else host
    suffix_info = _PSL_EXTRACT(feature_host)
    if len([label for label in suffix_info.subdomain.split(".") if label]) >= 3:
        signals.append("The hostname contains multiple subdomain levels.")
    if feature_host in SHORTENER_HOSTS:
        signals.append("The hostname belongs to a known URL-shortening service; its destination may be obscured.")
    matching_terms = [term for term in SUSPICIOUS_TERMS if term in normalized.lower()]
    if matching_terms:
        signals.append("The URL contains terms often seen in account or credential workflows: " + ", ".join(matching_terms[:5]) + ".")
    if "xn--" in host:
        signals.append("The hostname contains punycode, which can be used by internationalized domains.")
    if not signals:
        signals.append("No simple lexical warning signals were detected; that does not establish that the URL is safe.")
    return signals
