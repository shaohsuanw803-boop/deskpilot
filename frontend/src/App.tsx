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
import { errorText, get, post, useResource, type Bootstrap, type Data } from './api';
import { Badge, Button, ErrorBox, Loading, Markdown, Modal, TraceView } from './components';
import Tasks from './Tasks';
import Knowledge from './Knowledge';
import Connectors from './Connectors';
import { Configuration, Memories, Operations, Skills } from './OtherPages';

const navigation = [
  { id: 'tasks', label: '对话与任务', icon: MessageSquare },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'skills', label: '技能管理', icon: Workflow },
  { id: 'memory', label: '记忆管理', icon: HeartHandshake },
  { id: 'connectors', label: '连接器与执行控制', icon: Cable },
  { id: 'operations', label: '评测与运行', icon: Activity },
];
export default function App() {
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
        <div className="startup-brand">
          <Brand />
          <strong>
            DeskPilot<span>企业 IT 服务台</span>
          </strong>
        </div>
        {bootstrap.loading ? (
          <Loading>正在连接你的工作区…</Loading>
        ) : (
          <div className="startup-error">
            <h1>工作台还没有连接到服务</h1>
            <p>请启动端口 8000 上的后端 API，然后重新连接。</p>
            <ErrorBox error={bootstrap.error} />
            <Button onClick={() => void bootstrap.reload()}>
              <RefreshCw size={16} />
              重新连接
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
          aria-label="关闭导航"
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
          aria-label="DeskPilot 首页"
        >
          <Brand />
          <span>
            DeskPilot<small>企业 IT 服务台</small>
          </span>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        >
          <PanelLeftClose size={20} />
        </button>
        <div className="workspace-label">工作区</div>
        <nav className="main-nav" aria-label="工作区导航">
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
            运行配置
            <ArrowRight size={15} />
          </button>
          <button className="sidebar-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            使用说明
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>
      <main className="main-shell">
        <header className="app-header">
          <div className="header-title">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <strong>{current.label}</strong>
          </div>
          <div className="header-actions">
            <button
              className={`mode-badge ${data.mode === 'demo' ? 'demo' : 'cloud'}`}
              onClick={() => setConfigOpen(true)}
            >
              <span className="live-dot" />
              {data.mode === 'demo' ? '本地演示' : '云端模式'}
              {data.mode === 'demo' && <span className="mode-detail">· BM25 真实检索</span>}
              <ChevronDown size={12} />
            </button>
            <div className="header-divider" />
            <div className="identity-control">
              <span className="avatar">{data.user.name.slice(0, 1)}</span>
              <div>
                <label htmlFor="identity">
                  {switching ? '切换中…' : '演示身份'}
                  <ChevronDown size={11} />
                </label>
                <select
                  id="identity"
                  aria-label="选择演示身份"
                  disabled={switching}
                  value={data.user.id}
                  onChange={(event) => void switchUser(event.target.value)}
                >
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ·{' '}
                      {(
                        { employee: '员工', it: 'IT 支持', admin: '管理员' } as Record<
                          string,
                          string
                        >
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
          title={source.title || source.document?.title || '知识来源'}
          onClose={closeSource}
          wide
        >
          {source.loading ? (
            <Loading>正在核验权限并读取原文…</Loading>
          ) : source.error ? (
            <ErrorBox error={source.error} />
          ) : (
            <>
              <div className="source-detail-meta">
                <span>
                  <BookOpen size={15} />
                  版本 {source.version || source.document?.version || '—'}
                </span>
                <span>{source.anchor || source.chunk?.anchor || '原文片段'}</span>
                <Badge tone="good">已核验访问权限</Badge>
              </div>
              <div className="source-excerpt">
                <Markdown
                  text={
                    source.text ||
                    source.content ||
                    source.chunk?.text ||
                    '该来源没有返回原文内容。'
                  }
                />
              </div>
              <div className="source-detail-footer">
                <ShieldCheck size={15} />
                <span>原文按当前身份的访问权限提供。</span>
              </div>
            </>
          )}
        </Modal>
      )}
      {trace && (
        <Modal
          title="检索与执行轨迹"
          subtitle={trace.id ? `运行 ${trace.id}` : undefined}
          onClose={closeTrace}
          drawer
        >
          <TraceView data={trace} />
        </Modal>
      )}
      {help && (
        <Modal title="使用说明" onClose={() => setHelp(false)} wide>
          <div className="help-steps">
            {[
              [
                MessageSquare,
                '01',
                '描述问题',
                '告诉助手产品、版本和现象。证据不足时，助手会询问补充信息或明确说明未找到依据。',
              ],
              [
                BookOpen,
                '02',
                '核对来源',
                '回答下方的来源卡片可以打开原文；检索轨迹展示实际召回、权限检查和处理阶段。',
              ],
              [
                ShieldCheck,
                '03',
                '确认行动',
                '工具操作遵循角色和审批策略。IT 支持与管理员可以处理审批和服务工单。',
              ],
              [
                GitBranch,
                '04',
                '沉淀知识',
                '工单解决后可以生成知识候选。审核发布后，解决方案才会加入后续检索。',
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
            不同身份拥有独立的访问范围、任务记录和个人记忆。
          </div>
          <div className="modal-actions">
            <Button onClick={() => setHelp(false)}>
              开始使用
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
