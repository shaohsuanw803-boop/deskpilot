# DeskPilot 检索评测

- 时间（UTC）：2026-09-29T09:38:15.460433+00:00
- 模式：`demo`；split：`dev`；语料 SHA256：`4da4e0b4036f03c22cb9bc328deea0c1a654c045dc0b63c20664f55e036695bc`
- 文档：40；问题：40；Python：3.11.7
- 使用实际 KnowledgeService 和新建临时数据库；没有通过 gold label 路由答案。

| 策略 | 状态 | 已测/总数 | Hit@5 | Recall@10 | MRR@5 | 行为准确率 | ACL泄露数 | p50/p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| bm25 | measured | 40/40 | 0.9444 | 0.9444 | 0.9306 | 0.925 | 0 | 194.15/265.51 |
| dense | unmeasured | 0/40 | — | — | — | — | — | —/— |
| hybrid | unmeasured | 0/40 | — | — | — | — | — | —/— |
| hybrid_rerank | unmeasured | 0/40 | — | — | — | — | — | —/— |

## 统计边界

- Hit@5/MRR@5 仅计算有标准来源的 answer 问题，按文档去重；它们不是生成答案事实准确率。
- Recall@10 对每个 answer 问题计算前10个实际排序文档与 gold 集合交集占 gold 集合的比例，再宏平均；缺少完整排序 trace 时记为未测。
- 行为准确率比较 ready、needs_clarification、no_evidence；deny 要求没有证据返回。ACL 泄露另按服务端 can_read 检查证据和 trace 中的文档 ID。
- 注入问题只衡量检索命中；是否阻止工具和数据外发由安全测试验证，本报告不把检索命中视为注入防护通过。
- unmeasured 表示缺云配置或策略不可用，数值留空。partial 不可与完整评测直接比较；失败案例保留在 JSON。
- 延迟是同一进程中的顺序执行实测，含查询阶段；文档导入单列，缓存可能影响后续策略，不是生产吞吐测试。
- 本次只评测检索，不执行生成模型。供应商未报告 usage 的调用保持 unknown，预算预留不冒充实际账单。
- dev 可用于调参；test 按 family 隔离，应在参数冻结后才用于最终验收。合成小语料结果不代表真实企业效果。

## 用量

```json
{
  "ingestion": {
    "calls": 0,
    "reported_calls": 0,
    "unknown_calls": 0,
    "reported_input_tokens": 0,
    "reported_output_tokens": 0,
    "reported_cost_cny": 0,
    "budget_charged_cny": 0
  },
  "retrieval": {
    "calls": 0,
    "reported_calls": 0,
    "unknown_calls": 0,
    "reported_input_tokens": 0,
    "reported_output_tokens": 0,
    "reported_cost_cny": 0,
    "budget_charged_cny": 0
  },
  "total": {
    "calls": 0,
    "reported_calls": 0,
    "unknown_calls": 0,
    "reported_input_tokens": 0,
    "reported_output_tokens": 0,
    "reported_cost_cny": 0,
    "budget_charged_cny": 0
  }
}
```

## 失败与未测原因

- `bm25/outlook_offline-2`：status=needs_clarification; retrieved=['outlook-offline', 'outlook-search']
- `bm25/disk-2`：status=ready; retrieved=['software-license', 'teams-mic-win', 'software-install', 'teams-mic-mac']
- `bm25/mac_disk-2`：status=needs_clarification; retrieved=['macos-storage', 'disk-cleanup', 'update-restart']
- `bm25/it_acl-1`：status=ready; retrieved=['asset-return', 'vpn-macos-permission', 'vpn-macos-profile', 'vpn-mfa-clock', 'vpn-691-win11']
- `bm25/office_mac-2`：status=ready; retrieved=['printer-win11', 'update-restart', 'teams-mic-win', 'bitlocker-recovery', 'vpn-691-win11']
- `dense/vpn809-1`：云配置缺失或未启用：--cloud not enabled
- `dense/vpn809-2`：云配置缺失或未启用：--cloud not enabled
- `dense/mac_extension-1`：云配置缺失或未启用：--cloud not enabled
- `dense/mac_extension-2`：云配置缺失或未启用：--cloud not enabled
- `dense/mfa_clock-1`：云配置缺失或未启用：--cloud not enabled
- `dense/mfa_clock-2`：云配置缺失或未启用：--cloud not enabled
- `dense/dns-1`：云配置缺失或未启用：--cloud not enabled
- `dense/dns-2`：云配置缺失或未启用：--cloud not enabled
- `dense/unlock-1`：云配置缺失或未启用：--cloud not enabled
- `dense/unlock-2`：云配置缺失或未启用：--cloud not enabled
- `dense/new_phone-1`：云配置缺失或未启用：--cloud not enabled
- `dense/new_phone-2`：云配置缺失或未启用：--cloud not enabled
- `dense/admin_install-1`：云配置缺失或未启用：--cloud not enabled
- `dense/admin_install-2`：云配置缺失或未启用：--cloud not enabled
- `dense/outlook_offline-1`：云配置缺失或未启用：--cloud not enabled
- `dense/outlook_offline-2`：云配置缺失或未启用：--cloud not enabled
- `dense/mic_windows-1`：云配置缺失或未启用：--cloud not enabled
- `dense/mic_windows-2`：云配置缺失或未启用：--cloud not enabled
- `dense/excel_protection-1`：云配置缺失或未启用：--cloud not enabled
- `dense/excel_protection-2`：云配置缺失或未启用：--cloud not enabled
- `dense/printer_mac-1`：云配置缺失或未启用：--cloud not enabled
- `dense/printer_mac-2`：云配置缺失或未启用：--cloud not enabled
- `dense/printer_release-1`：云配置缺失或未启用：--cloud not enabled
- `dense/printer_release-2`：云配置缺失或未启用：--cloud not enabled
- `dense/license-1`：云配置缺失或未启用：--cloud not enabled
- 其余 95 项见配套 JSON。
