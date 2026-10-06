# 参与贡献

[English](../CONTRIBUTING.md) · [中文首页](../README.zh-CN.md)

请先说明可复现问题、操作系统、Python/Node 版本、demo/cloud 模式和脱敏运行 ID。不要提交 API Key、真实企业文档、个人信息或供应商完整响应。

## 开发与验证

```bash
uv sync --frozen --extra dev
# 没有 uv 时：python -m pip install -r requirements.lock.txt
# 然后：python -m pip install --no-deps -e .
python -m pytest -q
python -m ruff check backend tests scripts
python scripts/evaluate.py --split dev
cd frontend
npm ci
npm run build
npm run format:check
```

功能修改保持单一目的。权限、文档生命周期、审批、记忆删除、外发或预算变更必须添加能复现失效的测试；不要仅测试与实现相同的常量。更改提供商请求/响应格式时使用 mock HTTP 契约测试，PR CI 不调用付费接口。

修改检索策略先使用 dev 集，记录为什么改变和实际指标差异。不要查看 test 标签后添加仅对该问题有效的分支。`fixtures/eval` 不得被后端运行代码读取。若调整语料，运行 `tests/test_corpus_integrity.py`，保留虚构声明和 family 隔离。

新技能版本需负责人、工具许可、评测与激活记录；新共享知识需审核。文档应说明能力与限制，不把模拟适配器写成真实企业连接器。

提交 PR 时列出问题、用户可见结果、验证命令、实际通过/失败及未测部分。依赖与模型更新尽量分开，确保问题可回退。使用 MIT 许可贡献代码，并保留引用资料或第三方代码的许可。
