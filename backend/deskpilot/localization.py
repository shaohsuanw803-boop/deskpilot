"""Reviewed UI messages and bounded query aliases, never document translation.

Only call ``system_text`` for application-authored strings. User input, evidence,
citations, memory, audit payloads and external tool output are not translated.
"""
import re
from typing import Literal

Locale = Literal['en', 'zh-CN']


def request_locale(header: str | None) -> Locale:
    choices = []
    for order, part in enumerate((header or '').split(',')):
        pieces = part.strip().lower().split(';')
        language = pieces[0]
        try:
            quality = next((float(p.strip()[2:]) for p in pieces[1:] if p.strip().startswith('q=')), 1.0)
        except ValueError:
            continue
        if 0 < quality <= 1 and (language == 'zh' or language.startswith('zh-') or language == 'en' or language.startswith('en-')):
            choices.append((quality, -order, 'zh-CN' if language.startswith('zh') else 'en'))
    return max(choices)[2] if choices else 'en'


MESSAGES = {
    '知识库原文摘录：': 'Knowledge base excerpts (original language):',
    '依据': 'Evidence', '处理步骤': 'Troubleshooting steps', '下一步': 'Next steps',
    '当前命中内容未给出独立的操作步骤，请先核对上述适用范围。': 'The retrieved excerpts do not contain separate steps. Check the applicability above first.',
    '若仍未解决，请记录产品版本、完整报错和已尝试步骤后提交服务台工单。': 'If the issue persists, create a helpdesk ticket with the product version, full error and steps already tried.',
    '没有找到当前可访问且足以回答的知识依据。请补充产品、版本和具体报错，或提交服务台工单。': 'No accessible knowledge provides sufficient evidence. Add the product, version and exact error, or create a helpdesk ticket.',
    '命中资料只有标题或说明，缺少可用于回答的正文。请补充信息或联系服务台。': 'The retrieved sources contain only headings or notices. Add details or contact the helpdesk.',
    '现有资料不足以可靠回答这个问题。请补充具体报错或联系服务台核实。': 'The available sources are insufficient for a reliable answer. Add the exact error or contact the helpdesk.',
    '本次使用的上下文或访问权限已变化，请重新发起查询。': 'The context or access permissions have changed. Submit the query again.',
    '来源状态已变化，请重新查询或联系服务台。': 'The source status has changed. Search again or contact the helpdesk.',
    '此回答依赖的来源或偏好已变化，或当前身份无权查看，请重新检索。': 'The sources or preferences have changed, or this identity no longer has access. Search again.',
    '当前任务禁止云端处理': 'Cloud processing is disabled for this task.',
    'demo 模式只有真实 BM25，没有模拟向量结果。': 'Demo mode provides real BM25 retrieval; vector results are unavailable.',
    '问题包含凭据样式内容，禁止云端传输': 'The query contains credential-like content; cloud transmission is blocked.',
    '部分已发布版本尚未建立当前模型的向量索引；请运行 index-cloud。': 'Some published versions lack a vector index for the current model. Run index-cloud.',
    '命中禁止出站的来源，答案在本地摘录': 'Some sources prohibit external transmission; excerpts are produced locally.',
    '识别为软件权限申请': 'Identified a software access request.',
    '检索适用知识与排查依据': 'Retrieving applicable knowledge and troubleshooting evidence.',
    '执行权限过滤、检索与来源检查': 'Applying access filters, retrieval and source validation.',
    '已保存具体申请，等待 IT 审批；尚未执行权限变更': 'The request is saved and awaiting IT approval. No access change has been executed.',
    '请 IT 审核本次模拟权限申请': 'IT review is required for this simulated access request.',
    'IT 已拒绝本次申请，未执行权限变更。': 'IT rejected this request. No access change was executed.',
    '模拟权限变更与幂等执行凭证已原子保存': 'The simulated access change and idempotency receipt were saved atomically.',
    '申请已准备好，等待 IT 审批。你可以离开页面，稍后继续。': 'Your request is ready and awaiting IT approval. You can leave this page and return later.',
    '待 IT 确认的软件': 'Software to be confirmed by IT',
    '任务执行失败，请查看运行记录并重试。': 'The task failed. Check the run record and try again.',
    '服务中断发生在检查点保存前，请重新提交。': 'The service stopped before saving a checkpoint. Submit the task again.',
    '恢复执行失败': 'Task recovery failed',
    '不接受来自其他站点的写入请求。': 'Write requests from another site are not accepted.',
    '请先在演示身份选择器中选择身份。': 'Select a demo identity first.',
    '记录不存在。': 'The record does not exist.',
    '未知演示身份。': 'Unknown demo identity.',
    '当前未启用完整云端配置，未发出任何外部请求。': 'Cloud configuration is incomplete. No external request was sent.',
    '请先解决工单并填写解决方法。': 'Resolve the ticket and provide the resolution first.',
    'metadata 必须是 JSON 对象。': 'metadata must be a JSON object.',
    '当前身份没有执行此操作的权限。': 'This identity does not have permission to perform this operation.',
    '无权访问此记录。': 'You do not have permission to access this record.',
    '检测到凭据或密钥样式的内容，已阻止云端发送。请先脱敏。': 'Credential-like content was detected and blocked from cloud transmission. Redact it first.',
    '长期偏好必须由用户明确确认后保存。': 'Long-term preferences require explicit user confirmation before saving.',
    '偏好内容需为 1–500 个字符。': 'Preferences must contain 1–500 characters.',
    '记忆不存在或无权编辑。': 'The memory does not exist or you do not have permission to edit it.',
    '记忆不存在或无权删除。': 'The memory does not exist or you do not have permission to delete it.',
    '问题不能为空，且最多 8,000 个字符。': 'The question must contain 1–8,000 characters.',
    '无权继续此会话。': 'You do not have permission to continue this conversation.',
    '工单不存在。': 'The ticket does not exist.',
    '审批不存在。': 'The approval does not exist.',
    '审批决定无效。': 'Invalid approval decision.',
    '审批参数发生变化，请重新申请。': 'The approval parameters have changed. Submit a new request.',
    '技能版本已变化，请重新申请审批。': 'The skill version has changed. Request approval again.',
    '权限策略已变化，请重新申请审批。': 'The permission policy has changed. Request approval again.',
    '审批已过期，请重新申请。': 'The approval has expired. Submit a new request.',
    '操作尚未获得有效审批。': 'This operation does not have valid approval.',
    '已达到本次任务工具步骤上限，请交由人工继续处理。': 'The task tool-step limit has been reached. Hand off to IT.',
    '文件超过 20 MB 限制': 'The file exceeds the 20 MB limit.',
    'roles 必须是有效角色列表': 'roles must be a list of valid roles.',
    'cloud_allowed 必须是布尔值': 'cloud_allowed must be a boolean.',
    'allowed_users 必须是用户 ID 字符串列表': 'allowed_users must be a list of user ID strings.',
    '入库任务不存在': 'The ingestion job does not exist.',
    '文档不存在': 'The document does not exist.',
    '版本尚未准备完成，不能发布；请检查入库任务并重试。': 'This version is not ready to publish. Check the ingestion job and retry.',
    '来源已撤回、更新，或当前用户无权读取。': 'The source was withdrawn or updated, or this user no longer has access.',
    '未知检索策略': 'Unknown retrieval strategy.',
    'PDF 没有可提取的文字；扫描 PDF 需要先完成 OCR。': 'The PDF has no extractable text. Run OCR on scanned PDFs first.',
    '只支持 Markdown、TXT、DOCX 和文字型 PDF': 'Only Markdown, TXT, DOCX and text-based PDF files are supported.',
    '文件没有可提取内容': 'The file has no extractable content.',
    '技能不存在。': 'The skill does not exist.',
    '技能版本不存在。': 'The skill version does not exist.',
    '技能或当前身份没有调用此工具的权限。': 'The skill or current identity does not have permission to call this tool.',
    '此版本尚未通过当前内容对应的回归评测。请先运行评测。': 'This version has not passed regression evaluation for its current content. Run the evaluation first.',
    '未知连接器。': 'Unknown connector.',
    '连接器不存在或尚未启用。': 'The connector does not exist or is disabled.',
    '任务不属于当前用户或已停止。': 'The task belongs to another user or has stopped.',
    '任务已超时，停止 MCP 调用。': 'The task timed out; MCP calls were stopped.',
    '工具不在本地审核白名单中。': 'The tool is not in the locally reviewed allowlist.',
    '设备查询只能使用当前登录身份。': 'Device lookup is restricted to the signed-in identity.',
    '连接器已熔断，请稍后再试或由管理员重置。': 'The connector circuit is open. Retry later or ask an administrator to reset it.',
    '已达到今日 MCP 调用次数上限。': 'The daily MCP call limit has been reached.',
    '已达到任务工具步骤上限。': 'The task tool-step limit has been reached.',
    'MCP 超过执行时限，结果已丢弃。': 'The MCP deadline was exceeded; the result was discarded.',
    'MCP 结果超过大小上限。': 'The MCP result exceeds the size limit.',
    'MCP 返回了其他身份或服务的结果。': 'MCP returned a result for a different identity or service.',
    'MCP 工具契约发生变化；维护人审核并更新本地契约后才能恢复调用。': 'The MCP contract changed. A maintainer must review and update the local contract before calls resume.',
    'MCP 参数或结果不符合审核契约。': 'The MCP arguments or result do not match the reviewed contract.',
    '远程 MCP 必须使用明确允许的 HTTPS 主机，不能包含凭据、查询参数或非标准端口。': 'Remote MCP requires an allowlisted HTTPS host without URL credentials, query parameters or nonstandard ports.',
    '远程 MCP 主机未解析到允许的公网地址。': 'The remote MCP host did not resolve to allowed public addresses.',
    '远程 MCP 缺少唯一的审核工具。': 'Remote MCP is missing a uniquely identified reviewed tool.',
    'MCP 没有返回有效的结构化结果。': 'MCP did not return a valid structured result.',
    '远程 MCP 尚未启用。': 'Remote MCP is disabled.',
    '远程 MCP 独立凭据未配置。': 'The dedicated remote MCP credential is not configured.',
    '禁止 MCP 重定向或向其他地址发送凭据。': 'MCP redirects and sending credentials to other addresses are prohibited.',
}


def system_text(text: str, locale: str = 'en') -> str:
    return text if locale == 'zh-CN' else MESSAGES.get(text, text)


def error_text(text: str, locale: str = 'en') -> str:
    if locale == 'zh-CN':
        return text
    if text in MESSAGES:
        return MESSAGES[text]
    match = re.fullmatch(r'(title|source|product|product_version|owner) 必须是字符串', text)
    if match:
        return f'{match[1]} must be a string.'
    # Do not expose unexpected request/provider content as a purported translation.
    return 'The operation could not be completed. Check the configuration and authorized run records.'


QUERY_ALIASES = (
    (r'\bstarbridge\b', '星桥'),
    (r'\b(?:connection\s+timeout|connection\s+timed\s+out)\b', '连接超时'),
    (r'\b(?:cannot|can\x27t|unable\s+to)\s+connect\b', '无法连接'),
    (r'\b(?:activation|activate)\b', '激活'),
    (r'\b(?:unlicensed|license\s+expired)\b', '未授权 许可证过期'),
    (r'\b(?:shared\s+mailbox)\b', '共享邮箱'),
    (r'\b(?:printer|printing)\b', '打印机'),
)


def expand_query(query: str) -> tuple[str, list[str]]:
    """Add a reviewed product/intent glossary; retain the complete original query.

    The glossary contains no evidence text, document IDs or evaluation labels.
    Version facets and error codes remain untouched and continue to constrain RAG.
    """
    aliases = [alias for pattern, alias in QUERY_ALIASES if re.search(pattern, query, re.I) and alias not in query]
    return query + (' ' + ' '.join(aliases) if aliases else ''), aliases


SKILL_LABELS = {
    'diagnose': ('Troubleshooting', 'Retrieve applicable knowledge and present evidence, troubleshooting steps and next actions.'),
    'diagnose-connected': ('Connected diagnostics', 'Run an explicit MCP service and personal device check before RAG. External observations stay local.'),
    'access-request': ('Software access request', 'Prepare a reviewable software access request and simulate execution after approval.'),
    'ticket-summary': ('Ticket to knowledge', 'Prepare a solved ticket as a knowledge candidate for human review.'),
}


def skill_display(package: dict, locale: str) -> dict:
    """Add display metadata without modifying signed repository manifests."""
    name, description = package.get('name', package['id']), package.get('description', '')
    if locale == 'en' and package['id'] in SKILL_LABELS:
        name, description = SKILL_LABELS[package['id']]
    result = {**package, 'display_name': name, 'display_description': description}
    if 'versions' in package:
        result['versions'] = [skill_display(version, locale) for version in package['versions']]
    return result
