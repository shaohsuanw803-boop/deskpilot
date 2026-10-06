# MCP 与 Agent harness：接入、边界与维护

本版使用官方 MCP Python SDK 1.x（锁定到依赖锁中的确切版本）。DeskPilot 是 MCP 客户端；内置的 `deskpilot.mcp_demo_server` 是独立 stdio 服务端。MCP 负责协议，授权仍由 DeskPilot 服务端决定。

## 可以运行的功能

1. 在“连接器与执行控制”点击“查询 VPN 状态”或“查看我的设备”。协议真实执行，内置业务数据明确标为虚构。
2. 在对话输入框下方将“MCP 预检”设为“本地 IT 演示”，提交 VPN 问题。任务绑定 `diagnose-connected@1.0.0`，先查服务和本人设备，再执行原有 RAG。
3. 页面分开展示 MCP 观测和知识引用。预检失败仍继续 RAG，错误不会被伪装为正常状态。
4. 在执行记录展开查看 `before_tool`、`after_tool` 或 `on_error`、耗时和契约摘要。连续三次失败熔断 60 秒；只有管理员能主动重置。

## 工具与信任边界

| 工具 | 输入 | 输出 | 主机侧规则 |
|---|---|---|---|
| `service_status` | `service`: vpn / office / identity | 服务、状态、摘要、观测时间、模拟标记 | 枚举参数，摘要最多 500 字 |
| `asset_lookup` | 后端绑定的 `user_id` | 用户、设备、系统、纳管状态、模拟标记 | 任何角色都只能查自己；结果用户也必须匹配 |

完整输入/输出 JSON Schema 见 `backend/deskpilot/mcp_contracts.py`。客户端初始化后列出工具，校验名称及输入/输出 Schema 摘要，然后才发送 `tools/call`。工具的 description 和 annotations 不授予权限，也不会进入模型提示词。远端额外提供的工具不会自动注册。必须逐项匹配本项目契约，不能把任意第三方 MCP 地址填入后宣称兼容。

本地服务使用固定 Python 模块启动，无任意命令参数入口。SDK 只继承其系统环境变量白名单，项目仅增加 Python 编码和模块路径；不复制千问密钥，不读取 `.env`。这不是操作系统沙箱：子进程仍有当前 OS 用户的文件权限，因此只运行仓库内审核过的服务。

不提供任意文件读取、shell、数据库写入、邮件发送、采样或交互式授权回调。MCP 返回值视为外部数据，验证大小/结构、脱敏后只存本地；不进入 RAG 证据、用户历史答案或千问消息。页面以文本呈现，不执行其中的指令或 HTML。

## 接真实远程服务

在本机 `.env` 中填写，禁止把密钥放进 README、前端 `VITE_*`、URL 参数或工单：

```dotenv
MCP_REMOTE_ENABLED=true
MCP_REMOTE_URL=https://你的审核主机/mcp
MCP_REMOTE_ALLOWED_HOST=你的审核主机
MCP_REMOTE_TOKEN=
MCP_TIMEOUT_SECONDS=15
MCP_MAX_RESULT_BYTES=16384
MCP_DAILY_CALL_LIMIT=200
MCP_FAILURE_THRESHOLD=3
MCP_COOLDOWN_SECONDS=60
```

`MCP_REMOTE_TOKEN` 使用该服务独立的最小只读权限凭据，不复用千问 Key。重启后选择“企业 IT 连接器”进行显式查询。`APP_MODE=demo` 禁止千问请求，但远程 MCP 是独立开关；两者的授权不能混为一谈。选远程连接器时会向该服务发送服务枚举或当前用户 ID，不发送问题全文、知识片段与聊天历史。

支持 Streamable HTTP、HTTPS 443、固定允许主机；拒绝用户信息、查询参数、重定向与非公网 DNS 结果。每个 HTTP 请求前复核地址和运行状态，关闭环境代理继承。SDK 握手、工具列举与工具调用均受总超时限制。HTTP 请求异常不会保存原始异常或认证头；MCP SDK transport/session 日志通过过滤器省略原始 payload 与异常正文。应用不主动重发 tools/call，SDK 内部事件流重连不等同于业务操作重试。

本版使用维护人配置的 Bearer 凭据，不实现 OAuth 登录/刷新、用户 token 透传、多租户企业目录映射。远端必须自行校验服务凭据与用户数据范围；演示 `alice` 等 ID 不能直接作为生产企业身份。专有内网 MCP 应通过经过设计的出站网关接入，不能简单关闭 SSRF 检查。

## Harness 负责什么

| 控制点 | 代码 | 行为 |
|---|---|---|
| 技能与路由 | `workflow.py`、`skills.py` | 固定技能版本，显式选择 MCP 预检，工具白名单 |
| 执行前 hook | `harness.py` | 服务/身份/参数检查，任务步数与每日次数配额，熔断检查 |
| 协议执行 | `mcp_transport.py` | 官方 SDK，握手，Schema 固定，发送前再次授权 |
| 执行后 hook | `harness.py` | 截止时间、结果大小与输出 Schema、用户/服务绑定、脱敏 |
| 错误 hook | `harness.py` | 安全错误码、失败计数、熔断；不自动重试 MCP |
| 持久化 | `db.py` | 工具记录、事件、契约摘要、策略版本、本地审计 |
| 恢复 | `workflow.py`、harness 初始化 | 原审批使用持久化检查点和幂等凭证；未完成 MCP 记录标为 interrupted |

MCP 每次真实业务调用消耗一个任务步骤；默认整个任务最多 8 步。每日调用配额是次数限制，不是远端财务账单。独立查询也受每日配额约束。工具调用串行执行，防止熔断恢复时并发探测；熔断到期后下一次只读调用作为探测，成功清零，失败重新开启。

应用重启不自动重放独立 MCP 查询；尚未完成的 LangGraph 诊断节点可能重新查询只读观测，因此不能承诺只读查询“恰好一次”。原有权限写入仍然是本地模拟适配器，不经 MCP 绕过审批。

## 明确保留的工程限制

- 单机、单后端 worker；每次本地调用启动独立进程，吞吐优先级低于可解释性，生产可改连接池和任务队列。
- MCP 单次结果限制发生在 SDK 解码后，不是网络层内存硬限制。超大协议帧、无限通知流需要网关或进程级资源限制。
- DNS 检查与连接之间仍可能发生重绑定；需要出站代理/防火墙将允许目标落实到网络层。已发出请求不能撤回。
- 审核 Schema 只能检测接口变化，不能证明远端实现真的是只读。服务代码审查、服务端最小权限及供应链管理仍然必要。
- 本地管理员可修改 SQLite 和代码；审计不具备不可篡改保证。没有多租户隔离、生产 SSO、合规认证。
- 工具记录暂未实现保留期清理；本地数据和备份需要单独的访问控制、清理与加密策略。
- 真实企业远端和千问质量仍需配置后验证。HTTP MockTransport 测试验证协议契约，不能代替供应商联调。

## 验证与维护

```powershell
.venv\Scripts\python.exe -m pytest tests/test_mcp_harness.py tests/test_mcp_transport.py -q
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe scripts/check_secrets.py
.venv\Scripts\python.exe scripts/check_secrets.py --history
```

`check_secrets.py` 只读 Git index 或已提交历史，报告文件和行号，不打印命中的密钥值；已核实的旧合成密钥夹具采用精确测试路径与 SHA-256 例外，不豁免整个测试目录。它是启发式泄露检查，不替代完整的 secret scanning。若密钥已提交，即使随后删除也要先在供应商处吊销/轮换，再清理历史和副本。

更新远端工具时：停用远程连接器 → 审查服务实现及 Schema → 更新本地契约与回归测试 → 测试通过 → 重启 → 管理员重置熔断 → 显式只读联调。不要为了让健康检查变绿而自动接受服务返回的新 Schema。

参考：[官方 Python SDK 1.x](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x)、[MCP 安全实践](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)。
