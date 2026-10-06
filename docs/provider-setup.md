# 千问 / 阿里云百炼接入指南

[English](en/provider-setup.md) · [中文首页](../README.zh-CN.md)

提供商信息核对日期：2026-09-29。模型、地域、接入域名和价格可能变化，实际接入以对应账号与业务空间的控制台示例为准。

## 1. 开通并选定地域与业务空间

1. 登录阿里云百炼控制台，完成账号要求的开通步骤。
2. 在控制台选择实际使用地域，并进入对应业务空间。API Key、可调用模型与空间权限必须一致。
3. 按[获取与配置 API Key 官方说明](https://help.aliyun.com/zh/model-studio/get-api-key)创建具有所需模型权限与预算的应用凭据。
4. 在模型调用示例中分别找到聊天、向量和文本重排请求，确认账户确实有权限调用。地域与接入域名规则见[官方地域说明](https://help.aliyun.com/zh/model-studio/regions)。

浏览器通过后端访问模型服务；模型凭据由后端适配器读取，不属于前端配置。

## 2. 三种接口分别填写

仓库根目录的 [`.env.example`](../.env.example) 定义配置项。安装脚本会在 `.env` 不存在时创建配置副本，账号相关字段由对应业务空间的调用配置提供。

| 环境变量 | 怎么填 | 请求位置 |
|---|---|---|
| `LLM_BASE_URL` | OpenAI 兼容接口 base URL，不带 `/chat/completions` | 适配器追加 `/chat/completions` |
| `LLM_API_KEY` | 对应地域与业务空间的百炼 Key | 后端 Authorization header |
| `LLM_MODEL` | 该空间已开通的千问聊天模型名；固定快照便于复现评测 | 请求 `model` |
| `EMBEDDING_BASE_URL` | 支持该 embedding 模型的兼容接口 base URL，不带 `/embeddings` | 适配器追加 `/embeddings` |
| `EMBEDDING_API_KEY` | 对应 embedding 服务的 Key，可与前者相同但不能假设 | 后端 Authorization header |
| `EMBEDDING_MODEL` | `text-embedding-v4` | 请求 `model` |
| `EMBEDDING_DIMENSIONS` | 默认 `1024`，模型支持的维度 | 请求 `dimensions`，也决定索引维度 |
| `RERANK_ENDPOINT` | **完整重排地址**，包含最终 `/reranks` 路径 | 直接请求，适配器不追加路径 |
| `RERANK_API_KEY` | 有文本重排调用权限的 Key | 后端 Authorization header |
| `RERANK_MODEL` | `qwen3-rerank` | 请求 `model` |

在上述核对日期，官方北京业务空间聊天/embedding 的 base URL 示例为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，其中 `{WorkspaceId}` 表示业务空间 ID 占位符。[官方 embedding 接入](https://help.aliyun.com/zh/model-studio/embedding)

同一核对日期的 qwen3-rerank 北京业务空间 endpoint 示例为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-api/v1/reranks`。它使用 `compatible-api` 路径；聊天接口使用 `compatible-mode`。地域与接入方式可能对应不同 URL。qwen3-rerank 的请求体与旧 `gte-rerank` 接口不同。[官方文本重排 API](https://help.aliyun.com/zh/model-studio/text-rerank-api)

本项目的 qwen3-rerank 使用顶层 `model/query/documents/top_n` 请求结构，并接收索引与相关性分数；chat 和 embedding 使用对应兼容 JSON。更换提供商时应修改/新增后端适配器并执行契约测试，而不是只改模型名。

## 3. 填写价格和预算

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

从[官方模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)复制所选地域、模型、上下文长度对应的价格，统一换算为人民币每百万 token，并填写核对日期。若供应商按千 token 报价，乘 1000 后才填入。默认不使用缓存命中折扣或免费额度推算“零成本”；如果价格分档，请用能覆盖预期输入长度的价格，并在实验说明中注明。

价格缺失时拒绝把成本当零。预算判断使用保守输入/输出预留，最终用供应商返回 usage 结算；没有返回 usage、网络中断或异常响应时保留未知用量与预算扣减。因此“预算扣减”不是供应商正式账单，控制台账单才是最终依据。每日预算按后端 UTC 日期统计，本地展示的日期可能有时区差异。

## 4. 检查、导入、运行

1. 保存 `.env` 后重新启动后端，旧进程不会自动读取新环境。
2. 执行 `python -m deskpilot.cli check`：缺配置时只报告缺少的配置名，配置齐全时会真实调用 embedding、rerank、chat 三个接口，产生少量费用。
3. 也可以用管理员演示身份进入配置检查，显式发起同样的真实请求。它是 CLI 检查的替代入口，无须重复执行；同样可能收费。
4. 执行 `python -m deskpilot.cli index-cloud`，显式为允许外发的已发布知识建立云向量索引；此命令会收费。初始 `init` 只做本地 seed，绝不自动云入库。嵌入请求按 text-embedding-v4 的批量限制分批，检查索引任务结果，索引不完整时必须看到降级提示。
5. 搜索一个已知问题，查看 dense/rerank 阶段与 usage，确认没有停留在仅 BM25 模式。
6. 更改 embedding 型号或维度后必须重建索引，不能把旧向量继续混用。生成模型更换也应重新运行 dev 回归集。

## 常见问题

| 现象 | 优先检查 | 行为边界 |
|---|---|---|
| HTTP 401 / 403 | Key 是否正确、是否属于此地域/业务空间、模型是否已授权 | 认证错误不反复重试，不回显 Key |
| HTTP 404 | base URL 是否误填完整路径，重排是否用了错误的兼容路径 | 三个配置独立修正 |
| HTTP 429 | 额度、余额、并发和速率限制 | 最多有限次数重试；仍失败显示降级/失败 |
| 超时 / 5xx | 网络连通性、服务状态、timeout 设置 | 保留事件，不无限重跑；供应商可能已计费 |
| embedding 维度错误 | `EMBEDDING_DIMENSIONS` 是否受模型支持，索引是否属于旧模型 | 停止混写，重建索引 |
| “预算不足” | 当前用量、失败请求预留、价格单位 | 不通过把价格填零绕过预算 |
| 无法召回某文档 | 是否发布、是否当前版本、用户是否有权、云许可标记 | 不扩大权限来提升命中率 |

上传文件、知识内容、记忆与检索上下文均作为不可信数据处理。模型凭据仅用于后端认证，不进入 prompt；`cloud_allowed=false` 文档不参与云端 embedding、重排或生成。
