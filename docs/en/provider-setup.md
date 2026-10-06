# Qwen / Alibaba Cloud Model Studio setup

[Project README](../../README.md) · [中文版](../provider-setup.md)

**Provider information last checked: September 29, 2026.** Providers can change models, regions, endpoints, and prices. **The invocation examples supplied by the console for your own account take precedence.** Translating this guide does not constitute a new provider verification. This project does not register an account, purchase credits, or fill in API keys for you.

## 1. Activate access and select a region and workspace

1. Sign in to the Alibaba Cloud Model Studio console and complete the activation steps required for your account.
2. Select the region you will actually use and enter the corresponding workspace. API keys, available models, and workspace permissions must match.
3. Follow the [official API key instructions](https://help.aliyun.com/zh/model-studio/get-api-key) to create a key dedicated to this project, with limited permissions and budget. Do not reuse a team administrator key.
4. Find the chat, embedding, and text-reranking examples separately. Confirm that your account is authorized for each model. See the [official region documentation](https://help.aliyun.com/zh/model-studio/regions) for region and endpoint rules.

Never commit `.env`, screenshots containing keys, or real internal documents to GitHub. Browser requests go through the local backend; the frontend neither needs nor should receive model API keys.

## 2. Configure the three interfaces separately

Copy `.env.example` to `.env` in the repository root. If the startup script already created it, edit the existing file. Account-specific values remain blank in the template; fill them with the configuration from your own console.

| Environment variable | Value to supply | Request location |
|---|---|---|
| `LLM_BASE_URL` | OpenAI-compatible base URL, without `/chat/completions` | The adapter appends `/chat/completions` |
| `LLM_API_KEY` | Model Studio key for the correct region and workspace | Backend Authorization header |
| `LLM_MODEL` | Qwen chat model enabled in that workspace; select and record a stable snapshot for a reproducible demonstration | Request `model` |
| `EMBEDDING_BASE_URL` | Compatible base URL supporting the selected embedding model, without `/embeddings` | The adapter appends `/embeddings` |
| `EMBEDDING_API_KEY` | Key authorized for the embedding service; it may match the chat key, but do not assume this | Backend Authorization header |
| `EMBEDDING_MODEL` | `text-embedding-v4` | Request `model` |
| `EMBEDDING_DIMENSIONS` | Default `1024`; must be supported by the model | Request `dimensions` and vector-index dimension |
| `RERANK_ENDPOINT` | **Complete reranking URL**, including the final `/reranks` path | Used directly; the adapter does not append a path |
| `RERANK_API_KEY` | Key authorized for text reranking | Backend Authorization header |
| `RERANK_MODEL` | `qwen3-rerank` | Request `model` |

At the verification date above, official Beijing workspace examples used a chat/embedding base URL shaped like `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`. Replace `{WorkspaceId}` with your own workspace ID; do not leave the braces in the actual value. See the [official embedding guide](https://help.aliyun.com/zh/model-studio/embedding).

The corresponding documented qwen3-rerank endpoint was shaped like `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-api/v1/reranks`. **This uses `compatible-api`, whereas chat uses `compatible-mode`.** Other regions or access methods can have different examples; copy the complete URL for your region. Do not reuse the legacy `gte-rerank` request body for `/api/v1/services/rerank/text-rerank/text-rerank` with qwen3-rerank. See the [official reranking API](https://help.aliyun.com/zh/model-studio/text-rerank-api).

The qwen3-rerank adapter sends top-level `model/query/documents/top_n` fields and reads document indexes and relevance scores. Chat and embedding use their respective compatible JSON formats. Changing providers requires modifying or adding a backend adapter and running contract tests, rather than changing only a model name.

## 3. Configure prices and budgets

```dotenv
APP_MODE=cloud
LLM_INPUT_CNY_PER_MILLION=
LLM_OUTPUT_CNY_PER_MILLION=
EMBEDDING_CNY_PER_MILLION=
RERANK_CNY_PER_MILLION=
PRICE_AS_OF=
MAX_RUN_COST_CNY=0.50
MAX_DAILY_COST_CNY=10.00
REQUEST_TIMEOUT_SECONDS=30
MAX_RETRIES=2
```

Copy prices for the selected region, model, and context length from the [official pricing page](https://help.aliyun.com/zh/model-studio/model-pricing). Convert them to CNY per million tokens and record the verification date. A price quoted per thousand tokens must be multiplied by 1,000. Do not assume cache discounts or free credits make calls cost zero. For tiered pricing, use a rate covering the expected input length and document the choice in your experiment.

Missing prices are not treated as zero. Admission checks reserve a conservative input/output allowance; final settlement uses provider-reported usage. Missing usage, interrupted requests, and malformed responses retain unknown usage and the budget reservation. A budget deduction is therefore not an official provider bill: the provider console remains the billing authority. Daily budgets use the backend UTC date, which can differ from the date shown in the local time zone.

## 4. Check connectivity, index, and run

1. Restart the backend after saving `.env`. An existing process does not reload environment variables automatically.
2. Run `python -m deskpilot.cli check`. Missing configuration reports only variable names. Complete configuration triggers real embedding, reranking, and chat requests and may incur a small charge. Do not print the complete `.env` while troubleshooting.
3. Alternatively, use the administrator demo identity to explicitly run the same check from the configuration dialog. It is an alternative to the CLI check, not an additional required step, and can also incur charges.
4. Run `python -m deskpilot.cli index-cloud` to explicitly build the cloud vector index for published documents that permit outbound processing. **This command incurs provider charges.** Initial `init` only seeds local data; it never automatically performs cloud ingestion. Embedding requests are batched within the text-embedding-v4 limits. Inspect indexing jobs; incomplete indexes must produce a visible degraded state.
5. Search for a known issue and inspect the dense/reranking stages and usage records. Confirm the run did not remain BM25-only.
6. Rebuild the index after changing the embedding model or dimensions; never mix old and new vectors. Run the development regression set after changing the generation model as well.

The interface defaults to English. Selecting Chinese changes the interface and language captured by subsequent runs; it does not translate stored knowledge, evidence, or previous answers automatically.

## Troubleshooting

| Symptom | Check first | Expected boundary |
|---|---|---|
| HTTP 401 / 403 | Key validity, region/workspace match, and model authorization | Do not repeatedly retry authentication errors or echo keys |
| HTTP 404 | A full operation path accidentally supplied as a base URL, or the wrong reranking-compatible path | Correct the three settings independently |
| HTTP 429 | Quota, balance, concurrency, and rate limits | Bounded retries; persistent failures remain degraded or failed |
| Timeout / 5xx | Connectivity, service health, and timeout setting | Keep the event; no infinite retry loop; the provider may already have charged |
| Embedding dimension error | Model support for `EMBEDDING_DIMENSIONS` and whether the index belongs to an older model | Stop mixed writes and rebuild the index |
| Insufficient budget | Current usage, reservations for failed requests, and price units | Do not bypass controls by entering zero prices |
| A document cannot be retrieved | Publication, current version, user access, and cloud-permission flag | Do not broaden access simply to improve recall |

Uploads, knowledge text, memories, and retrieval context can contain untrusted instructions. Model credentials belong only to the gateway and must never enter prompts. Documents with `cloud_allowed=false` cannot be sent to embedding, reranking, or generation services.
