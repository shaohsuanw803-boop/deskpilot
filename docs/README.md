# Documentation / 文档导航

[English homepage](../README.md) · [中文首页](../README.zh-CN.md)

Guides cover local installation, system design, evaluation, and maintenance.

文档涵盖本地安装、系统设计、评测与维护。

## Guides / 使用与设计

| Topic / 主题                                     | English                                              | 简体中文                             |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------ |
| Setup and guided demo / 安装与演示               | [Get started](en/getting-started.md)                 | [快速开始](getting-started.md)       |
| Architecture and flows / 架构与流程              | [Bilingual architecture](architecture.md)            | [双语架构](architecture.md)          |
| RAG lifecycle / RAG 生命周期                     | [RAG design](en/rag-design.md)                       | [RAG 设计](rag-design.md)            |
| Tools and execution / 工具与运行控制             | [MCP & harness](en/mcp-harness.md)                   | [MCP 与 Harness](mcp-harness.md)     |
| Request reliability / 请求可靠性                | [Runtime contract](runtime-reliability.md)            | [入口与幂等契约](runtime-reliability.md#中文说明) |
| Context and preferences / 上下文与偏好           | [Memory design](en/memory-design.md)                 | [记忆设计](memory-design.md)         |
| Optional Qwen connection / 可选千问接入          | [Provider setup](en/provider-setup.md)               | [接入指南](provider-setup.md)        |
| Quality and cost measurement / 质量与费用测量    | [Evaluation](en/evaluation.md)                       | [评测方法](evaluation.md)            |
| Maintenance and rollback / 维护与回退            | [Operations](en/operations.md)                       | [运维手册](operations.md)            |
| Capabilities and remaining work / 已实现与待验证 | [Implementation status](en/implementation-status.md) | [实现状态](implementation-status.md) |
| Contribution / 贡献                              | [Contributing](../CONTRIBUTING.md)                   | [贡献指南](CONTRIBUTING.zh-CN.md)    |
| Security / 安全                                  | [Security](../SECURITY.md)                           | [安全说明](SECURITY.zh-CN.md)        |

## Evidence / 验证记录

Reports are dated observations, not live dashboards or production guarantees. / 报告是对应日期的实测记录，不是实时状态或生产保证。

- [Runtime reliability / 运行可靠性验证](reports/runtime-reliability-verification.md) — 2026-10-06; 195 backend and 9 frontend tests.
- [Bilingual release / 双语版本验证](reports/bilingual-verification.md) — earlier language release, 2026-10-06; 104 backend and 6 frontend tests.
- [MCP and harness / MCP 与运行控制验证](reports/mcp-harness-verification.md) — protocol, authorization, recovery, and failure cases.
- [Retrieval development set / 检索开发集](reports/retrieval-baseline.md) · [held-out set / 保留测试集](reports/retrieval-heldout.md) — local BM25; cloud strategies explicitly unmeasured.
- [Memory experiment / 记忆实验](reports/memory-baseline.md) — estimated context size and string-level fact retention, not paid-model savings.
- [Earlier browser checks / 早期浏览器验证](browser-verification.md) · [historical screenshots and video / 历史演示素材](media) — predates the bilingual/MCP interface; retained as release history.

## Further reading / 深入阅读

- [Design references / 工程参考](research-notes.md)
- [Module interfaces / 模块接口](implementation-contract.md)
- [Source code](../backend/deskpilot) · [Frontend](../frontend/src) · [Regression tests](../tests)
