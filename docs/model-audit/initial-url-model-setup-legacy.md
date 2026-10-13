# ThreatLens AI: first real AI milestone (URL MLP)

This bundle adds the first trainable/inferable neural-network feature without removing existing auth, client reporting, or analyst incident routes.

## Model and dataset

- Dataset: UCI PhiUSIIL Phishing URL (Website) Dataset, id 967.
- Citation: Prasad, A. & Chandra, S. (2024), UCI Machine Learning Repository, https://doi.org/10.1016/j.cose.2023.103545
- UCI license: CC BY 4.0. Preserve attribution in project documentation.
- The public dataset's original labels are `1=legitimate` and `0=phishing`. The training script maps them to `0=legitimate`, `1=phishing`.
- For parity between training and live inference, the MLP uses lexical features extracted from the raw URL column only. It does not download or open any submitted URL.

## Apply this bundle

Extract the ZIP into the repository root (`C:\Users\parth\threatlens-ai`) and allow its `backend` folder to merge with the existing one. Replace `docker-compose.yml` when asked. Do **not** replace your existing `.gitignore`; append the three lines in `gitignore_additions.txt` to the end of it. Check that `backend/app/api/routes/analysis.py`, `backend/app/schemas/analysis.py`, `backend/app/services/url_features.py`, `backend/app/services/url_model.py`, and `backend/ml/train_url_model.py` exist afterwards.

## Build the backend

From the repository root:

```powershell
docker compose up --build -d
```

This installs the added Python dependencies and starts the existing application. The PostgreSQL named volume is unchanged; do not run `docker compose down -v`.

## Train the model

The first training run needs internet access from the backend container to download the public UCI dataset:

```powershell
docker exec -it threatlens-api python -m ml.train_url_model
```

Training uses up to 60,000 examples to keep runtime manageable. It prints held-out test metrics and saves:

- `backend/models/url_mlp.joblib`
- `backend/models/url_mlp_metrics.json`

These artifacts are stored in a bind-mounted host folder and are intentionally excluded from Git by default. Do not report accuracy or other metrics until training finishes and writes the results file.

## Test the authenticated analysis endpoint

Open http://localhost:8000/docs. Authenticate using an access token from `/api/auth/login`, then call `POST /api/analysis/url` with:

```json
{
  "url": "https://example.com/account/verify"
}
```

Before the model is trained, the endpoint should return HTTP 503 with instructions. After training, it should return a prediction, phishing probability, confidence, risk band, and simple URL-characteristic signals.

The `signals` are rule-derived characteristics for analyst context, not formal feature-attribution explanations from the MLP. The tool is a research/demo aid, not a guarantee that a URL is safe or malicious.

## Suggested test command

```powershell
docker exec -it threatlens-api pytest -q
```
