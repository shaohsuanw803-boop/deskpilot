"""Offline context-size and exact fact-retention experiment; no model-quality claims."""
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from deskpilot.config import Settings
from deskpilot.db import Store
from deskpilot.policy import USERS
from deskpilot.rag_text import token_count
from deskpilot.workflow import DeskService


class ContextProbe:
    def __init__(self):
        self.contexts = []

    def answer(self, query, user, run_id, context=None):
        self.contexts.append(context)
        return {'answer': '这是固定的离线测试回复，用来测量上下文长度，不是千问输出。' * 24,
                'status': 'completed', 'citations': [], 'retrieval': {}}


def main():
    rows = []
    with tempfile.TemporaryDirectory(prefix='deskpilot-memory-') as directory:
        settings = Settings(_env_file=None, data_dir=Path(directory))
        store = Store(settings.data_dir / 'app.db')
        probe = ContextProbe()
        service = DeskService(store, settings, probe)
        for case in range(20):
            issue = f'Windows 11 VPN 809 案例 {case + 1} 无法连接'
            progress = '已经重启电脑，仍然无法连接'
            run = service.run(USERS['alice'], issue)
            thread_id = run['thread_id']
            full_history = [{'role': 'user', 'content': issue}, {'role': 'assistant', 'content': run['answer']}]
            full_tokens = layered_tokens = 0
            for turn in range(10):
                query = progress if turn == 0 else '继续处理'
                if turn == 4:
                    service.close()
                    service = DeskService(store, settings, probe)
                    service.recover()
                run = service.run(USERS['alice'], query, thread_id=thread_id)
                context = {k: v for k, v in probe.contexts[-1].items() if k != 'dependencies'}
                # Both include the same skill and current input; only history strategy differs.
                full = {**context, 'task': {}, 'messages': full_history, 'query': query}
                layered = {**context, 'query': query}
                full_tokens += token_count(json.dumps(full, ensure_ascii=False))
                layered_tokens += token_count(json.dumps(layered, ensure_ascii=False))
                full_history += [{'role': 'user', 'content': query}, {'role': 'assistant', 'content': run['answer']}]
            final = json.dumps(probe.contexts[-1], ensure_ascii=False)
            rows.append({'case': case + 1, 'full_history_input_tokens_estimated': full_tokens,
                         'layered_input_tokens_estimated': layered_tokens,
                         'retained_initial_issue': issue in final,
                         'retained_reported_progress': progress in final,
                         'resumed_after_restart': run['status'] == 'completed'})
        service.close()
        store.close()
    full = sum(row['full_history_input_tokens_estimated'] for row in rows)
    layered = sum(row['layered_input_tokens_estimated'] for row in rows)
    report = {'generated_at': datetime.now(timezone.utc).isoformat(),
              'scope': 'offline deterministic context assembly; synthetic fixed replies; not cloud quality',
              'cases': len(rows), 'rounds_per_case': 11, 'service_restarts': 20,
              'full_history_input_tokens_estimated': full, 'layered_input_tokens_estimated': layered,
              'input_token_reduction_estimated': 1 - layered / full,
              'exact_fact_retention': sum(r['retained_initial_issue'] and r['retained_reported_progress'] for r in rows) / len(rows),
              'restart_continuity': sum(r['resumed_after_restart'] for r in rows) / len(rows),
              'cloud_calls': 0, 'real_cloud_cost_cny': None, 'real_task_success_rate': None,
              'limitations': ['字符启发式估算，非供应商 tokenizer', '固定长回复会影响节省比例',
                              '未执行模型，不能证明语义事实保留、真实任务完成率或真实费用节省'], 'results': rows}
    target = Path(__file__).resolve().parents[1] / 'docs' / 'reports'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'memory-baseline.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    markdown = f'''# 分层上下文离线实验

运行时间：{report['generated_at']}。20 个虚构案例，每例 11 轮，并在第 6 轮前重启服务。
使用真实 DeskService 的上下文组装与持久化，回答由固定测试桩提供，没有调用千问。

| 指标 | 实测值 |
|---|---:|
| 全历史累计输入 token（估算） | {full:,} |
| 分层上下文累计输入 token（估算） | {layered:,} |
| 估算输入缩减 | {1 - layered / full:.1%} |
| 原始问题与已尝试步骤的字符串保留 | {report['exact_fact_retention']:.0%} |
| 重启后续办工程检查 | {report['restart_continuity']:.0%} |
| 云端调用 | 0 |
| 真实费用与真实任务完成率 | 未测 |

策略保存初始请求、最多 8 条用户明确报告的进度、最近 4 轮有效对话及最近 3 条确认偏好。
内容每次使用前重新鉴权，并检查引用、云端标记和偏好版本。没有自动付费摘要。
这里的“进度”是用户自述，不是已验证的企业知识。记忆编辑和删除另有自动回归测试。

**边界：** token 为字符启发式估算；固定长回复影响比例。字符串存在不代表语义正确，
不能据此声称真实千问成本节省、答案质量或任务完成率。真实评测需相同问题和模型对照，
合计生成、嵌入、重排、摘要与重试用量；缺失用量不得当作零。

复现：`.venv/Scripts/python.exe scripts/evaluate_memory.py`（Linux 使用 `.venv/bin/python`）。
'''
    (target / 'memory-baseline.md').write_text(markdown, encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
