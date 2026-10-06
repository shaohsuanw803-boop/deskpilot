# 工程参考与选择

调研日期：2026-09-29。这里记录借鉴的机制，不宣称项目完整复刻了平台的商业能力。

| 参考 | 借鉴机制 | 本项目选择 |
|---|---|---|
| LangGraph | 显式任务状态、持久化、中断与继续 | 单机 SQLite 检查点，审批状态落盘，不让模型决定授权 |
| Letta | 常驻与按需记忆、版本化知识和技能 | 任务状态、已确认偏好、审核后共享知识分层 |
| Mem0 | 按用户/Agent 范围存储并按需召回 | 服务端确定用户范围，不能信任模型传入的用户 ID |
| Qdrant | 向量召回、payload 过滤、独立索引 | local 模式提供单机索引，SQLite 保持权威来源 |
| 百炼 | 中文聊天、embedding、rerank 三种模型接口 | 独立云适配器、预算预留、usage 记录与失败降级 |

Letta 当前活跃源码已移至 [letta-code](https://github.com/letta-ai/letta-code)，旧 V1 server 是历史架构；其 [MemFS](https://docs.letta.com/concepts/memfs) 把常驻上下文与按需文件分开。现 [共享记忆仓库](https://docs.letta.com/concepts/shared-memory) 要求云端 Agent，不能把它误写成完全等同的本地功能。

Mem0 [当前 OSS/Platform 比较](https://docs.mem0.ai/platform/platform-vs-oss)区分基础记忆与托管平台的图、时间和后台整合能力；[自托管套件](https://docs.mem0.ai/open-source/setup)另有认证、Key 和请求审计。SDK 与服务器范围不同，集成需要固定版本并验证契约。DeskPilot 的记忆生命周期直接由应用和 SQLite 管理，没有独立记忆服务。

[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) 是恢复执行的基础，但恢复业务动作还要考虑幂等、审批时效和状态变化。检查点不是“再次自动批准”操作的凭据。

[Qdrant local](https://github.com/qdrant/qdrant-client) 适合小型单机部署，不提供多 worker 共享目录能力。扩展到多实例需要迁移到 server 模式并重新验证数据生命周期。

项目围绕检索授权、引用有效性、审批消费和预算结算建立行为约束与失败回归。当前实现采用云端模型适配器和本地持久化，未引入 GraphRAG、本地大模型或分布式部署。
