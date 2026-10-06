import { useI18n } from './i18n';
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
  displayUserName,
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
  const { t, locale } = useI18n();
  const resource = useResource<{ items: Data[] }>('/skills', revision);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Data | null>(null);
  const [notice, setNotice] = useState<[string, string] | null>(null);
  async function change(skill: Data, version: Data, action: 'evaluate' | 'activate') {
    setBusy(`${skill.id}-${version.version}-${action}`);
    setError('');
    setNotice(null);
    try {
      const response = await post(`/skills/${sid(skill.id)}/${action}`, {
        version: version.version,
      });
      if (action === 'evaluate') setResult(response);
      else
        setNotice([
          `已启用 ${skill.id} v${version.version}`,
          `Activated ${skill.id} v${version.version}`,
        ]);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-content">
      <PageHeader
        title={t('技能管理', 'Skills')}
        description={t(
          '查看工作流程、工具权限与版本，评测通过后可启用。',
          'Inspect workflows, tool permissions, and versions. Evaluate a version before activating it.',
        )}
      />
      <div className="info-strip">
        <ShieldCheck size={19} />
        <p>
          {t(
            '技能决定如何处理问题；工具执行仍由服务端权限与审批策略控制。',
            'Skills define the workflow. Server-side permissions and approval policies still govern tool execution.',
          )}
        </p>
      </div>
      {locale === 'en' && (
        <p className="muted small-text">
          Custom skill content and stored instructions keep their original language. Display labels
          do not change the evaluated skill definition.
        </p>
      )}
      <ErrorBox error={error || resource.error} retry={resource.reload} />
      {notice && (
        <div className="notice">
          <Check size={16} />
          {t(...notice)}
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
                  <h2>{skill.display_name || skill.name}</h2>
                </div>
                <Badge tone="good">v{skill.active_version || '—'}</Badge>
              </div>
              <p className="skill-description">{skill.display_description || skill.description}</p>
              <div className="skill-owner">
                <UserRound size={14} />
                {t('维护人 ', 'Owner ')}
                {skill.owner || t('未指定', 'Unassigned')}
                <span>
                  <Layers3 size={14} />
                  {array(skill.versions).length}
                  {t(' 个版本', ' versions')}
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
                        <strong>
                          {t('版本 ', 'Version ')}
                          {version.version}
                        </strong>
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
                      {version.description && (
                        <p>{version.display_description || version.description}</p>
                      )}
                      <div className="tool-label">{t('允许的工具', 'Allowed tools')}</div>
                      <div className="tool-tags">
                        {Array.isArray(version.allowed_tools) && version.allowed_tools.length ? (
                          version.allowed_tools.map((tool: string) => (
                            <span key={tool}>
                              <Code2 size={12} />
                              {tool}
                            </span>
                          ))
                        ) : (
                          <span>{t('无外部工具', 'No external tools')}</span>
                        )}
                      </div>
                      {version.instructions && (
                        <details className="skill-prompt">
                          <summary>
                            {t('查看工作指令 ', 'View instructions ')}
                            <ChevronRight size={14} />
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
                            {t('运行评测', 'Run evaluation')}
                          </Button>
                          <Button
                            variant={active ? 'ghost' : 'primary'}
                            loading={busy === `${skill.id}-${version.version}-activate`}
                            disabled={!!busy || active || !evaluated || user.role !== 'admin'}
                            title={
                              user.role !== 'admin'
                                ? t(
                                    '仅管理员可以启用技能版本',
                                    'Only administrators can activate skill versions',
                                  )
                                : !evaluated
                                  ? t(
                                      '先运行评测，通过后可启用',
                                      'Run and pass the evaluation before activating',
                                    )
                                  : active
                                    ? t('当前正在使用此版本', 'This version is currently active')
                                    : t('启用此版本', 'Activate this version')
                            }
                            onClick={() => void change(skill, version, 'activate')}
                          >
                            {active ? (
                              <>
                                <Check size={14} />
                                {t('当前版本', 'Current version')}
                              </>
                            ) : (
                              <>
                                {t('启用版本', 'Activate version')}
                                <ArrowRight size={14} />
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {!active && !evaluated && isStaff(user) && (
                        <span className="version-hint">
                          {t(
                            '启用前需要完成该版本的评测',
                            'This version must pass evaluation before activation',
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title={t('没有已注册的技能', 'No registered skills')} icon={<Workflow size={25} />}>
          {t(
            '服务端注册的技能及其版本会显示在这里。',
            'Skills and versions registered on the server appear here.',
          )}
        </Empty>
      )}
      {result && (
        <Modal
          title={t('技能评测结果', 'Skill evaluation results')}
          onClose={() => setResult(null)}
          wide
        >
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
  const { t } = useI18n();
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
        title={t('个人记忆', 'Personal memory')}
        description={t(
          '管理已确认的个人偏好，可随时修改或删除。',
          'Manage confirmed preferences. You can edit or remove them at any time.',
        )}
        action={
          <Button
            onClick={() => {
              setDraft({ text: '' });
              setConfirmed(false);
              setError('');
            }}
          >
            <Plus size={16} />
            {t('添加记忆', 'Add memory')}
          </Button>
        }
      />
      <section className="memory-content">
        <div className="memory-context">
          <span className="avatar">{displayUserName(user).slice(0, 1)}</span>
          <div>
            <strong>
              {t(
                `${displayUserName(user)} 的个人记忆`,
                `${displayUserName(user)}’s personal memory`,
              )}
            </strong>
            <p>
              {items.length}
              {t(' 条已保存 · 仅属于当前身份', ' saved · Private to this identity')}
            </p>
          </div>
          <Badge tone="neutral">
            <LockKeyhole size={12} />
            {t('个人', 'Personal')}
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
                    {t('已由你确认 · ', 'Confirmed by you · ')}
                    {date(memory.updated_at || memory.created_at, true)}
                  </span>
                </div>
                <div className="memory-actions">
                  <button
                    className="icon-button"
                    aria-label={t('编辑这条记忆', 'Edit this memory')}
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
                    aria-label={t('删除这条记忆', 'Delete this memory')}
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
            <h2>{t('还没有个人记忆', 'No personal memories yet')}</h2>
            <p>
              {t(
                '例如常用的操作系统、偏好的沟通方式，',
                'Save your operating system, communication preferences,',
              )}
              <br />
              {t(
                '或你希望助手在解答前了解的工作习惯。',
                'or work habits you want the assistant to consider.',
              )}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft({ text: '' });
                setConfirmed(false);
              }}
            >
              {t('添加第一条记忆', 'Add your first memory')}
              <Plus size={15} />
            </Button>
          </div>
        )}
        <div className="privacy-note">
          <LockKeyhole size={16} />
          <p>
            {t(
              '记忆经你确认后保存，仅用于当前身份，不会改变知识访问权限。',
              'Memories are saved only with your confirmation, apply to this identity, and never change knowledge access.',
            )}
          </p>
        </div>
      </section>
      {draft && (
        <Modal
          title={
            draft.id
              ? t('修改个人记忆', 'Edit personal memory')
              : t('添加个人记忆', 'Add personal memory')
          }
          onClose={() => setDraft(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="field">
              {t('希望助手记住什么？', 'What should the assistant remember?')}
              <textarea
                autoFocus
                required
                rows={5}
                maxLength={500}
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                placeholder={t(
                  '我使用 Windows 11，偏好简洁、分步骤的操作说明。',
                  'I use Windows 11 and prefer concise, step-by-step instructions.',
                )}
              />
            </label>
            <label className="confirm-memory">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                {t(
                  '我确认将以上内容保存为个人记忆，并在后续对话中使用。',
                  'I confirm this can be saved as personal memory and used in future conversations.',
                )}
              </span>
            </label>
            <ErrorBox error={error} />
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                {t('取消', 'Cancel')}
              </Button>
              <Button type="submit" loading={busy} disabled={!confirmed || !draft.text.trim()}>
                <Check size={15} />
                {t('确认保存', 'Confirm and save')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title={t('删除这条记忆？', 'Delete this memory?')} onClose={() => setDeleting(null)}>
          <p className="delete-preview">{deleting.text}</p>
          <p className="muted">
            {t(
              '删除后，这条内容将不再作为个人记忆使用。',
              'This content will no longer be used as personal memory after deletion.',
            )}
          </p>
          <ErrorBox error={error} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void deleteMemory()}>
              <Trash2 size={15} />
              {t('删除记忆', 'Delete memory')}
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
  const { t } = useI18n();
  const resource = useResource<Data>(isStaff(user) ? '/operations' : null, revision);
  const [view, setView] = useState('runs');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  if (!isStaff(user))
    return (
      <div className="page-content">
        <PageHeader
          title={t('评测与运行', 'Evaluations & runs')}
          description={t(
            '查看运行记录、服务用量、审计日志与评测结果。',
            'Inspect runs, service usage, audit logs, and evaluation results.',
          )}
        />
        <div className="restricted-panel">
          <ShieldCheck size={34} />
          <h2>
            {t(
              '此工作区面向 IT 支持和管理员',
              'This workspace is for IT support and administrators',
            )}
          </h2>
          <p>
            {t(
              '当前身份仍可在“对话与任务”中查看自己的检索轨迹。',
              'You can still view your own retrieval traces in Conversations & tasks.',
            )}
            <br />
            {t(
              '本地演示可以通过右上角身份选择器切换。',
              'In the local demo, use the identity selector at the top right to switch roles.',
            )}
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
        title={t('评测与运行', 'Evaluations & runs')}
        description={t(
          '查看运行记录、服务用量、审计日志与评测结果。',
          'Inspect runs, service usage, audit logs, and evaluation results.',
        )}
        action={
          <Button
            variant="secondary"
            loading={resource.loading}
            onClick={() => void resource.reload()}
          >
            <RefreshCw size={15} />
            {t('刷新记录', 'Refresh records')}
          </Button>
        }
      />
      <ErrorBox error={resource.error || error} retry={resource.reload} />
      <div className="operations-metrics">
        {[
          [
            Activity,
            t('运行记录', 'Runs'),
            actualRunCount,
            t('记录来自真实服务请求', 'Records from actual service requests'),
          ],
          [
            CheckCircle2,
            t('已完成运行', 'Completed runs'),
            completed,
            t('回答已完成的运行', 'Runs with completed responses'),
          ],
          [
            ShieldCheck,
            t('等待审批', 'Awaiting approval'),
            pending,
            t('需要人工决策的操作', 'Operations requiring a human decision'),
          ],
          [
            FlaskConical,
            t('评测记录', 'Evaluations'),
            data ? evaluations.length : '—',
            t('已持久化的评测结果', 'Persisted evaluation results'),
          ],
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
          {t('已记录实际费用', 'Recorded actual cost')}{' '}
          <strong>
            {totals.actual_cost_cny == null
              ? t('未提供', 'Not provided')
              : `¥${totals.actual_cost_cny}`}
          </strong>
        </span>
        <span>
          {t('预算占用', 'Reserved budget')}{' '}
          <strong>
            {totals.reserved_cost_cny == null
              ? t('未提供', 'Not provided')
              : `¥${totals.reserved_cost_cny}`}
          </strong>
        </span>
        <span>
          {t('用量未知 ', 'Unknown usage ')}
          <strong>{totals.unknown_usage ?? t('未提供', 'Not provided')}</strong>
          {t(' 次', ' calls')}
        </span>
        <span>{t('未知用量不会记为零', 'Unknown usage is never counted as zero')}</span>
      </div>
      <section className="panel operations-panel">
        <div className="operations-tabs">
          {[
            ['runs', t('运行记录', 'Runs'), Activity],
            ['usage', t('服务用量', 'Service usage'), Layers3],
            ['audit', t('审计日志', 'Audit logs'), ShieldCheck],
            ['evaluations', t('评测结果', 'Evaluation results'), FlaskConical],
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
                  aria-label={t('筛选运行记录', 'Filter runs')}
                  placeholder={t('搜索问题、运行 ID 或用户', 'Search questions, run IDs, or users')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <span className="muted small-text">
                {filtered.length}
                {t(' 条实际运行', ' actual runs')}
              </span>
            </div>
            {filtered.length ? (
              <div className="table-scroll">
                <table className="runs-table">
                  <thead>
                    <tr>
                      <th>{t('问题 / 运行', 'Question / run')}</th>
                      <th>{t('用户', 'User')}</th>
                      <th>{t('状态', 'Status')}</th>
                      <th>{t('创建时间', 'Created')}</th>
                      <th>{t('轨迹', 'Trace')}</th>
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
                            {t('检查', 'Inspect')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={t('尚无匹配的运行记录', 'No matching runs')}>
                {t(
                  '向助手发送一个问题后，这里会留下可追溯的运行记录。',
                  'Send the assistant a question to create a traceable run record here.',
                )}
              </Empty>
            )}
          </>
        ) : view === 'usage' ? (
          usage.length ? (
            <div className="table-scroll">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>{t('服务 / 模型', 'Service / model')}</th>
                    <th>{t('调用类型', 'Call type')}</th>
                    <th>{t('Token 用量', 'Token usage')}</th>
                    <th>{t('计量状态', 'Usage status')}</th>
                    <th>{t('实际 / 预留费用', 'Actual / reserved cost')}</th>
                    <th>{t('耗时', 'Latency')}</th>
                    <th>{t('记录时间', 'Recorded')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((item, index) => (
                    <tr key={item.id || index}>
                      <td>
                        <strong>
                          {item.provider || item.model || t('服务调用', 'Service call')}
                        </strong>
                        <small>{item.model || item.id}</small>
                      </td>
                      <td>{item.kind || item.operation || item.type || '—'}</td>
                      <td>
                        {item.total_tokens ??
                          item.tokens ??
                          (item.input_tokens != null || item.output_tokens != null
                            ? t(
                                `${item.input_tokens ?? '未知'} 入 / ${item.output_tokens ?? '未知'} 出`,
                                `${item.input_tokens ?? 'Unknown'} in / ${item.output_tokens ?? 'Unknown'} out`,
                              )
                            : t('未提供', 'Not provided'))}
                      </td>
                      <td>{item.usage_status || t('未知', 'Unknown')}</td>
                      <td>
                        {(item.actual_cny ?? item.actual_cost_cny) == null
                          ? t('未知', 'Unknown')
                          : `¥${item.actual_cny ?? item.actual_cost_cny}`}{' '}
                        /{' '}
                        {(item.reserved_cny ?? item.reserved_cost_cny) == null
                          ? t('未提供', 'Not provided')
                          : `¥${item.reserved_cny ?? item.reserved_cost_cny}`}
                      </td>
                      <td>
                        {item.latency_ms !== undefined
                          ? `${item.latency_ms} ms`
                          : item.elapsed_ms !== undefined
                            ? `${item.elapsed_ms} ms`
                            : t('未提供', 'Not provided')}
                      </td>
                      <td>{date(item.created_at || item.at, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={t('还没有外部服务用量', 'No external service usage')}
              icon={<Layers3 size={25} />}
            >
              {t(
                '本地演示不会调用云端模型，因此不会产生云端 Token 用量或费用。',
                'The local demo does not call cloud models or incur cloud token usage or charges.',
              )}
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
                    <strong>{item.action || item.event || t('审计事件', 'Audit event')}</strong>
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
            <Empty title={t('暂无审计事件', 'No audit events')}>
              {t(
                '身份切换、知识发布和受控操作等行为会被记录。',
                'Identity changes, knowledge publishing, and governed operations are recorded here.',
              )}
            </Empty>
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
                    {item.skill_id ||
                      item.name ||
                      item.type ||
                      t('检索评测', 'Retrieval evaluation')}
                    {item.version ? ` · v${item.version}` : ''}
                  </h3>
                  <p>
                    {item.case_count || item.total
                      ? t(
                          `${item.case_count || item.total} 个样本 · `,
                          `${item.case_count || item.total} cases · `,
                        )
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
          <Empty title={t('评测尚未运行', 'No evaluations yet')} icon={<FlaskConical size={25} />}>
            {t(
              '可在技能管理中评测指定版本；语料评测通过仓库命令运行并记录。',
              'Evaluate a version in Skills. Corpus evaluations run through repository commands and are recorded here.',
            )}
          </Empty>
        )}
      </section>
      <div className="operations-footnote">
        <ShieldCheck size={15} />
        {t(
          '用量来自服务端真实记录。缺失字段显示“未提供”，不估算或填充模拟费用。',
          'Usage comes from server records. Missing fields show “Not provided”; costs are not estimated or filled with demo values.',
        )}
      </div>
      {detail && (
        <Modal
          title={
            view === 'audit'
              ? t('审计事件详情', 'Audit event details')
              : t('评测结果详情', 'Evaluation details')
          }
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
  const { t } = useI18n();
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
    <Modal
      title={t('运行模式与云端连接', 'Runtime mode & cloud connections')}
      onClose={onClose}
      wide
    >
      <div className="config-mode">
        <span className="config-icon">
          <Settings2 size={26} />
        </span>
        <div>
          <h3>
            {mode === 'demo' ? t('本地演示模式', 'Local demo mode') : t('云端模式', 'Cloud mode')}
          </h3>
          <p>
            {mode === 'demo'
              ? t(
                  '真实 BM25 检索与原文摘录，无外部模型调用。',
                  'Real BM25 retrieval and source excerpts, without external model calls.',
                )
              : t(
                  '根据文档出站策略，连接生成、向量与重排服务。',
                  'Connect generation, embedding, and reranking services under document outbound policies.',
                )}
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
              <strong>{t('密钥只由服务端读取', 'Only the server reads credentials')}</strong>
              <p>
                {t(
                  '在后端环境变量或 .env 中配置服务地址和密钥。此页面不收集密钥，也不会将密钥保存到浏览器。',
                  'Configure endpoints and keys in server environment variables or .env. This page never collects keys or stores them in the browser.',
                )}
              </p>
            </div>
          </div>
          <div className="config-section">
            <PanelTitle
              aside={
                <Badge tone={data?.cloud_ready ? 'good' : 'warn'}>
                  {data?.cloud_ready
                    ? t('配置已就绪', 'Configuration ready')
                    : t('查看配置状态', 'Check configuration status')}
                </Badge>
              }
            >
              {t('连接状态', 'Connection status')}
            </PanelTitle>
            {missing.length > 0 ? (
              <div className="missing-config">
                <span className="field-caption">
                  {t('尚未配置的服务端变量', 'Missing server environment variables')}
                </span>
                <div>
                  {missing.map((name: string) => (
                    <code key={name}>{name}</code>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted">
                {data?.cloud_ready
                  ? t(
                      '所需配置完整，可由管理员测试连通性。',
                      'Required configuration is complete. An administrator can test connectivity.',
                    )
                  : t(
                      '以下为服务端返回的当前配置状态。',
                      'The server’s current configuration status appears below.',
                    )}
              </p>
            )}
            <details className="raw-details">
              <summary>
                {t('查看脱敏配置状态 ', 'View redacted configuration status ')}
                <ChevronRight size={15} />
              </summary>
              <pre>{display(data)}</pre>
            </details>
          </div>
          {user.role === 'admin' ? (
            <div className="config-check">
              <div>
                <h3>{t('验证服务连接', 'Verify service connections')}</h3>
                <p>
                  {t(
                    '使用服务端配置检查外部服务，会产生实际网络请求。',
                    'Tests external services using server configuration. This sends real network requests.',
                  )}
                </p>
              </div>
              <Button variant="secondary" loading={checking} onClick={() => void check()}>
                <RefreshCw size={15} />
                {t('检查连接', 'Check connections')}
              </Button>
            </div>
          ) : (
            <div className="form-note">
              <ShieldCheck size={16} />
              {t(
                '仅管理员可以发起云端连接检查。',
                'Only administrators can initiate cloud connectivity checks.',
              )}
            </div>
          )}
          {result && (
            <div className="config-check-result">
              <h3>{t('本次检查结果', 'Latest check results')}</h3>
              <pre>{display(result)}</pre>
            </div>
          )}
        </>
      )}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('关闭', 'Close')}
        </Button>
      </div>
    </Modal>
  );
}
