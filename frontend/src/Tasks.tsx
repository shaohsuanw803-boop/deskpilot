import { useI18n, translate } from './i18n';
import { useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  GitBranch,
  History,
  KeyRound,
  ListChecks,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Ticket,
  Wifi,
  X,
} from 'lucide-react';
import {
  array,
  createRunSubmitter,
  date,
  displayUserName,
  errorText,
  get,
  isStaff,
  post,
  sid,
  useResource,
  type Data,
  type User,
} from './api';
import { Badge, Button, Empty, ErrorBox, Loading, Markdown, Modal, SourceCard } from './components';
import { Diagnostics } from './Connectors';

type Props = {
  user: User;
  mode: string;
  revision: number;
  onChange: () => void;
  onSource: (id: string) => void;
  onTrace: (data: Data) => void;
};

function promptOf(run: Data) {
  const t = translate;
  return run.message || run.query || run.retrieval?.query || t('IT 服务请求', 'IT service request');
}
export default function Tasks({ user, mode, revision, onChange, onSource, onTrace }: Props) {
  const { t, locale } = useI18n();
  const examples = [
    {
      icon: Wifi,
      category: t('连接与网络', 'Connectivity'),
      title: t('VPN 连接提示 809，怎么排查？', 'How do I fix VPN error 809?'),
      prompt: t(
        '我的 Windows 11 电脑连接 VPN 时提示错误 809，应该怎么排查？',
        'My Windows 11 computer gets VPN error 809. How can I troubleshoot it?',
      ),
    },
    {
      icon: BookOpen,
      category: t('办公软件', 'Office apps'),
      title: t('Office 无法激活，该怎么办？', 'Office will not activate. What next?'),
      prompt: t(
        '我的 Office 无法激活，如何排查？',
        'My Office will not activate. How can I troubleshoot it?',
      ),
    },
    {
      icon: KeyRound,
      category: t('权限与申请', 'Access requests'),
      title: t('我想申请安装一个软件', 'I need permission to install software'),
      prompt: t(
        '我需要申请安装软件的权限，请告诉我申请流程。',
        'I need permission to install software. What is the approval process?',
      ),
    },
  ];
  const [view, setView] = useState('chat');
  const runs = useResource<{ items: Data[] }>('/runs', revision);
  const tickets = useResource<{ items: Data[] }>('/tickets', revision);
  const approvals = useResource<{ items: Data[] }>('/approvals', revision);
  const [selected, setSelected] = useState<Data | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [cloudAllowed, setCloudAllowed] = useState(false);
  const [mcpServer, setMcpServer] = useState('');
  const connectors = useResource<{ items: Data[] }>('/connectors', revision);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<[string, string] | null>(null);
  const [ticketDraft, setTicketDraft] = useState<Data | null>(null);
  const [resolveTicket, setResolveTicket] = useState<Data | null>(null);
  const [resolution, setResolution] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const submitRun = useRef(createRunSubmitter());
  const list = array(runs.data?.items).sort((a, b) =>
    (b.created_at || '').localeCompare(a.created_at || ''),
  );
  const ticketItems = array(tickets.data?.items).sort((a, b) =>
    (b.created_at || '').localeCompare(a.created_at || ''),
  );
  const approvalItems = array(approvals.data?.items);
  const pendingApprovals = approvalItems.filter((item) => item.status === 'pending');
  const threadItems = useMemo(() => {
    if (!selected) return [];
    const current = array(runs.data?.items).find((item) => item.id === selected.id) || selected;
    const items = array(runs.data?.items).filter(
      (item) => item.thread_id === current.thread_id && item.id !== current.id,
    );
    return [...items, current].sort((a, b) =>
      (a.created_at || '').localeCompare(b.created_at || ''),
    );
  }, [selected, runs.data]);
  const histories = list.filter(
    (item, index) => list.findIndex((other) => other.thread_id === item.thread_id) === index,
  );
  async function send() {
    if (!message.trim() || sending) return;
    const question = message.trim();
    setSending(true);
    setError('');
    try {
      const run = await submitRun.current(user.id, {
        message: question,
        locale,
        ...(selected?.thread_id ? { thread_id: selected.thread_id } : {}),
        cloud_allowed: cloudAllowed,
        mcp_server: mcpServer || null,
      });
      setSelected({ ...run, message: run.message || question });
      setMessage('');
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }
  async function action(key: string, work: () => Promise<unknown>, success: [string, string]) {
    setBusy(key);
    setError('');
    setNotice(null);
    try {
      await work();
      onChange();
      setNotice(success);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  async function resume(item: Data) {
    setView('chat');
    setError('');
    setBusy(item.id);
    try {
      setSelected(await get(`/runs/${sid(item.id)}`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="task-workspace">
      <div className="task-topbar">
        <div
          className="workspace-tabs"
          role="tablist"
          aria-label={t('服务工作区', 'Service workspace')}
        >
          <button
            className={view === 'chat' ? 'active' : ''}
            onClick={() => setView('chat')}
            role="tab"
            aria-selected={view === 'chat'}
          >
            <MessageSquare size={16} />
            {t('对话助手', 'Assistant')}
          </button>
          <button
            className={view === 'tickets' ? 'active' : ''}
            onClick={() => setView('tickets')}
            role="tab"
            aria-selected={view === 'tickets'}
          >
            <Ticket size={16} />
            {t('服务工单', 'Tickets')}
            <span className="count">{tickets.data?.items.length ?? '—'}</span>
          </button>
          <button
            className={view === 'approvals' ? 'active' : ''}
            onClick={() => setView('approvals')}
            role="tab"
            aria-selected={view === 'approvals'}
          >
            <ShieldCheck size={16} />
            {isStaff(user) ? t('审批队列', 'Approval queue') : t('我的审批', 'My approvals')}
            {pendingApprovals.length > 0 && (
              <span className="count accent">{pendingApprovals.length}</span>
            )}
          </button>
        </div>
        <button
          className="text-button new-conversation"
          onClick={() => {
            setSelected(null);
            setMessage('');
            setError('');
            setView('chat');
            input.current?.focus();
          }}
        >
          <Plus size={16} />
          {t('新建对话', 'New conversation')}
        </button>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {t(...notice)}
          <button
            aria-label={t('关闭提示', 'Dismiss notification')}
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {view === 'chat' ? (
        <div className="conversation-grid">
          <section className={`conversation-main ${selected ? 'is-thread' : ''}`}>
            <div className={`chat-body ${selected ? 'has-messages' : ''}`}>
              {!selected ? (
                <>
                  <div className="welcome">
                    <div className="welcome-symbol">
                      <Sparkles size={28} strokeWidth={1.8} />
                    </div>
                    <h1>{t('有什么可以帮你？', 'How can I help?')}</h1>
                    <p>
                      {t(
                        '排查 IT 问题、查找操作指南，或创建服务工单。',
                        'Troubleshoot IT issues, find a guide, or create a service ticket.',
                      )}
                    </p>
                  </div>
                  <div className="suggestion-header">{t('常见问题', 'Suggested questions')}</div>
                  <div className="prompt-grid">
                    {examples.map((example) => (
                      <button
                        className="prompt-card"
                        key={example.category}
                        onClick={() => {
                          setMessage(example.prompt);
                          input.current?.focus();
                        }}
                      >
                        <div className="prompt-card-top">
                          <span className="prompt-icon">
                            <example.icon size={21} />
                          </span>
                          <span className="prompt-category">{example.category}</span>
                          <ArrowUpRightIcon />
                        </div>
                        <strong>{example.title}</strong>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="messages">
                  {threadItems.map((run) => (
                    <article key={run.id} className="exchange">
                      <div className="user-message">
                        <span className="avatar small">
                          {(run.user_id === user.id
                            ? displayUserName(user)
                            : run.user_id || displayUserName(user)
                          ).slice(0, 1)}
                        </span>
                        <div>
                          <span className="message-author">
                            {run.user_id === user.id
                              ? displayUserName(user)
                              : run.user_id || displayUserName(user)}
                            <time>{date(run.created_at, true)}</time>
                          </span>
                          <p>{promptOf(run)}</p>
                        </div>
                      </div>
                      <div className="assistant-message">
                        <span className="assistant-avatar">
                          D<span />
                        </span>
                        <div className="assistant-content">
                          <div className="message-author">
                            DeskPilot
                            <Badge value={run.status} />
                          </div>
                          <Diagnostics items={array(run.diagnostics)} />
                          {locale === 'en' &&
                            (array(run.citations).length > 0 || run.locale === 'zh-CN') && (
                              <p className="muted small-text">
                                Source excerpts and previously saved answers keep their original
                                language.
                              </p>
                            )}
                          <Markdown
                            text={
                              run.answer ||
                              (run.status === 'awaiting_approval'
                                ? t(
                                    '该操作需要授权，已创建审批请求。审批结果会记录在运行轨迹中。',
                                    'This action requires authorization. An approval request has been created; the decision will appear in the run trace.',
                                  )
                                : t(
                                    '这次运行没有返回回答，请查看检索轨迹。',
                                    'This run returned no answer. Check the retrieval trace for details.',
                                  ))
                            }
                          />
                          {array(run.citations).length > 0 && (
                            <div className="citations">
                              <div className="citations-label">
                                <BookOpen size={14} />
                                {t('参考来源 · ', 'Sources · ')}
                                {run.citations.length}
                              </div>
                              {array(run.citations).map((source, index) => (
                                <SourceCard
                                  key={source.id || index}
                                  source={source}
                                  index={index}
                                  onOpen={onSource}
                                />
                              ))}
                            </div>
                          )}
                          <div className="run-actions">
                            <button onClick={() => onTrace(run)}>
                              <GitBranch size={14} />
                              {t('查看检索轨迹', 'View retrieval trace')}
                            </button>
                            <button
                              onClick={() =>
                                setTicketDraft({
                                  title: promptOf(run).slice(0, 100),
                                  description: promptOf(run),
                                  run_id: run.id,
                                })
                              }
                            >
                              <Ticket size={14} />
                              {t('转为工单', 'Create ticket')}
                            </button>
                            {run.skill_id && (
                              <span>
                                {run.skill_id} · v{run.skill_version}
                              </span>
                            )}
                          </div>
                          {run.approval_id && (
                            <div className="approval-hint">
                              <ShieldCheck size={16} />
                              {t(
                                '此操作已生成审批请求',
                                'An approval request is ready for this action',
                              )}
                              <button onClick={() => setView('approvals')}>
                                {t('查看审批', 'View approval')}
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {sending && (
                <div className="thinking" role="status">
                  <span className="pulse-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <div>
                    <strong>{t('正在查找可访问的知识', 'Searching accessible knowledge')}</strong>
                    <p>
                      {t(
                        '检索证据、检查权限并生成回答…',
                        'Retrieving evidence, checking access, and preparing a response…',
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <form
              className="composer-wrapper"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <div className={`composer ${sending ? 'is-busy' : ''}`}>
                <label className="sr-only" htmlFor="message">
                  {t('描述你的 IT 问题', 'Describe your IT issue')}
                </label>
                <textarea
                  ref={input}
                  id="message"
                  value={message}
                  disabled={sending}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t(
                    '描述你遇到的问题，例如：VPN 连接失败，提示错误 809…',
                    'Describe your issue, for example: VPN fails to connect with error 809…',
                  )}
                  rows={2}
                  maxLength={8000}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-bottom">
                  <span>
                    <BookOpen size={15} />
                    {t('企业知识库', 'Team knowledge')}
                  </span>
                  <button
                    className="send-button"
                    aria-label={t('发送问题', 'Send question')}
                    disabled={!message.trim() || sending}
                  >
                    <ArrowUp size={21} />
                  </button>
                </div>
              </div>
              <div className="composer-note">
                <label className="mcp-select">
                  {t('MCP 预检', 'MCP preflight')}
                  <select
                    aria-label={t('MCP 预检', 'MCP preflight')}
                    value={mcpServer}
                    onChange={(e) => setMcpServer(e.target.value)}
                    disabled={sending}
                  >
                    <option value="">{t('不开启', 'Off')}</option>
                    {array(connectors.data?.items).map((item) => (
                      <option key={item.id} value={item.id} disabled={!item.enabled}>
                        {item.display_name || item.name}
                        {!item.enabled ? t('（未配置）', ' (not configured)') : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {mode === 'cloud' ? (
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={cloudAllowed}
                      onChange={(event) => setCloudAllowed(event.target.checked)}
                    />
                    {t(
                      '允许本次问题使用云端服务，文档仍遵循出站策略',
                      'Allow cloud services for this question; document outbound policies still apply',
                    )}
                  </label>
                ) : (
                  <>
                    <ShieldCheck size={12} />
                    {t(
                      '回答会附上可访问的知识来源。',
                      'Answers include sources you are allowed to access.',
                    )}
                  </>
                )}
                <span className="keyboard-hint">
                  {t(
                    'Enter 发送 · Shift + Enter 换行',
                    'Enter to send · Shift + Enter for a new line',
                  )}
                </span>
              </div>
            </form>
          </section>
          <aside className="context-rail">
            <div className="rail-heading">
              <span>
                <History size={16} />
                {t('最近任务', 'Recent tasks')}
              </span>
              <span>{histories.length}</span>
            </div>
            <ErrorBox error={runs.error} retry={runs.reload} />
            {runs.loading && !runs.data ? (
              <Loading>{t('正在载入记录', 'Loading history')}</Loading>
            ) : histories.length ? (
              <div className="history-list">
                {histories.slice(0, 12).map((item) => (
                  <button
                    className={`history-item ${selected?.thread_id === item.thread_id ? 'selected' : ''}`}
                    onClick={() => void resume(item)}
                    disabled={!!busy}
                    key={item.id}
                  >
                    <div>
                      <MessageSquare size={15} />
                      <time>{date(item.created_at)}</time>
                    </div>
                    <strong>{promptOf(item)}</strong>
                    <span className="history-status">
                      <Badge value={item.status} />
                      <ArrowRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="history-empty">
                <Clock3 size={22} />
                <strong>{t('暂无历史任务', 'No recent tasks')}</strong>
                <p>
                  {t(
                    '对话会自动保存在这里，方便继续处理。',
                    'Conversations are saved here so you can continue later.',
                  )}
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : view === 'tickets' ? (
        <div className="subpage">
          <div className="section-intro">
            <div>
              <h1>{t('服务工单', 'Tickets')}</h1>
              <p>
                {t(
                  '查看处理进度，记录和复用解决方案。',
                  'Track progress, record resolutions, and reuse what works.',
                )}
              </p>
            </div>
            <Button onClick={() => setTicketDraft({ title: '', description: '' })}>
              <Plus size={16} />
              {t('创建工单', 'Create ticket')}
            </Button>
          </div>
          <ErrorBox error={tickets.error} retry={tickets.reload} />
          {tickets.loading && !tickets.data ? (
            <Loading />
          ) : ticketItems.length ? (
            <div className="ticket-list">
              {ticketItems.map((ticket) => (
                <article className="ticket-card" key={ticket.id}>
                  <div className="ticket-icon">
                    <Ticket size={22} />
                  </div>
                  <div className="ticket-content">
                    <div className="ticket-heading">
                      <h3>{ticket.title}</h3>
                      <Badge value={ticket.status} />
                    </div>
                    <p>{ticket.description}</p>
                    <div className="record-meta">
                      <span>{ticket.id}</span>
                      <span>{date(ticket.created_at, true)}</span>
                      <span>
                        {t('发起人 ', 'Requester ')}
                        {ticket.owner_id}
                      </span>
                    </div>
                    {ticket.resolution && (
                      <div className="resolution">
                        <Check size={15} />
                        <div>
                          <strong>{t('解决方案', 'Resolution')}</strong>
                          <p>{ticket.resolution}</p>
                        </div>
                      </div>
                    )}
                    <div className="card-actions">
                      {ticket.run_id && (
                        <Button variant="ghost" onClick={() => void resume({ id: ticket.run_id })}>
                          <ExternalLink size={14} />
                          {t('关联对话', 'Linked conversation')}
                        </Button>
                      )}
                      {isStaff(user) && ticket.status !== 'resolved' && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setResolveTicket(ticket);
                            setResolution('');
                          }}
                        >
                          <Check size={14} />
                          {t('记录解决方案', 'Record resolution')}
                        </Button>
                      )}
                      {isStaff(user) && ticket.status === 'resolved' && (
                        <Button
                          variant="secondary"
                          loading={busy === ticket.id}
                          disabled={!!busy}
                          onClick={() =>
                            void action(
                              ticket.id,
                              () => post(`/tickets/${sid(ticket.id)}/knowledge`),
                              [
                                '已创建知识候选，请在知识库检查并发布。',
                                'Knowledge candidate created. Review and publish it in Knowledge.',
                              ],
                            )
                          }
                        >
                          <ArrowDownToLine size={14} />
                          {t('沉淀为知识候选', 'Create knowledge candidate')}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title={t('还没有服务工单', 'No tickets yet')} icon={<ClipboardList size={25} />}>
              {t(
                '可以从对话创建工单，也可以直接描述你遇到的问题。',
                'Create a ticket from a conversation, or describe a new issue.',
              )}
            </Empty>
          )}
        </div>
      ) : (
        <div className="subpage">
          <div className="section-intro">
            <div>
              <h1>{t('审批请求', 'Approval requests')}</h1>
              <p>
                {t(
                  '核对操作内容，批准后继续执行。',
                  'Review the exact operation before approving execution.',
                )}
              </p>
            </div>
            <Badge tone="warn">
              {pendingApprovals.length}
              {t(' 项待处理', ' pending')}
            </Badge>
          </div>
          <ErrorBox error={approvals.error} retry={approvals.reload} />
          {approvals.loading && !approvals.data ? (
            <Loading />
          ) : approvalItems.length ? (
            <div className="approval-list">
              {approvalItems.map((approval) => (
                <article className="approval-card" key={approval.id}>
                  <div className="approval-card-top">
                    <div className="approval-tool">
                      <span className="approval-icon">
                        <ShieldCheck size={23} />
                      </span>
                      <div>
                        <h3>{approval.tool || t('工具执行请求', 'Tool execution request')}</h3>
                        <p>
                          {t('发起人 ', 'Requester ')}
                          {approval.requester_id}
                          {t(' · 技能版本 ', ' · Skill version ')}
                          {approval.skill_version || '—'}
                        </p>
                      </div>
                    </div>
                    <Badge value={approval.status} />
                  </div>
                  <div className="approval-parameters">
                    <span className="field-caption">
                      {t('将要执行的参数', 'Parameters to execute')}
                    </span>
                    <pre>{JSON.stringify(approval.parameters, null, 2)}</pre>
                  </div>
                  <div className="approval-bottom">
                    <span>
                      <Clock3 size={14} />
                      {t('有效期至 ', 'Expires ')}
                      {date(approval.expires_at, true)}
                    </span>
                    {isStaff(user) && approval.status === 'pending' ? (
                      <div className="button-row">
                        <Button
                          variant="secondary"
                          disabled={!!busy}
                          loading={busy === `${approval.id}-reject`}
                          onClick={() =>
                            void action(
                              `${approval.id}-reject`,
                              () =>
                                post(`/approvals/${sid(approval.id)}/decision`, {
                                  decision: 'reject',
                                }),
                              ['已拒绝此操作。', 'Action rejected.'],
                            )
                          }
                        >
                          {t('拒绝', 'Reject')}
                        </Button>
                        <Button
                          disabled={!!busy}
                          loading={busy === `${approval.id}-approve`}
                          onClick={() =>
                            void action(
                              `${approval.id}-approve`,
                              () =>
                                post(`/approvals/${sid(approval.id)}/decision`, {
                                  decision: 'approve',
                                }),
                              [
                                '审批已通过，执行结果可在关联对话中查看。',
                                'Approved. View the execution result in the linked conversation.',
                              ],
                            )
                          }
                        >
                          <Check size={14} />
                          {t('批准执行', 'Approve execution')}
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" onClick={() => void resume({ id: approval.run_id })}>
                        {t('查看关联运行', 'View linked run')}
                        <ArrowRight size={14} />
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={t('目前没有审批请求', 'No approval requests')}
              icon={<ListChecks size={25} />}
            >
              {t(
                '需要额外授权的工具操作，会在这里等待人工确认。',
                'Tool operations that need additional authorization wait here for review.',
              )}
            </Empty>
          )}
        </div>
      )}
      {ticketDraft && (
        <Modal
          title={t('创建服务工单', 'Create service ticket')}
          onClose={() => setTicketDraft(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(
                'ticket',
                async () => {
                  await post('/tickets', { ...ticketDraft, cloud_allowed: cloudAllowed });
                  setTicketDraft(null);
                  setView('tickets');
                },
                ['工单已创建。', 'Ticket created.'],
              );
            }}
          >
            <label className="field">
              {t('工单标题', 'Ticket title')}
              <input
                autoFocus
                required
                maxLength={160}
                value={ticketDraft.title}
                onChange={(event) => setTicketDraft({ ...ticketDraft, title: event.target.value })}
                placeholder={t('用一句话描述遇到的问题', 'Describe the issue in one sentence')}
              />
            </label>
            <label className="field">
              {t('问题描述', 'Issue description')}
              <textarea
                required
                rows={5}
                maxLength={8000}
                value={ticketDraft.description}
                onChange={(event) =>
                  setTicketDraft({ ...ticketDraft, description: event.target.value })
                }
                placeholder={t(
                  '补充设备、错误信息和已经尝试的操作',
                  'Include your device, error message, and steps already attempted',
                )}
              />
            </label>
            {ticketDraft.run_id && (
              <div className="form-note">
                <GitBranch size={15} />
                {t(
                  '自动关联当前对话记录与检索证据',
                  'The current conversation and retrieval evidence will be linked automatically',
                )}
              </div>
            )}
            <ErrorBox error={error} />
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setTicketDraft(null)}>
                {t('取消', 'Cancel')}
              </Button>
              <Button loading={busy === 'ticket'} type="submit">
                {t('创建工单', 'Create ticket')}
                <ArrowRight size={15} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {resolveTicket && (
        <Modal
          title={t('记录解决方案', 'Record resolution')}
          subtitle={resolveTicket.title}
          onClose={() => setResolveTicket(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(
                'resolve',
                async () => {
                  await post(`/tickets/${sid(resolveTicket.id)}/resolve`, { resolution });
                  setResolveTicket(null);
                },
                ['工单已解决，方案已保存。', 'Ticket resolved and resolution saved.'],
              );
            }}
          >
            <label className="field">
              {t('实际采取了什么操作？', 'What steps resolved the issue?')}
              <textarea
                required
                autoFocus
                rows={7}
                maxLength={8000}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder={t(
                  '记录原因、解决步骤与验证结果，方便后续沉淀为企业知识。',
                  'Record the cause, resolution steps, and verification so this can become team knowledge.',
                )}
              />
            </label>
            <ErrorBox error={error} />
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setResolveTicket(null)}>
                {t('取消', 'Cancel')}
              </Button>
              <Button type="submit" loading={busy === 'resolve'} disabled={!resolution.trim()}>
                {t('保存并标记已解决', 'Save and mark resolved')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
