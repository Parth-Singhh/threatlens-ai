# ThreatLens URL false-positive audit fix (candidate-based)

## Root-cause evidence

The source label mapping is consistent: dataset label 1 (legitimate) is mapped to model label 0, and dataset label 0 (phishing) is mapped to model label 1. Inference selects the probability for class 1 and the serialized pipeline contains its own fitted `StandardScaler`.

The reproduced data audit found a serious collection-format correlation:

- Legitimate class: 100% HTTPS, 100% `www`, 0% explicit root slash, 0% non-root path; mean URL length 27.23.
- Phishing class: 48.6% HTTPS, 41.5% `www`, 32.6% explicit root slash, 27.1% non-root path; mean URL length 46.22.
- Top feature associations by absolute standardized mean difference included `has_www_prefix` (-1.69), `is_https` (-1.46), URL digit ratio (+0.90), and path/length features.
- For the same root domain, the existing model's output changed dramatically only when the trailing slash was added: `https://www.google.com` gave 0.0016 while `https://www.google.com/` gave 0.7364; Wikipedia gave 0.0021 without slash and 0.8968 with slash. `example.com` showed the same format sensitivity.

This demonstrates that a semantically insignificant root-path formatting difference is a major spurious signal. It is the earliest confirmed divergence in the path from URL normalization into the numeric features. Dataset provenance and correlations around HTTPS/`www` remain a broader generalization risk, so the fix must be retrained and evaluated rather than treated as a complete proof of model quality.

## What's included

- `payload/backend/app/services/url_features.py`: canonicalizes an empty root path and `/` to the same representation, rejects unsupported explicit schemes and malformed whitespace/backslashes, and keeps non-root paths intact. Training and inference both use this function.
- `payload/backend/app/services/url_model.py`: checks tagged candidate artifacts against the live feature schema, validates class labels and feature count, reports the candidate's model version, and explicitly describes the score as uncalibrated.
- `payload/backend/tests/test_url_normalization_regression.py`: format invariance, path-preservation, parser/credential syntax, malformed inputs, and finite feature/schema tests.
- `payload/backend/ml/check_url_model_candidate.py`: candidate-only checks; ensures slash/no-slash variants normalize identically, then gates promotion on three benign root URL regression examples. These are tests—not a runtime whitelist.
- `payload/backend/ml/promote_url_model.py`: refuses promotion if the feature schema or root URL gate fails, and preserves the old model/metrics before promotion.
- `apply_url_audit_fix.ps1`: backs up modified source files inside Git metadata, applies the files, updates the training script to write a *candidate* (not overwrite v1), and ensures ML dependencies/Dockerfile copy instructions exist.

## Safe local procedure

**Do not rebuild before backing up the current model artifact**, because the model currently lives inside the API container and Docker Compose does not mount `/app/models` as a persistent volume.

1. From PowerShell at `C:\Users\parth\threatlens-ai`, back up the model and metrics to the ignored local `backend\models` folder:

   ```powershell
   cd C:\Users\parth\threatlens-ai
   New-Item -ItemType Directory -Force .\backend\models | Out-Null
   docker cp threatlens-api:/app/models/url_mlp.joblib .\backend\models\url_mlp_v1_backup.joblib
   docker cp threatlens-api:/app/models/url_mlp_metrics.json .\backend\models\url_mlp_v1_backup_metrics.json
   ```

   If either `docker cp` fails, stop and report the exact error instead of continuing.

2. Extract this ZIP **into the project root** (the folder containing `docker-compose.yml`), so `apply_url_audit_fix.ps1` and `payload` sit in that root. Then run:

   ```powershell
   .\apply_url_audit_fix.ps1
   git diff --check
   git status --short
   ```

   Review the diff. The installer saves source backups inside `.git\threatlens-url-audit-backup-*` and does not change the model files on its own.

3. Rebuild just the backend, then restore the existing v1 model for safe rollback while we create a candidate:

   ```powershell
   docker compose up --build -d backend
   docker exec threatlens-api mkdir -p /app/models
   docker cp .\backend\models\url_mlp_v1_backup.joblib threatlens-api:/app/models/url_mlp.joblib
   docker cp .\backend\models\url_mlp_v1_backup_metrics.json threatlens-api:/app/models/url_mlp_metrics.json
   docker compose restart backend
   ```

4. Run regression tests:

   ```powershell
   docker exec -it threatlens-api pytest -q
   ```

5. Train a separate candidate; this does **not** overwrite `url_mlp.joblib`:

   ```powershell
   docker exec -it threatlens-api python -m ml.train_url_model
   ```

6. Run the candidate gate:

   ```powershell
   docker exec -it threatlens-api python -m ml.check_url_model_candidate
   ```

   Send the complete test output, the training metrics, and the candidate scores back for review. If this gate fails, **do not promote**. The script will report that further model/data work is required.

7. Only if the candidate test gate passes, promote it and restart the backend:

   ```powershell
   docker exec -it threatlens-api python -m ml.promote_url_model
   docker compose restart backend
   ```

   The old v1 model is kept at `/app/models/url_mlp_v1_backup.joblib` inside the container and in the host `backend\models` folder. The training candidate and model metrics are ignored by Git; do not `git add` generated model files.

## Limits and open findings

- The 99.75% random-split and 99.76% hostname-separated scores from the previous, unnormalized feature pipeline do not establish robust real-world performance.
- The URL feature `subdomain_count` still approximates the registered domain as the last two labels; it is not Public Suffix List aware (for example `.co.uk`). This is a separate feature-definition limitation and may warrant a follow-up model version; it was not needed to reproduce the root-slash score flip.
- HTTPS and `www` are weak contextual features, not proof of safety. The feature importance shown in the audit confirms dataset correlation, not causal threat evidence.
- The three-root-URL gate is a small regression check only. Before claiming production readiness, evaluate an independent, appropriately labeled dataset and report confusion matrix, precision/recall/F1, false-positive rate, false-negative rate, and calibration where applicable.
- No URL is opened by this code; the system uses the URL string only.
