# 快速上手

[项目首页](../README.zh-CN.md) · [English](en/getting-started.md)

在本机运行虚构企业 IT 服务台，不需要模型密钥或 Docker。安装依赖需要联网；默认演示使用本地关键词检索、原文摘录、持久化工作流和内置 MCP 服务。

## 环境要求

- Python 3.11 或更新版本；CI 在 Windows 和 Linux 上使用 Python 3.11。
- 推荐使用 Node.js 22.12+ 和 npm；前端 CI 使用 Node.js 22，现有安装方式也支持 Node.js 20.19+。
- Git。`uv` 可选：安装脚本优先使用冻结的 uv 锁文件，否则使用固定版本的 pip 依赖清单。

## 安装与启动

克隆并进入项目：

```sh
git clone https://github.com/shaohsuanw803-boop/deskpilot.git
cd deskpilot
```

**Windows PowerShell**

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

**macOS / Linux**

```sh
bash scripts/setup.sh
bash scripts/start.sh
```

安装脚本使用锁定的依赖，仅在 `.env` 不存在时从空白示例创建它，并初始化 40 份虚构知识文档。已有配置和数据会保留。启动脚本同时运行 API 和前端，使用期间保持终端打开。

- 应用：[http://localhost:5173](http://localhost:5173)
- API 文档：[http://localhost:8000/docs](http://localhost:8000/docs)
- 停止：在启动终端按 **Ctrl+C**；脚本会停止本次启动的后端进程。

界面默认使用 **English**。点击顶部 **中文** 切换中文，点击 **English** 切回；只有手动选择的语言会保存。新任务保存当时的回答语言，恢复执行时沿用。原始文档、引用、用户消息和已保存事实保留原语言；随项目提供的知识库是中文语料。

## 三分钟演示

1. **查看回答与依据。** 在 **Demo identity / 演示身份** 中选择员工 **Alice Lin / 林晓**，提问 `我的 Windows 11 使用星桥 VPN 5.2，连接提示错误 809，应该怎么排查？` 打开回答下方的来源卡片，再查看检索与执行轨迹。演示回答是整理后的原文摘录，不是付费模型输出。
2. **查看真实 MCP 通信。** 在 **Connectors & execution / 连接器与执行控制** 中，使用本地 IT 演示连接器点击 **查询 VPN 状态** 和 **查看我的设备**。通信使用 MCP 协议，返回数据是虚构的。也可先在输入框下方的 **MCP 预检** 中选择它，再提交新的 VPN 问题。观测结果与正式知识引用分开展示，不会发送给云端模型。
3. **完成审批。** 以林晓身份提交 `我想申请 Visio 的标准权限。`，任务将暂停等待审核。把演示身份切换到 **Chen / 陈工**（IT）或 **Administrator / 管理员**，打开 **Approval queue / 审批队列**，核对申请人和具体参数后点击 **批准执行**。打开关联运行查看模拟开通结果。员工身份不能审批，也不会修改真实软件账号。

这些身份用于演示服务端权限控制，不代表生产认证。完整能力边界见[实现状态](implementation-status.md)。

## 构建前端并通过一个本地地址演示

如果展示时不需要 Vite 开发服务器，先停止启动脚本，再构建前端：

```sh
cd frontend
npm run build
cd ..
```

回到项目根目录启动后端：

```powershell
# Windows
.\.venv\Scripts\python.exe -m deskpilot.cli serve
```

```sh
# macOS / Linux
.venv/bin/python -m deskpilot.cli serve
```

打开 [http://localhost:8000](http://localhost:8000)。存在 `frontend/dist` 时，FastAPI 会提供已构建的前端文件。这是本地展示方式，不是生产部署配置；修改前端后需要重新构建。

## 之后再接入云端模型

默认 `APP_MODE=demo` 不调用千问生成、向量或重排模型。适配代码已经实现，实际付费行为和检索效果仍需使用你的账号验证。按照[千问接入指南](provider-setup.md)配置各接口、价格，检查连通性，再显式执行云端向量入库。云端配置不完整时会报错，不会静默替换模型。

密钥只放在项目根目录已忽略的 `.env` 中，不要放入前端、文档或截图。远程 MCP 单独启用，填写千问配置不会自动打开它；接入外部服务前请阅读 [MCP 与 harness](mcp-harness.md)。

## 常见问题

| 现象                    | 检查方式                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| PowerShell 拒绝执行脚本 | 遵循本机脚本执行策略；受管设备联系管理员，不要关闭系统级防护。                                                 |
| 后端启动后退出          | 查看 `.cache/logs/backend-*`，检查依赖和端口 8000 是否被占用；只停止你确认用途的进程。                         |
| 页面打开但 API 请求失败 | 使用 Vite 输出的界面地址；开发代理固定指向 8000，仅修改后端端口不会同步改变代理。                              |
| 索引提示存储锁冲突      | 停止使用同一数据目录的旧 DeskPilot 实例。本地 Qdrant 使用单后端 worker、单客户端，不要让多个后端争用同一目录。 |
| 8000 端口显示旧界面     | 重新执行 `npm run build`；Vite 地址提供开发代码，8000 端口提供上一次构建。                                     |
| 云端或连接器请求失败    | 查看运行轨迹中的安全错误提示，并参考对应接入指南。凭据、限流或超时问题不应通过删除 `data/` 解决。              |

备份与升级见[维护手册](operations.md)，测试和贡献方式见[贡献指南](CONTRIBUTING.zh-CN.md)。
