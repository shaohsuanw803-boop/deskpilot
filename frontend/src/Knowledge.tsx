import { useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  FileText,
  Filter,
  GitBranch,
  Globe2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  array,
  date,
  display,
  errorText,
  isStaff,
  post,
  request,
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
  FileMark,
  Loading,
  Modal,
  PageHeader,
  PanelTitle,
  SourceCard,
  TraceView,
} from './components';

type Props = { user: User; revision: number; onChange: () => void; onSource: (id: string) => void };
export default function Knowledge({ user, revision, onChange, onSource }: Props) {
  const documents = useResource<{ items: Data[] }>('/knowledge', revision);
  const jobs = useResource<{ items: Data[] }>(isStaff(user) ? '/knowledge/jobs' : null, revision);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [upload, setUpload] = useState<Data | null>(null);
  const [detail, setDetail] = useState<Data | null>(null);
  const [inspect, setInspect] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const items = array(documents.data?.items);
  const filtered = items.filter(
    (item) =>
      [item.title, item.product, item.product_version, item.owner]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === 'all' || item.status === filter),
  );
  const jobItems = array(jobs.data?.items).sort((a, b) =>
    (b.created_at || b.updated_at || '').localeCompare(a.created_at || a.updated_at || ''),
  );
  async function action(key: string, work: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
      onChange();
      setDetail(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  async function inspectQuery() {
    setBusy('inspect');
    setError('');
    try {
      setResult(await post('/retrieval/inspect', { query }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-content">
      <PageHeader
        title="知识库"
        description="管理文档、发布版本与访问权限。"
        action={
          isStaff(user) && (
            <Button onClick={() => setUpload({})}>
              <Plus size={16} />
              上传知识
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="knowledge-overview">
        <div className="knowledge-stat">
          <span className="stat-icon">
            <BookOpen size={21} />
          </span>
          <div>
            <span>可见文档</span>
            <strong>
              {documents.data ? items.length : '—'}
              <small>篇</small>
            </strong>
          </div>
        </div>
        <div className="knowledge-stat">
          <span className="stat-icon">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <span>当前已发布</span>
            <strong>
              {documents.data ? items.filter((item) => item.status === 'published').length : '—'}
              <small>篇</small>
            </strong>
          </div>
        </div>
        <div className="knowledge-stat">
          <span className="stat-icon">
            <CloudOff size={21} />
          </span>
          <div>
            <span>仅限本地检索</span>
            <strong>
              {documents.data ? items.filter((item) => !item.cloud_allowed).length : '—'}
              <small>篇</small>
            </strong>
          </div>
        </div>
        <button className="inspect-entry" onClick={() => setInspect(true)}>
          <span className="inspect-icon">
            <GitBranch size={24} />
          </span>
          <div>
            <strong>检查一次检索</strong>
            <p>查看召回、权限过滤与重排</p>
          </div>
          <ArrowUpRight size={20} />
        </button>
      </div>
      <div className="knowledge-grid">
        <section className="panel knowledge-panel">
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={17} />
              <label className="sr-only" htmlFor="knowledge-search">
                搜索知识文档
              </label>
              <input
                id="knowledge-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索文档、产品或负责人"
              />
            </div>
            <div className="select-wrap">
              <Filter size={15} />
              <label className="sr-only" htmlFor="knowledge-filter">
                按发布状态筛选
              </label>
              <select
                id="knowledge-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">全部状态</option>
                <option value="published">已发布</option>
                <option value="staged">待发布</option>
                <option value="candidate">知识候选</option>
                <option value="withdrawn">已撤回</option>
              </select>
            </div>
          </div>
          <ErrorBox error={documents.error} retry={documents.reload} />
          {documents.loading && !documents.data ? (
            <Loading />
          ) : filtered.length ? (
            <div className="table-scroll">
              <table className="knowledge-table">
                <thead>
                  <tr>
                    <th>文档</th>
                    <th>发布状态</th>
                    <th>访问边界</th>
                    <th>更新时间</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <button className="document-title" onClick={() => setDetail(document)}>
                          <FileMark />
                          <span>
                            <strong>{document.title}</strong>
                            <small>
                              {document.product || '通用知识'}
                              {document.product_version ? ` · ${document.product_version}` : ''}
                              <span className="muted">
                                {' '}
                                / v{document.active_version || document.version || '—'}
                              </span>
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <Badge value={document.status} />
                      </td>
                      <td>
                        <span className="access-label">
                          {document.cloud_allowed ? (
                            <Globe2 size={14} />
                          ) : (
                            <LockKeyhole size={14} />
                          )}
                          {document.cloud_allowed ? '允许云端' : '仅限本地'}
                        </span>
                        <small className="roles-label">{arrayRoles(document.roles)}</small>
                      </td>
                      <td className="date-cell">{date(document.updated_at)}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`查看 ${document.title}`}
                          onClick={() => setDetail(document)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={search || filter !== 'all' ? '没有符合条件的文档' : '知识库还没有可见文档'}
            >
              {isStaff(user)
                ? '上传一份操作手册，完成解析后发布即可加入检索。'
                : '你的访问角色决定了可见范围，已发布的授权文档会显示在这里。'}
            </Empty>
          )}
          <div className="table-footer">
            <span>
              显示 {filtered.length} 篇 · 共 {items.length} 篇可见文档
            </span>
            <span>
              <ShieldCheck size={13} />
              权限在检索前生效
            </span>
          </div>
        </section>
        <aside className="knowledge-aside">
          {isStaff(user) && (
            <section className="panel jobs-panel">
              <PanelTitle
                aside={
                  <button
                    className="icon-button"
                    aria-label="刷新导入任务"
                    onClick={() => void jobs.reload()}
                  >
                    <RefreshCw size={14} />
                  </button>
                }
              >
                最近导入
              </PanelTitle>
              <ErrorBox error={jobs.error} retry={jobs.reload} />
              {jobItems.length ? (
                <div className="job-list">
                  {jobItems.slice(0, 6).map((job) => (
                    <div className="job-item" key={job.id}>
                      <div>
                        <FileText size={15} />
                        <strong>{job.filename || job.title || job.document_id || job.id}</strong>
                      </div>
                      <div>
                        <Badge value={job.status} />
                        <time>{date(job.updated_at || job.created_at)}</time>
                      </div>
                      {job.error && <p className="job-error">{display(job.error)}</p>}
                      {['failed', 'error'].includes(job.status) && (
                        <Button
                          variant="ghost"
                          loading={busy === job.id}
                          disabled={!!busy}
                          onClick={() =>
                            void action(
                              job.id,
                              () => post(`/knowledge/jobs/${sid(job.id)}/retry`),
                              '已重试导入任务。',
                            )
                          }
                        >
                          <RefreshCw size={13} />
                          重试导入
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="quiet-empty">暂无导入任务。上传文件后，可在这里查看实际处理状态。</p>
              )}
            </section>
          )}
          <div className="privacy-note">
            <LockKeyhole size={16} />
            <p>访问权限、发布状态与云端许可，会在召回、回答和查看来源时分别校验。</p>
          </div>
        </aside>
      </div>
      {upload && (
        <UploadModal
          document={upload}
          onClose={() => setUpload(null)}
          onSaved={() => {
            setUpload(null);
            onChange();
            setNotice('文件已提交处理，请检查导入状态并审核发布。');
          }}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <div className="detail-status">
            <Badge value={detail.status} />
            <span>{detail.id}</span>
          </div>
          <div className="metadata-grid">
            {[
              ['产品', detail.product],
              ['产品版本', detail.product_version],
              ['负责人', detail.owner],
              ['发布版本', detail.active_version],
              ['最新版本', detail.version],
              ['分块数量', detail.chunk_count],
              ['可见角色', arrayRoles(detail.roles)],
              ['云端使用', detail.cloud_allowed ? '允许，仍需通过内容检查' : '仅限本地'],
              [
                '指定用户',
                Array.isArray(detail.allowed_users) && detail.allowed_users.length
                  ? detail.allowed_users.join('、')
                  : '按角色开放',
              ],
              ['最近更新', date(detail.updated_at, true)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{display(value)}</strong>
              </div>
            ))}
          </div>
          {detail.source_ticket_id && (
            <div className="form-note">
              <BookOpen size={15} />
              来自工单 {detail.source_ticket_id}
            </div>
          )}
          {isStaff(user) && <KnowledgePreview documentId={detail.id} />}
          <div className="form-note">
            <ShieldCheck size={15} />
            只有已发布版本参与检索。撤回后来源和检索会同时停止访问。
          </div>
          <ErrorBox error={error} />
          {isStaff(user) && (
            <div className="modal-actions spread">
              <Button
                variant="secondary"
                onClick={() => {
                  setUpload(detail);
                  setDetail(null);
                }}
              >
                <Upload size={15} />
                上传新版本
              </Button>
              <div className="button-row">
                {detail.status === 'published' && (
                  <Button
                    variant="danger"
                    loading={busy === 'withdraw'}
                    disabled={!!busy}
                    onClick={() =>
                      void action(
                        'withdraw',
                        () => post(`/knowledge/${sid(detail.id)}/withdraw`),
                        '文档已撤回，不再参与检索。',
                      )
                    }
                  >
                    撤回发布
                  </Button>
                )}
                <Button
                  loading={busy === 'publish'}
                  disabled={!!busy}
                  onClick={() =>
                    void action(
                      'publish',
                      () => post(`/knowledge/${sid(detail.id)}/publish`),
                      '知识版本已发布。',
                    )
                  }
                >
                  <Check size={15} />
                  发布待审版本
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {inspect && (
        <Modal title="检查一次检索" onClose={() => setInspect(false)} wide>
          <form
            className="inspect-form"
            onSubmit={(event) => {
              event.preventDefault();
              void inspectQuery();
            }}
          >
            <label className="sr-only" htmlFor="inspect-query">
              检索问题
            </label>
            <input
              id="inspect-query"
              maxLength={8000}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入一个问题，查看实际检索过程"
              required
            />
            <Button type="submit" disabled={!query.trim()} loading={busy === 'inspect'}>
              <Search size={15} />
              检索
            </Button>
          </form>
          <ErrorBox error={error} />
          {result ? (
            <>
              <TraceView data={result} />
              {array(result.evidence).length > 0 && (
                <section className="inspect-sources">
                  <h3>命中证据</h3>
                  {array(result.evidence).map((source, index) => (
                    <SourceCard
                      source={source}
                      index={index}
                      onOpen={onSource}
                      key={source.id || index}
                    />
                  ))}
                </section>
              )}
            </>
          ) : (
            <Empty title="输入问题以检查检索" icon={<GitBranch size={25} />}>
              展示当前身份可见的候选、检索耗时和实际执行的处理阶段。
            </Empty>
          )}
        </Modal>
      )}
    </div>
  );
}
function arrayRoles(value: unknown) {
  const map: Record<string, string> = { employee: '员工', it: 'IT', admin: '管理员' };
  return Array.isArray(value) && value.length
    ? value.map((role) => map[role] || role).join(' / ')
    : '按文档策略';
}
function UploadModal({
  document,
  onClose,
  onSaved,
}: {
  document: Data;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<Data>({
    title: document.title || '',
    product: document.product || '',
    product_version: document.product_version || '',
    owner: document.owner || '',
    roles: document.roles || ['employee', 'it', 'admin'],
    cloud_allowed: document.cloud_allowed || false,
    allowed_users: document.allowed_users || [],
  });
  const [allowed, setAllowed] = useState((document.allowed_users || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function accept(file: File | undefined) {
    if (!file) return;
    setFile(file);
    if (!metadata.title) setMetadata({ ...metadata, title: file.name.replace(/\.[^.]+$/, '') });
  }
  async function save() {
    if (!file) {
      setError('请选择要上传的文件。');
      return;
    }
    if (!metadata.roles.length) {
      setError('请至少选择一个可见角色。');
      return;
    }
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append(
      'metadata',
      JSON.stringify({ ...metadata, allowed_users: allowed.split(/[,，\s]+/).filter(Boolean) }),
    );
    try {
      await request(document.id ? `/knowledge/${sid(document.id)}/versions` : '/knowledge', {
        method: 'POST',
        body: form,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={document.id ? '上传知识新版本' : '上传知识文档'} onClose={onClose} wide>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <button
          type="button"
          className={`upload-zone ${file ? 'has-file' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            accept(event.dataTransfer.files[0]);
          }}
        >
          <span>
            <Upload size={24} />
          </span>
          <strong>{file ? file.name : '选择文件，或拖放到这里'}</strong>
          <small>
            {file
              ? `${(file.size / 1024).toFixed(1)} KB · 点击重新选择`
              : '支持 Markdown、TXT、PDF、Word 文档，解析能力以服务端为准'}
          </small>
        </button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          aria-label="选择知识文件"
          accept=".md,.markdown,.txt,.pdf,.docx"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <div className="form-grid">
          <label className="field full">
            文档标题
            <input
              required
              value={metadata.title}
              maxLength={160}
              onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
              placeholder="例如：Windows 11 VPN 故障排查指南"
            />
          </label>
          <label className="field">
            所属产品
            <input
              required
              value={metadata.product}
              onChange={(event) => setMetadata({ ...metadata, product: event.target.value })}
              placeholder="例如：GlobalProtect"
            />
          </label>
          <label className="field">
            产品版本
            <input
              value={metadata.product_version}
              onChange={(event) =>
                setMetadata({ ...metadata, product_version: event.target.value })
              }
              placeholder="例如：6.2 / 通用"
            />
          </label>
          <label className="field full">
            知识负责人
            <input
              required
              value={metadata.owner}
              onChange={(event) => setMetadata({ ...metadata, owner: event.target.value })}
              placeholder="团队或负责人的名称"
            />
          </label>
        </div>
        <fieldset className="role-fieldset">
          <legend>哪些角色可以访问？</legend>
          <div className="checkbox-row">
            {[
              ['employee', '员工'],
              ['it', 'IT 支持'],
              ['admin', '管理员'],
            ].map(([role, label]) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={metadata.roles.includes(role)}
                  onChange={(event) =>
                    setMetadata({
                      ...metadata,
                      roles: event.target.checked
                        ? [...metadata.roles, role]
                        : metadata.roles.filter((item: string) => item !== role),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          指定用户 <span className="optional">可选，逗号分隔用户 ID</span>
          <input
            value={allowed}
            onChange={(event) => setAllowed(event.target.value)}
            placeholder="留空则仅按角色判断，例如 alice, chen"
          />
        </label>
        <label className="permission-toggle">
          <input
            type="checkbox"
            checked={metadata.cloud_allowed}
            onChange={(event) => setMetadata({ ...metadata, cloud_allowed: event.target.checked })}
          />
          <div>
            <strong>允许此文档参与云端检索和回答</strong>
            <p>默认仅在本地使用。开启后仍会执行权限与敏感内容检查。</p>
          </div>
          <Globe2 size={19} />
        </label>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" loading={busy} disabled={!file}>
            提交并开始解析
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function KnowledgePreview({ documentId }: { documentId: string }) {
  const preview = useResource<Data>(`/knowledge/${sid(documentId)}/preview`);
  const [expanded, setExpanded] = useState(false);
  const data = preview.data;
  const chunks = array(data?.chunks);
  const metadata = data?.metadata || {};
  return (
    <section className="knowledge-preview">
      <PanelTitle
        aside={
          data && (
            <Badge value={data.state}>
              v{data.version} ·{' '}
              {data.state === 'prepared'
                ? '已解析'
                : data.state === 'published'
                  ? '已发布'
                  : data.state === 'failed'
                    ? '解析失败'
                    : data.state}
            </Badge>
          )
        }
      >
        解析与发布预览
      </PanelTitle>
      <p className="preview-description">
        检查即将发布版本的元数据和原文分块。只有 IT 支持与管理员可以查看暂存内容。
      </p>
      <ErrorBox error={preview.error} retry={preview.reload} />
      {preview.loading ? (
        <Loading>正在读取解析结果…</Loading>
      ) : (
        data && (
          <>
            <div className="preview-metadata">
              <span>
                标题 <strong>{metadata.title || '未提供'}</strong>
              </span>
              <span>
                产品{' '}
                <strong>
                  {metadata.product || '未提供'} / {metadata.product_version || '通用'}
                </strong>
              </span>
              <span>
                可见角色 <strong>{arrayRoles(metadata.roles)}</strong>
              </span>
              <span>
                云端使用 <strong>{metadata.cloud_allowed ? '允许' : '仅限本地'}</strong>
              </span>
              {Array.isArray(metadata.allowed_users) && metadata.allowed_users.length > 0 && (
                <span>
                  指定用户 <strong>{metadata.allowed_users.join('、')}</strong>
                </span>
              )}
            </div>
            {chunks.length ? (
              <>
                <div className="preview-chunks">
                  {chunks.slice(0, expanded ? chunks.length : 3).map((chunk, index) => (
                    <details className="preview-chunk" key={chunk.id || index} open={index === 0}>
                      <summary>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <strong>{chunk.anchor || `分块 ${index + 1}`}</strong>
                        <small>
                          {chunk.token_count == null
                            ? `${(chunk.text || '').length} 字符`
                            : `${chunk.token_count} tokens`}
                        </small>
                        <ChevronRight size={14} />
                      </summary>
                      <pre>{chunk.text || '此分块没有原文内容'}</pre>
                    </details>
                  ))}
                </div>
                {chunks.length > 3 && (
                  <button
                    className="text-button preview-expand"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded ? '收起额外分块' : `查看全部 ${chunks.length} 个分块`}
                    <ChevronRight size={14} />
                  </button>
                )}
              </>
            ) : (
              <p className="quiet-empty">该版本暂未生成可用分块，请检查导入任务状态。</p>
            )}
          </>
        )
      )}
    </section>
  );
}
