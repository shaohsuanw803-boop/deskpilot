# 交付状态

[English](en/implementation-status.md) · [中文首页](../README.zh-CN.md)

范围：本地完整 IT 服务台作品、千问云端适配器、带来源和权限检查的 RAG。以下“已实现”描述代码交付，不代表生产验收或真实云模型质量达标。

- [x] SQLite 持久化、演示身份、权限策略和模块契约。
- [x] 文档解析、版本发布/撤回、管理员预览、导入重试、混合检索与引用核验。
- [x] 千问聊天、`text-embedding-v4`、`qwen3-rerank` 适配器与故障降级。
- [x] LangGraph 工作流、持久化审批、模拟软件权限工具、技能版本、记忆与预算记录。
- [x] 六个 Web 工作区接入实际后端 API，包含 MCP 连接器与执行控制。
- [x] 六工作区默认英文、显式中文切换；语言选择持久化、任务语言恢复、原文证据保留；英文 README 与七份英文技术指南。
- [x] 官方 MCP SDK stdio 真实联调、可配置 Streamable HTTP、服务状态与本人设备查询、Schema 摘要固定、配额、熔断、执行 hooks。
- [x] Git index/历史密钥扫描，已核实的合成测试密钥采用精确路径与哈希例外。
- [x] 40 篇虚构中文知识、80 道按 family 隔离的 dev/test 评测题。
- [x] 授权、知识生命周期、提供商故障、流程恢复等自动化测试代码。
- [x] 真实本地检索和记忆实验报告，参见[评测说明](evaluation.md)。
- [x] Windows/POSIX 启动脚本、锁定依赖、接入/维护文档、离线 CI 和手动云评测。
- [x] 2026-09-30 后端回归：81 passed in 50.71s；Ruff、前端生产构建和 Prettier 检查通过。uv 锁文件离线一致性检查已于 2026-09-29 通过。
- [x] 2026-10-06 MCP 增强后回归：96 passed in 58.30s；Ruff、依赖锁一致性、TypeScript、Vite、Prettier 通过。见 [MCP 验证记录](reports/mcp-harness-verification.md)。
- [x] 2026-10-06 双语版本回归：104 passed in 68.73s；6 项前端语言测试、Ruff、TypeScript、Vite、Prettier 通过。见 [双语验证记录](reports/bilingual-verification.md)。
- [x] 蓝白界面浏览器检查和 JPG 截图已保存，另保留首版旧配色录屏；390px 移动布局已验证，手机菜单交互待真机复核，具体日期与覆盖范围见[浏览器验收记录](browser-verification.md)。

真实 Qwen 付费调用、dense/hybrid/rerank 云端质量和实际云费用**未测**；需配置自己的 API 凭据后显式运行，不能用模拟 HTTP 测试或 BM25 报告代替。远程 MCP 协议适配器经过 HTTP 夹具测试，真实企业服务仍待联调。生产 SSO、真实权限写入、防篡改审计和企业合规认证**未实现**。
