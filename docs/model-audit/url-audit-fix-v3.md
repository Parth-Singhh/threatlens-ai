# ThreatLens URL audit fix v3 — scheme/`www` shortcut removal

## Why v2 was not promoted

The v2 candidate passed root-slash invariance and classified Google/Wikipedia below the phishing threshold after canonicalization, but it still gave `https://example.com/` a phishing score of `0.9999`. The existing feature audit showed:

- 100% of source legitimate URLs were HTTPS and had `www`; 0% had paths.
- Only 48.6% of phishing URLs were HTTPS and 41.5% had `www`; 59.7% had some path.
- `has_www_prefix` and `is_https` were the strongest class-correlated features, with host dot count, subdomain count, hostname length and overall URL length also encoding the same `www`/scheme distinction.

This shows v2 still relies on a dataset collection artifact. No domain whitelist is used in v3.

## v3 changes

- Removes HTTP/HTTPS and `www` indicator features entirely.
- Builds a canonical classifier view with a single leading `www.` and the outer URL scheme omitted from *all* textual count features; root slash is already canonicalized. The original URL is still returned for review.
- Uses a bundled Public Suffix List via `tldextract` without network access at inference, including private suffixes, for subdomain counts and suffix length.
- Adds feature/score invariance checks for scheme, www and root-slash variants; keeps `@` userinfo syntax represented; adds PSL regression coverage for `.co.uk`.
- Rejects loading the old v1/v2 model under the v3 feature schema until a validated candidate is promoted, instead of silently sending 28 features into an incompatible 31-feature model.
- The model trainer continues to save a separate candidate. The current production artifact isn't overwritten during training.

## Install and test

From PowerShell in the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\apply_url_audit_fix_v3.ps1
git diff --check
git status --short
```

Inspect the diff, then rebuild only the backend (the original model and its metrics are already backed up locally):

```powershell
docker compose up --build -d backend
docker exec -it threatlens-api pytest -q
```

Restore v1 artifact for preservation (it is feature-incompatible and should not be used through v3 inference):

```powershell
docker exec threatlens-api mkdir -p /app/models
docker cp .\backend\models\url_mlp_v1_backup.joblib threatlens-api:/app/models/url_mlp_v1_backup.joblib
docker cp .\backend\models\url_mlp_v1_backup_metrics.json threatlens-api:/app/models/url_mlp_v1_backup_metrics.json
```

Train and check a candidate:

```powershell
docker exec -it threatlens-api python -m ml.train_url_model
docker exec -it threatlens-api python -m ml.check_url_model_candidate
```

**Do not promote if the candidate gate fails.** A passing 3-domain gate is a limited regression check, not proof of real-world performance. Before making production claims, evaluate a current, independently labeled set with a domain/time-aware split, confusion matrix, precision, recall, F1, FPR/FNR, and calibration if probabilities are to be interpreted.

If (and only if) the candidate gate passes:

```powershell
docker exec -it threatlens-api python -m ml.promote_url_model
docker compose restart backend
```

## Risks and caveats

- This is a correction to known feature shortcuts, not a guarantee of robust phishing detection.
- Feature invariance across HTTP/HTTPS is intentional for this lexical model; scheme security is shown only as a human-readable signal, not as evidence of phishing or legitimacy.
- A URL classifier based only on strings cannot confirm ownership, reputation, redirects, certificate validity, page content, or whether a site is safe.
- The current source dataset still has collection bias. Independent labeled evaluation is required. No real-world improvement metric is claimed by this patch.
