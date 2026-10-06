import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Edit3,
  FlaskConical,
  GitBranch,
  Layers3,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Workflow,
} from 'lucide-react';
import {
  array,
  date,
  display,
  errorText,
  get,
  isStaff,
  patch,
  post,
  remove,
  sid,
  useResource,
  type Data,
  type User,
} from './api';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  PanelTitle,
} from './components';

type BaseProps = { user: User; revision: number; onChange: () => void };
export function Skills({ user, revision, onChange }: BaseProps) {
  const resource = useResource<{ items: Data[] }>('/skills', revision);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Data | null>(null);
  const [notice, setNotice] = useState('');
  async function change(skill: Data, version: Data, action: 'evaluate' | 'activate') {
    setBusy(`${skill.id}-${version.version}-${action}`);
    setError('');
    setNotice('');
    try {
      const response = await post(`/skills/${sid(skill.id)}/${action}`, {
        version: version.version,
      });
      if (action === 'evaluate') setResult(response);
      else setNotice(`已启用 ${skill.name} v${version.version}`);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-content">
      <PageHeader title="技能管理" description="查看工作流程、工具权限与版本，评测通过后可启用。" />
      <div className="info-strip">
        <ShieldCheck size={19} />
        <p>技能决定如何处理问题；工具执行仍由服务端权限与审批策略控制。</p>
      </div>
      <ErrorBox error={error || resource.error} retry={resource.reload} />
      {notice && (
        <div className="notice">
          <Check size={16} />
          {notice}
        </div>
      )}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : array(resource.data?.items).length ? (
        <div className="skill-grid">
          {array(resource.data?.items).map((skill, index) => (
            <article className="skill-card" key={skill.id}>
              <div className="skill-card-heading">
                <span className={`skill-symbol tone-${index % 3}`}>
                  <Workflow size={25} />
                </span>
                <div>
                  <span className="small-label">{skill.id}</span>
                  <h2>{skill.name}</h2>
                </div>
                <Badge tone="good">v{skill.active_version || '—'}</Badge>
              </div>
              <p className="skill-description">{skill.description}</p>
              <div className="skill-owner">
                <UserRound size={14} />
                维护人 {skill.owner || '未指定'}
                <span>
                  <Layers3 size={14} />
                  {array(skill.versions).length} 个版本
                </span>
              </div>
              <div className="skill-versions">
                {array(skill.versions).map((version) => {
                  const active = String(version.version) === String(skill.active_version);
                  const evaluated =
                    version.evaluated ||
                    version.evaluation?.passed ||
                    version.evaluation_id ||
                    ['evaluated', 'passed', 'active', 'ready'].includes(version.status);
                  return (
                    <div className="skill-version" key={version.version}>
                      <div className="version-heading">
                        <strong>版本 {version.version}</strong>
                        <Badge
                          value={
                            active
                              ? 'active'
                              : version.evaluation?.passed
                                ? 'evaluated'
                                : version.status || 'draft'
                          }
                        />
                      </div>
                      {version.description && <p>{version.description}</p>}
                      <div className="tool-label">允许的工具</div>
                      <div className="tool-tags">
                        {Array.isArray(version.allowed_tools) && version.allowed_tools.length ? (
                          version.allowed_tools.map((tool: string) => (
                            <span key={tool}>
                              <Code2 size={12} />
                              {tool}
                            </span>
                          ))
                        ) : (
                          <span>无外部工具</span>
                        )}
                      </div>
                      {version.instructions && (
                        <details className="skill-prompt">
                          <summary>
                            查看工作指令 <ChevronRight size={14} />
                          </summary>
                          <div className="prompt-text">{display(version.instructions)}</div>
                        </details>
                      )}
                      {isStaff(user) && (
                        <div className="version-actions">
                          <Button
                            variant="secondary"
                            loading={busy === `${skill.id}-${version.version}-evaluate`}
                            disabled={!!busy}
                            onClick={() => void change(skill, version, 'evaluate')}
                          >
                            <FlaskConical size={14} />
                            运行评测
                          </Button>
                          <Button
                            variant={active ? 'ghost' : 'primary'}
                            loading={busy === `${skill.id}-${version.version}-activate`}
                            disabled={!!busy || active || !evaluated || user.role !== 'admin'}
                            title={
                              user.role !== 'admin'
                                ? '仅管理员可以启用技能版本'
                                : !evaluated
                                  ? '先运行评测，通过后可启用'
                                  : active
                                    ? '当前正在使用此版本'
                                    : '启用此版本'
                            }
                            onClick={() => void change(skill, version, 'activate')}
                          >
                            {active ? (
                              <>
                                <Check size={14} />
                                当前版本
                              </>
                            ) : (
                              <>
                                启用版本
                                <ArrowRight size={14} />
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {!active && !evaluated && isStaff(user) && (
                        <span className="version-hint">启用前需要完成该版本的评测</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="没有已注册的技能" icon={<Workflow size={25} />}>
          服务端注册的技能及其版本会显示在这里。
        </Empty>
      )}
      {result && (
        <Modal title="技能评测结果" onClose={() => setResult(null)} wide>
          <div className="evaluation-result">
            <Badge
              value={
                result.status ||
                (result.passed === true
                  ? 'passed'
                  : result.passed === false
                    ? 'failed'
                    : 'completed')
              }
            />
            <pre>{display(result)}</pre>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Memories({ user, revision, onChange }: BaseProps) {
  const resource = useResource<{ items: Data[] }>('/memories', revision);
  const [draft, setDraft] = useState<Data | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Data | null>(null);
  async function save() {
    if (!draft || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      if (draft.id)
        await patch(`/memories/${sid(draft.id)}`, { text: draft.text, confirmed: true });
      else await post('/memories', { text: draft.text, confirmed: true });
      setDraft(null);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteMemory() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await remove(`/memories/${sid(deleting.id)}`);
      setDeleting(null);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const items = array(resource.data?.items);
  return (
    <div className="page-content">
      <PageHeader
        title="个人记忆"
        description="管理已确认的个人偏好，可随时修改或删除。"
        action={
          <Button
            onClick={() => {
              setDraft({ text: '' });
              setConfirmed(false);
              setError('');
            }}
          >
            <Plus size={16} />
            添加记忆
          </Button>
        }
      />
      <section className="memory-content">
        <div className="memory-context">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name} 的个人记忆</strong>
            <p>{items.length} 条已保存 · 仅属于当前身份</p>
          </div>
          <Badge tone="neutral">
            <LockKeyhole size={12} />
            个人
          </Badge>
        </div>
        <ErrorBox
          error={resource.error || (!draft && !deleting ? error : '')}
          retry={resource.reload}
        />
        {resource.loading && !resource.data ? (
          <Loading />
        ) : items.length ? (
          <div className="memory-list">
            {items.map((memory, index) => (
              <article className="memory-card" key={memory.id}>
                <span className="memory-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="memory-text">
                  <p>{memory.text}</p>
                  <span>
                    <CheckCircle2 size={13} />
                    已由你确认 · {date(memory.updated_at || memory.created_at, true)}
                  </span>
                </div>
                <div className="memory-actions">
                  <button
                    className="icon-button"
                    aria-label="编辑这条记忆"
                    onClick={() => {
                      setDraft(memory);
                      setConfirmed(false);
                      setError('');
                    }}
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    aria-label="删除这条记忆"
                    onClick={() => {
                      setDeleting(memory);
                      setError('');
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="memory-empty panel">
            <div className="memory-illustration">
              <span>
                <Sparkles size={32} />
              </span>
              <i />
              <i />
              <i />
            </div>
            <h2>还没有个人记忆</h2>
            <p>
              例如常用的操作系统、偏好的沟通方式，
              <br />
              或你希望助手在解答前了解的工作习惯。
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft({ text: '' });
                setConfirmed(false);
              }}
            >
              添加第一条记忆
              <Plus size={15} />
            </Button>
          </div>
        )}
        <div className="privacy-note">
          <LockKeyhole size={16} />
          <p>记忆经你确认后保存，仅用于当前身份，不会改变知识访问权限。</p>
        </div>
      </section>
      {draft && (
        <Modal title={draft.id ? '修改个人记忆' : '添加个人记忆'} onClose={() => setDraft(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="field">
              希望助手记住什么？
              <textarea
                autoFocus
                required
                rows={5}
                maxLength={500}
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                placeholder="我使用 Windows 11，偏好简洁、分步骤的操作说明。"
              />
            </label>
            <label className="confirm-memory">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>我确认将以上内容保存为个人记忆，并在后续对话中使用。</span>
            </label>
            <ErrorBox error={error} />
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                取消
              </Button>
              <Button type="submit" loading={busy} disabled={!confirmed || !draft.text.trim()}>
                <Check size={15} />
                确认保存
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="删除这条记忆？" onClose={() => setDeleting(null)}>
          <p className="delete-preview">{deleting.text}</p>
          <p className="muted">删除后，这条内容将不再作为个人记忆使用。</p>
          <ErrorBox error={error} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void deleteMemory()}>
              <Trash2 size={15} />
              删除记忆
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Operations({
  user,
  revision,
  onTrace,
}: BaseProps & { onTrace: (data: Data) => void }) {
  const resource = useResource<Data>(isStaff(user) ? '/operations' : null, revision);
  const [view, setView] = useState('runs');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  if (!isStaff(user))
    return (
      <div className="page-content">
        <PageHeader title="评测与运行" description="查看运行记录、服务用量、审计日志与评测结果。" />
        <div className="restricted-panel">
          <ShieldCheck size={34} />
          <h2>此工作区面向 IT 支持和管理员</h2>
          <p>
            当前身份仍可在“对话与任务”中查看自己的检索轨迹。
            <br />
            本地演示可以通过右上角身份选择器切换。
          </p>
        </div>
      </div>
    );
  const data = resource.data;
  const runs = array(data?.runs);
  const usage = array(data?.usage);
  const audit = array(data?.audit);
  const evaluations = array(data?.evaluations);
  const totals = data?.totals || {};
  const filtered = runs.filter((run) =>
    [run.id, run.user_id, run.message, run.status]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const actualRunCount = totals.runs ?? totals.total_runs ?? (data ? runs.length : '—');
  const pending =
    totals.pending_approvals ??
    (data ? runs.filter((run) => run.status === 'awaiting_approval').length : '—');
  const completed =
    totals.completed ??
    totals.completed_runs ??
    (data ? runs.filter((run) => run.status === 'completed').length : '—');
  async function openRun(run: Data) {
    setBusy(run.id);
    setError('');
    try {
      onTrace(await get(`/runs/${sid(run.id)}`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-content">
      <PageHeader
        title="评测与运行"
        description="查看运行记录、服务用量、审计日志与评测结果。"
        action={
          <Button
            variant="secondary"
            loading={resource.loading}
            onClick={() => void resource.reload()}
          >
            <RefreshCw size={15} />
            刷新记录
          </Button>
        }
      />
      <ErrorBox error={resource.error || error} retry={resource.reload} />
      <div className="operations-metrics">
        {[
          [Activity, '运行记录', actualRunCount, '记录来自真实服务请求'],
          [CheckCircle2, '已完成运行', completed, '回答已完成的运行'],
          [ShieldCheck, '等待审批', pending, '需要人工决策的操作'],
          [FlaskConical, '评测记录', data ? evaluations.length : '—', '已持久化的评测结果'],
        ].map(([Icon, label, value, note]) => {
          const MetricIcon = Icon as typeof Activity;
          return (
            <div className="metric-card" key={String(label)}>
              <div>
                <span>{label as string}</span>
                <MetricIcon size={18} />
              </div>
              <strong>{value as string | number}</strong>
              <p>{note as string}</p>
            </div>
          );
        })}
      </div>
      <div className="usage-summary">
        <span>
          已记录实际费用{' '}
          <strong>
            {totals.actual_cost_cny == null ? '未提供' : `¥${totals.actual_cost_cny}`}
          </strong>
        </span>
        <span>
          预算占用{' '}
          <strong>
            {totals.reserved_cost_cny == null ? '未提供' : `¥${totals.reserved_cost_cny}`}
          </strong>
        </span>
        <span>
          用量未知 <strong>{totals.unknown_usage ?? '未提供'}</strong> 次
        </span>
        <span>未知用量不会记为零</span>
      </div>
      <section className="panel operations-panel">
        <div className="operations-tabs">
          {[
            ['runs', '运行记录', Activity],
            ['usage', '服务用量', Layers3],
            ['audit', '审计日志', ShieldCheck],
            ['evaluations', '评测结果', FlaskConical],
          ].map(([id, label, Icon]) => {
            const TabIcon = Icon as typeof Activity;
            return (
              <button
                className={view === id ? 'active' : ''}
                key={id as string}
                onClick={() => setView(id as string)}
              >
                <TabIcon size={15} />
                {label as string}
              </button>
            );
          })}
        </div>
        {resource.loading && !data ? (
          <Loading />
        ) : view === 'runs' ? (
          <>
            <div className="table-toolbar">
              <div className="search-field">
                <Search size={16} />
                <input
                  aria-label="筛选运行记录"
                  placeholder="搜索问题、运行 ID 或用户"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <span className="muted small-text">{filtered.length} 条实际运行</span>
            </div>
            {filtered.length ? (
              <div className="table-scroll">
                <table className="runs-table">
                  <thead>
                    <tr>
                      <th>问题 / 运行</th>
                      <th>用户</th>
                      <th>状态</th>
                      <th>创建时间</th>
                      <th>轨迹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <strong>{run.message || run.retrieval?.query || run.id}</strong>
                          <small>{run.id}</small>
                        </td>
                        <td>{run.user_id}</td>
                        <td>
                          <Badge value={run.status} />
                        </td>
                        <td>{date(run.created_at, true)}</td>
                        <td>
                          <Button
                            variant="ghost"
                            loading={busy === run.id}
                            onClick={() => void openRun(run)}
                          >
                            <GitBranch size={15} />
                            检查
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="尚无匹配的运行记录">
                向助手发送一个问题后，这里会留下可追溯的运行记录。
              </Empty>
            )}
          </>
        ) : view === 'usage' ? (
          usage.length ? (
            <div className="table-scroll">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>服务 / 模型</th>
                    <th>调用类型</th>
                    <th>Token 用量</th>
                    <th>计量状态</th>
                    <th>实际 / 预留费用</th>
                    <th>耗时</th>
                    <th>记录时间</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((item, index) => (
                    <tr key={item.id || index}>
                      <td>
                        <strong>{item.provider || item.model || '服务调用'}</strong>
                        <small>{item.model || item.id}</small>
                      </td>
                      <td>{item.kind || item.operation || item.type || '—'}</td>
                      <td>
                        {item.total_tokens ??
                          item.tokens ??
                          (item.input_tokens != null || item.output_tokens != null
                            ? `${item.input_tokens ?? '未知'} 入 / ${item.output_tokens ?? '未知'} 出`
                            : '未提供')}
                      </td>
                      <td>{item.usage_status || '未知'}</td>
                      <td>
                        {(item.actual_cny ?? item.actual_cost_cny) == null
                          ? '未知'
                          : `¥${item.actual_cny ?? item.actual_cost_cny}`}{' '}
                        /{' '}
                        {(item.reserved_cny ?? item.reserved_cost_cny) == null
                          ? '未提供'
                          : `¥${item.reserved_cny ?? item.reserved_cost_cny}`}
                      </td>
                      <td>
                        {item.latency_ms !== undefined
                          ? `${item.latency_ms} ms`
                          : item.elapsed_ms !== undefined
                            ? `${item.elapsed_ms} ms`
                            : '未提供'}
                      </td>
                      <td>{date(item.created_at || item.at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="还没有外部服务用量" icon={<Layers3 size={25} />}>
              本地演示不会调用云端模型，因此不会产生云端 Token 用量或费用。
            </Empty>
          )
        ) : view === 'audit' ? (
          audit.length ? (
            <div className="audit-list">
              {audit.map((item, index) => (
                <button
                  className="audit-item"
                  onClick={() => setDetail(item)}
                  key={item.id || index}
                >
                  <span className="audit-symbol">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <strong>{item.action || item.event || '审计事件'}</strong>
                    <p>
                      {display(
                        typeof item.actor === 'object'
                          ? item.actor?.name || item.actor?.id
                          : item.actor,
                      )}
                      <span>→</span>
                      {display(item.target)}
                    </p>
                  </div>
                  <time>{date(item.created_at || item.timestamp, true)}</time>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty title="暂无审计事件">身份切换、知识发布和受控操作等行为会被记录。</Empty>
          )
        ) : evaluations.length ? (
          <div className="evaluation-list">
            {evaluations.map((item, index) => (
              <button
                className="evaluation-card"
                key={item.id || index}
                onClick={() => setDetail(item)}
              >
                <span>
                  <FlaskConical size={23} />
                </span>
                <div>
                  <h3>
                    {item.skill_id || item.name || item.type || '检索评测'}
                    {item.version ? ` · v${item.version}` : ''}
                  </h3>
                  <p>
                    {item.case_count || item.total
                      ? `${item.case_count || item.total} 个样本 · `
                      : ''}
                    {date(item.created_at || item.at, true)}
                  </p>
                </div>
                <Badge
                  value={
                    item.status ||
                    (item.passed === true
                      ? 'passed'
                      : item.passed === false
                        ? 'failed'
                        : 'completed')
                  }
                />
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <Empty title="评测尚未运行" icon={<FlaskConical size={25} />}>
            可在技能管理中评测指定版本；语料评测通过仓库命令运行并记录。
          </Empty>
        )}
      </section>
      <div className="operations-footnote">
        <ShieldCheck size={15} />
        用量来自服务端真实记录。缺失字段显示“未提供”，不估算或填充模拟费用。
      </div>
      {detail && (
        <Modal
          title={view === 'audit' ? '审计事件详情' : '评测结果详情'}
          onClose={() => setDetail(null)}
          wide
        >
          <pre className="record-json">{display(detail)}</pre>
        </Modal>
      )}
    </div>
  );
}

export function Configuration({
  user,
  mode,
  onClose,
}: {
  user: User;
  mode: string;
  onClose: () => void;
}) {
  const resource = useResource<Data>('/config/status');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Data | null>(null);
  const [error, setError] = useState('');
  async function check() {
    setChecking(true);
    setError('');
    try {
      setResult(await post('/config/check'));
      void resource.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setChecking(false);
    }
  }
  const data = resource.data;
  const missing = Array.isArray(data?.missing)
    ? data.missing
    : Array.isArray(data?.cloud_missing)
      ? data.cloud_missing
      : [];
  return (
    <Modal title="运行模式与云端连接" onClose={onClose} wide>
      <div className="config-mode">
        <span className="config-icon">
          <Settings2 size={26} />
        </span>
        <div>
          <h3>{mode === 'demo' ? '本地演示模式' : '云端模式'}</h3>
          <p>
            {mode === 'demo'
              ? '真实 BM25 检索与原文摘录，无外部模型调用。'
              : '根据文档出站策略，连接生成、向量与重排服务。'}
          </p>
        </div>
        <Badge tone={mode === 'demo' ? 'neutral' : 'good'}>{mode.toUpperCase()}</Badge>
      </div>
      <ErrorBox error={resource.error || error} retry={resource.reload} />
      {resource.loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="config-security">
            <LockKeyhole size={20} />
            <div>
              <strong>密钥只由服务端读取</strong>
              <p>
                在后端环境变量或 .env
                中配置服务地址和密钥。此页面不收集密钥，也不会将密钥保存到浏览器。
              </p>
            </div>
          </div>
          <div className="config-section">
            <PanelTitle
              aside={
                <Badge tone={data?.cloud_ready ? 'good' : 'warn'}>
                  {data?.cloud_ready ? '配置已就绪' : '查看配置状态'}
                </Badge>
              }
            >
              连接状态
            </PanelTitle>
            {missing.length > 0 ? (
              <div className="missing-config">
                <span className="field-caption">尚未配置的服务端变量</span>
                <div>
                  {missing.map((name: string) => (
                    <code key={name}>{name}</code>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted">
                {data?.cloud_ready
                  ? '所需配置完整，可由管理员测试连通性。'
                  : '以下为服务端返回的当前配置状态。'}
              </p>
            )}
            <details className="raw-details">
              <summary>
                查看脱敏配置状态 <ChevronRight size={15} />
              </summary>
              <pre>{display(data)}</pre>
            </details>
          </div>
          {user.role === 'admin' ? (
            <div className="config-check">
              <div>
                <h3>验证服务连接</h3>
                <p>使用服务端配置检查外部服务，会产生实际网络请求。</p>
              </div>
              <Button variant="secondary" loading={checking} onClick={() => void check()}>
                <RefreshCw size={15} />
                检查连接
              </Button>
            </div>
          ) : (
            <div className="form-note">
              <ShieldCheck size={16} />
              仅管理员可以发起云端连接检查。
            </div>
          )}
          {result && (
            <div className="config-check-result">
              <h3>本次检查结果</h3>
              <pre>{display(result)}</pre>
            </div>
          )}
        </>
      )}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
      </div>
    </Modal>
  );
}
