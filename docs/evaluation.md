# 评测方法

语料为 40 篇明确标注虚构的中文 IT 文档；80 个问题为 40 个 family，每个 family 两种表述。dev/test 各 20 个 family，不跨 split。`scripts/build_fixtures.py` 仅用于重建版本化测试资料，不参与线上检索。

## 可复现运行

```bash
python scripts/evaluate.py --split dev
python scripts/evaluate.py --split test --output docs/reports/local-test
# 以下命令是对付费云检索的显式选择：
python scripts/evaluate.py --cloud --split test --output docs/reports/cloud-test
```

评测创建临时数据库、通过真正的导入和发布接口导入资料，然后调用 `KnowledgeService.search`。不读取或修改应用用户数据目录。报告包含语料 hash、运行时间、平台、Python 版本和逐题结果。

四种策略：`bm25`、`dense`、`hybrid`、`hybrid_rerank`。本地默认只测 BM25，其他策略列 `unmeasured`。云请求失败/降级不当作成功执行，也不拿 BM25 填充云策略分数。结果 `partial` 说明部分题目未完整执行，不能直接与完整策略比较。

## 指标与分母

| 指标 | 分母或含义 | 不能说明什么 |
|---|---|---|
| Hit@5 | 有标准来源的 answer 问题中，前 5 个去重文档命中任一标准来源 | 不等于多段证据齐全或最终答案正确 |
| Recall@10 | 每题前 10 个实际排序文档与标准来源集合的交集 / 标准来源数，再对 answer 问题宏平均 | 不等同于 Hit@5；缺少排序 trace 时未测 |
| MRR@5 | 同一分母下首个相关文档倒数排名，未命中计零 | 不评估后续所有来源 |
| 行为准确率 | 全部完整执行题目中 answer/clarify/abstain/deny 的状态匹配 | 不是人工语义质量评分 |
| ACL 泄露数 | evidence 和候选 trace 中服务端授权检查失败的文档数 | 不涵盖全部旁路和生产安全风险 |
| p50/p95 | 本机顺序查询墙钟时间，导入另列 | 不是并发压力测试；受缓存和网络影响 |
| reported token / cost | 仅供应商实际报告用量的调用 | 不能把未知请求算零，也不是最终账单 |

本阶段不调用生成模型做评测，因此不报告“答案事实准确率”。注入类题目只评估该找哪份安全知识；真正的提示注入、工具越权、敏感内容外发由独立行为测试验证。

## 防止评测污染

- gold labels 仅在 `fixtures/eval` 和评测脚本读取；应用代码不得导入 `questions.json`。
- 先用 dev 调整分词、切块、融合、候选数和阈值，记录变更及模型/价格版本。
- 冻结参数后再跑 test。不要根据某一道 test 问题加入专用关键词路由；发现失败后应归纳一般失效模式，并建立新一轮独立测试。
- CI 可检查 schema、family 隔离和 fixture 完整性；PR 不使用任何云 Key。手动云 workflow 使用独立、低额度的凭据。

手动 workflow 需要在 GitHub 仓库创建 `cloud-evaluation` environment，配置 Key/base URL/endpoint secrets，以及模型名、价格、日期 variables（名称见工作流文件）。建议设置该 environment 的审批人。工作流成功只表示脚本完成；若配置缺失，报告仍会明确标记 `unmeasured`，不能把绿色 workflow 当作云效果验收。

## 成本比较与统计边界

检索评测包含初始化 embedding 成本和查询 embedding/rerank 成本，两者分开列示。正式比较应使用相同语料、模型快照、价格日期与查询集，区分冷启动和热缓存。未知 usage 单列；预算预留不能写成实际费用。

独立的[记忆实验](reports/memory-baseline.md)已比较全历史与实际构造上下文的估算输入量、字符串事实保留和恢复。真实模型的任务成功率及实际付费成本仍未测；以后进行云对照时，需计入所有摘要/提取/回答调用的 token 和总成本，不把估算减少或生成耗时直接换算成企业人力成本。
