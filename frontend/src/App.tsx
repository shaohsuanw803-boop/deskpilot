import { documentTitle } from './knowledgeNames';
import { translate as t, useI18n } from './i18n';
import { useCallback, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Cable,
  ChevronDown,
  CircleHelp,
  GitBranch,
  HeartHandshake,
  LockKeyhole,
  Menu,
  MessageSquare,
  PanelLeftClose,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import {
  displayUserName,
  errorText,
  get,
  post,
  useResource,
  type Bootstrap,
  type Data,
} from './api';
import { Badge, Button, ErrorBox, Loading, Markdown, Modal, TraceView } from './components';
import Tasks from './Tasks';
import Knowledge from './Knowledge';
import Connectors from './Connectors';
import { Configuration, Memories, Operations, Skills } from './OtherPages';

export default function App() {
  const { locale, setLocale } = useI18n();
  const navigation = [
    { id: 'tasks', label: t('对话与任务', 'Conversations & tasks'), icon: MessageSquare },
    { id: 'knowledge', label: t('知识库', 'Knowledge base'), icon: BookOpen },
    { id: 'skills', label: t('技能管理', 'Skills'), icon: Workflow },
    { id: 'memory', label: t('记忆管理', 'Memory'), icon: HeartHandshake },
    { id: 'connectors', label: t('连接器与执行控制', 'Connectors & execution'), icon: Cable },
    { id: 'operations', label: t('评测与运行', 'Evaluation & runs'), icon: Activity },
  ];

  const bootstrap = useResource<Bootstrap>('/bootstrap');
  const [workspace, setWorkspace] = useState('tasks');
  const [revision, setRevision] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [source, setSource] = useState<Data | null>(null);
  const sourceRequest = useRef(0);
  const [trace, setTrace] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const data = bootstrap.data;
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
    void bootstrap.reload();
  }, [bootstrap.reload]);
  const closeSource = useCallback(() => {
    sourceRequest.current++;
    setSource(null);
  }, []);
  const closeTrace = useCallback(() => setTrace(null), []);
  const closeConfig = useCallback(() => setConfigOpen(false), []);
  async function switchUser(userId: string) {
    if (!data || userId === data.user.id) return;
    setSwitching(true);
    setError('');
    try {
      await post('/session', { user_id: userId });
      await bootstrap.reload();
      setRevision((value) => value + 1);
      sourceRequest.current++;
      setSource(null);
      setTrace(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSwitching(false);
    }
  }
  async function openSource(id: string) {
    if (!id) return;
    const token = ++sourceRequest.current;
    setSource({ loading: true });
    try {
      const result = await get(`/sources/${encodeURIComponent(id)}`);
      if (sourceRequest.current === token) setSource(result);
    } catch (e) {
      if (sourceRequest.current === token) setSource({ error: errorText(e) });
    }
  }
  if (!data)
    return (
      <div className="startup">
        <button
          className="language-toggle"
          type="button"
          lang={locale === 'en' ? 'zh-CN' : 'en'}
          aria-label={
            locale === 'en' ? 'Switch language to Chinese (中文)' : '切换为英文 (English)'
          }
          onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
        >
          {locale === 'en' ? '中文' : 'English'}
        </button>
        <div className="startup-brand">
          <Brand />
          <strong>
            DeskPilot<span>{t('企业 IT 服务台', 'Enterprise IT service desk')}</span>
          </strong>
        </div>
        {bootstrap.loading ? (
          <Loading>{t('正在连接你的工作区…', 'Connecting to your workspace…')}</Loading>
        ) : (
          <div className="startup-error">
            <h1>{t('工作台还没有连接到服务', 'The workspace is not connected')}</h1>
            <p>
              {t(
                '请启动端口 8000 上的后端 API，然后重新连接。',
                'Start the backend API on port 8000, then reconnect.',
              )}
            </p>
            <ErrorBox error={bootstrap.error} />
            <Button onClick={() => void bootstrap.reload()}>
              <RefreshCw size={16} />
              {t('重新连接', 'Reconnect')}
            </Button>
          </div>
        )}
      </div>
    );
  const current = navigation.find((item) => item.id === workspace)!;
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="mobile-scrim"
          aria-label={t('关闭导航', 'Close navigation')}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setWorkspace('tasks');
            setSidebarOpen(false);
          }}
          aria-label={t('DeskPilot 首页', 'DeskPilot home')}
        >
          <Brand />
          <span>
            DeskPilot<small>{t('企业 IT 服务台', 'Enterprise IT service desk')}</small>
          </span>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label={t('关闭导航', 'Close navigation')}
          onClick={() => setSidebarOpen(false)}
        >
          <PanelLeftClose size={20} />
        </button>
        <div className="workspace-label">{t('工作区', 'Workspace')}</div>
        <nav className="main-nav" aria-label={t('工作区导航', 'Workspace navigation')}>
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setWorkspace(item.id);
                setSidebarOpen(false);
              }}
              aria-current={workspace === item.id ? 'page' : undefined}
              className={workspace === item.id ? 'active' : ''}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'knowledge' && <small>{data.summary?.documents ?? '—'}</small>}
              {item.id === 'tasks' && workspace === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-link" onClick={() => setConfigOpen(true)}>
            <Settings2 size={17} />
            {t('运行配置', 'Configuration')}
            <ArrowRight size={15} />
          </button>
          <button className="sidebar-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            {t('使用说明', 'Getting started')}
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>
      <main className="main-shell">
        <header className="app-header">
          <div className="header-title">
            <button
              className="icon-button mobile-menu"
              aria-label={t('打开导航', 'Open navigation')}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <strong>{current.label}</strong>
          </div>
          <div className="header-actions">
            <button
              className="language-toggle"
              type="button"
              lang={locale === 'en' ? 'zh-CN' : 'en'}
              aria-label={
                locale === 'en' ? 'Switch language to Chinese (中文)' : '切换为英文 (English)'
              }
              onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
            >
              {locale === 'en' ? '中文' : 'English'}
            </button>
            <button
              className={`mode-badge ${data.mode === 'demo' ? 'demo' : 'cloud'}`}
              onClick={() => setConfigOpen(true)}
            >
              <span className="live-dot" />
              {data.mode === 'demo' ? t('本地演示', 'Local demo') : t('云端模式', 'Cloud mode')}
              {data.mode === 'demo' && (
                <span className="mode-detail">{t('· BM25 真实检索', '· Live BM25 retrieval')}</span>
              )}
              <ChevronDown size={12} />
            </button>
            <div className="header-divider" />
            <div className="identity-control">
              <span className="avatar">{displayUserName(data.user).slice(0, 1)}</span>
              <div>
                <label htmlFor="identity">
                  {switching ? t('切换中…', 'Switching…') : t('演示身份', 'Demo identity')}
                  <ChevronDown size={11} />
                </label>
                <select
                  id="identity"
                  aria-label={t('选择演示身份', 'Select demo identity')}
                  disabled={switching}
                  value={data.user.id}
                  onChange={(event) => void switchUser(event.target.value)}
                >
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {displayUserName(user)} ·{' '}
                      {(
                        {
                          employee: t('员工', 'Employee'),
                          it: t('IT 支持', 'IT support'),
                          admin: t('管理员', 'Administrator'),
                        } as Record<string, string>
                      )[user.role] || user.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>
        {error && <ErrorBox error={error} />}
        <div className={`main-view ${workspace === 'tasks' ? 'task-view' : ''}`} key={data.user.id}>
          {workspace === 'tasks' ? (
            <Tasks
              user={data.user}
              mode={data.mode}
              revision={revision}
              onChange={refresh}
              onSource={(id) => void openSource(id)}
              onTrace={setTrace}
            />
          ) : workspace === 'knowledge' ? (
            <Knowledge
              user={data.user}
              revision={revision}
              onChange={refresh}
              onSource={(id) => void openSource(id)}
            />
          ) : workspace === 'skills' ? (
            <Skills user={data.user} revision={revision} onChange={refresh} />
          ) : workspace === 'memory' ? (
            <Memories user={data.user} revision={revision} onChange={refresh} />
          ) : workspace === 'connectors' ? (
            <Connectors user={data.user} revision={revision} onChange={refresh} />
          ) : (
            <Operations
              user={data.user}
              revision={revision}
              onChange={refresh}
              onTrace={setTrace}
            />
          )}
        </div>
      </main>
      {configOpen && <Configuration user={data.user} mode={data.mode} onClose={closeConfig} />}
      {source && (
        <Modal
          title={documentTitle(source) || t('知识来源', 'Knowledge source')}
          onClose={closeSource}
          wide
        >
          {source.loading ? (
            <Loading>
              {t('正在核验权限并读取原文…', 'Checking access and loading the source…')}
            </Loading>
          ) : source.error ? (
            <ErrorBox error={source.error} />
          ) : (
            <>
              <div className="source-detail-meta">
                <span>
                  <BookOpen size={15} />
                  {t('版本', 'Version')}
                  {source.version || source.document?.version || '—'}
                </span>
                <span>
                  {source.anchor || source.chunk?.anchor || t('原文片段', 'Source excerpt')}
                </span>
                <Badge tone="good">{t('已核验访问权限', 'Access verified')}</Badge>
              </div>
              <div className="source-excerpt">
                <Markdown
                  text={
                    source.text ||
                    source.content ||
                    source.chunk?.text ||
                    t('该来源没有返回原文内容。', 'This source did not return any original text.')
                  }
                />
              </div>
              <div className="source-detail-footer">
                <ShieldCheck size={15} />
                <span>
                  {t(
                    '原文按当前身份的访问权限提供。',
                    'Source text is shown according to your current access permissions.',
                  )}
                </span>
              </div>
            </>
          )}
        </Modal>
      )}
      {trace && (
        <Modal
          title={t('检索与执行轨迹', 'Retrieval & execution trace')}
          subtitle={trace.id ? t(`运行 ${trace.id}`, `Run ${trace.id}`) : undefined}
          onClose={closeTrace}
          drawer
        >
          <TraceView data={trace} />
        </Modal>
      )}
      {help && (
        <Modal title={t('使用说明', 'Getting started')} onClose={() => setHelp(false)} wide>
          <div className="help-steps">
            {[
              [
                MessageSquare,
                '01',
                t('描述问题', 'Describe the issue'),
                t(
                  '告诉助手产品、版本和现象。证据不足时，助手会询问补充信息或明确说明未找到依据。',
                  'Include the product, version, and symptoms. The assistant asks for details or explains when evidence is missing.',
                ),
              ],
              [
                BookOpen,
                '02',
                t('核对来源', 'Check the sources'),
                t(
                  '回答下方的来源卡片可以打开原文；检索轨迹展示实际召回、权限检查和处理阶段。',
                  'Open source cards below an answer to read the original text. The trace shows retrieval, access checks, and processing stages.',
                ),
              ],
              [
                ShieldCheck,
                '03',
                t('确认行动', 'Confirm actions'),
                t(
                  '工具操作遵循角色和审批策略。IT 支持与管理员可以处理审批和服务工单。',
                  'Tools follow role and approval policies. IT support and administrators can handle approvals and service tickets.',
                ),
              ],
              [
                GitBranch,
                '04',
                t('沉淀知识', 'Share team knowledge'),
                t(
                  '工单解决后可以生成知识候选。审核发布后，解决方案才会加入后续检索。',
                  'Resolved tickets can become knowledge candidates. A solution enters retrieval only after review and publication.',
                ),
              ],
            ].map(([Icon, number, title, description]) => {
              const HelpIcon = Icon as typeof MessageSquare;
              return (
                <div key={number as string}>
                  <span>
                    <HelpIcon size={22} />
                  </span>
                  <div>
                    <small>{number as string}</small>
                    <h3>{title as string}</h3>
                    <p>{description as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="form-note">
            <LockKeyhole size={16} />
            {t(
              '不同身份拥有独立的访问范围、任务记录和个人记忆。',
              'Each identity has its own access scope, task history, and personal memory.',
            )}
          </div>
          <div className="modal-actions">
            <Button onClick={() => setHelp(false)}>
              {t('开始使用', 'Get started')}
              <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Brand() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          d="M9 10h10c9 0 14 4 14 10s-5 10-14 10H9V10Zm7 6v8h3c4 0 7-1 7-4s-3-4-7-4h-3Z"
          fill="currentColor"
        />
        <circle cx="32" cy="8" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}
