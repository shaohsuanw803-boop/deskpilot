import { translate as t, useI18n } from './i18n';
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
  useI18n();
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
  const [notice, setNotice] = useState<[string, string] | null>(null);
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
  async function action(key: string, work: () => Promise<unknown>, success: [string, string]) {
    setBusy(key);
    setError('');
    setNotice(null);
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
        title={t('知识库', 'Knowledge base')}
        description={t(
          '管理文档、发布版本与访问权限。',
          'Manage documents, published versions, and access permissions.',
        )}
        action={
          isStaff(user) && (
            <Button onClick={() => setUpload({})}>
              <Plus size={16} />
              {t('上传知识', 'Upload knowledge')}
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {t(...notice)}
          <button aria-label={t('关闭提示', 'Dismiss notice')} onClick={() => setNotice(null)}>
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
            <span>{t('可见文档', 'Visible documents')}</span>
            <strong>
              {documents.data ? items.length : '—'}
              <small>{t('篇', 'documents')}</small>
            </strong>
          </div>
        </div>
        <div className="knowledge-stat">
          <span className="stat-icon">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <span>{t('当前已发布', 'Published now')}</span>
            <strong>
              {documents.data ? items.filter((item) => item.status === 'published').length : '—'}
              <small>{t('篇', 'documents')}</small>
            </strong>
          </div>
        </div>
        <div className="knowledge-stat">
          <span className="stat-icon">
            <CloudOff size={21} />
          </span>
          <div>
            <span>{t('仅限本地检索', 'Local retrieval only')}</span>
            <strong>
              {documents.data ? items.filter((item) => !item.cloud_allowed).length : '—'}
              <small>{t('篇', 'documents')}</small>
            </strong>
          </div>
        </div>
        <button className="inspect-entry" onClick={() => setInspect(true)}>
          <span className="inspect-icon">
            <GitBranch size={24} />
          </span>
          <div>
            <strong>{t('检查一次检索', 'Inspect retrieval')}</strong>
            <p>
              {t('查看召回、权限过滤与重排', 'Review retrieval, access filtering, and reranking')}
            </p>
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
                {t('搜索知识文档', 'Search knowledge documents')}
              </label>
              <input
                id="knowledge-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('搜索文档、产品或负责人', 'Search documents, products, or owners')}
              />
            </div>
            <div className="select-wrap">
              <Filter size={15} />
              <label className="sr-only" htmlFor="knowledge-filter">
                {t('按发布状态筛选', 'Filter by publication status')}
              </label>
              <select
                id="knowledge-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">{t('全部状态', 'All statuses')}</option>
                <option value="published">{t('已发布', 'Published')}</option>
                <option value="staged">{t('待发布', 'Staged')}</option>
                <option value="candidate">{t('知识候选', 'Candidate')}</option>
                <option value="withdrawn">{t('已撤回', 'Withdrawn')}</option>
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
                    <th>{t('文档', 'Document')}</th>
                    <th>{t('发布状态', 'Publication status')}</th>
                    <th>{t('访问边界', 'Access scope')}</th>
                    <th>{t('更新时间', 'Updated')}</th>
                    <th aria-label={t('操作', 'Actions')} />
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
                              {document.product || t('通用知识', 'General knowledge')}
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
                          {document.cloud_allowed
                            ? t('允许云端', 'Cloud allowed')
                            : t('仅限本地', 'Local only')}
                        </span>
                        <small className="roles-label">{arrayRoles(document.roles)}</small>
                      </td>
                      <td className="date-cell">{date(document.updated_at)}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={t(`查看 ${document.title}`, `View ${document.title}`)}
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
              title={
                search || filter !== 'all'
                  ? t('没有符合条件的文档', 'No matching documents')
                  : t('知识库还没有可见文档', 'No visible documents yet')
              }
            >
              {isStaff(user)
                ? t(
                    '上传一份操作手册，完成解析后发布即可加入检索。',
                    'Upload a guide, review its parsed content, and publish it to make it searchable.',
                  )
                : t(
                    '你的访问角色决定了可见范围，已发布的授权文档会显示在这里。',
                    'Your role determines visibility. Published documents you can access appear here.',
                  )}
            </Empty>
          )}
          <div className="table-footer">
            <span>
              {t(
                `显示 ${filtered.length} 篇 · 共 ${items.length} 篇可见文档`,
                `Showing ${filtered.length} of ${items.length} visible documents`,
              )}
            </span>
            <span>
              <ShieldCheck size={13} />
              {t('权限在检索前生效', 'Access is checked before retrieval')}
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
                    aria-label={t('刷新导入任务', 'Refresh import jobs')}
                    onClick={() => void jobs.reload()}
                  >
                    <RefreshCw size={14} />
                  </button>
                }
              >
                {t('最近导入', 'Recent imports')}
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
                              ['已重试导入任务。', 'Import job retried.'],
                            )
                          }
                        >
                          <RefreshCw size={13} />
                          {t('重试导入', 'Retry import')}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="quiet-empty">
                  {t(
                    '暂无导入任务。上传文件后，可在这里查看实际处理状态。',
                    'No import jobs yet. Upload a file to track its processing status here.',
                  )}
                </p>
              )}
            </section>
          )}
          <div className="privacy-note">
            <LockKeyhole size={16} />
            <p>
              {t(
                '访问权限、发布状态与云端许可，会在召回、回答和查看来源时分别校验。',
                'Access permissions, publication status, and cloud eligibility are checked during retrieval, answering, and source viewing.',
              )}
            </p>
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
            setNotice([
              '文件已提交处理，请检查导入状态并审核发布。',
              'File submitted. Check the import status, then review and publish it.',
            ]);
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
              [t('产品', 'Product'), detail.product],
              [t('产品版本', 'Product version'), detail.product_version],
              [t('负责人', 'Owner'), detail.owner],
              [t('发布版本', 'Published version'), detail.active_version],
              [t('最新版本', 'Latest version'), detail.version],
              [t('分块数量', 'Chunk count'), detail.chunk_count],
              [t('可见角色', 'Visible to roles'), arrayRoles(detail.roles)],
              [
                t('云端使用', 'Cloud use'),
                detail.cloud_allowed
                  ? t('允许，仍需通过内容检查', 'Allowed, subject to content checks')
                  : t('仅限本地', 'Local only'),
              ],
              [
                t('指定用户', 'Specific users'),
                Array.isArray(detail.allowed_users) && detail.allowed_users.length
                  ? detail.allowed_users.join('、')
                  : t('按角色开放', 'Role-based access'),
              ],
              [t('最近更新', 'Last updated'), date(detail.updated_at, true)],
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
              {t('来自工单', 'From ticket')} {detail.source_ticket_id}
            </div>
          )}
          {isStaff(user) && <KnowledgePreview documentId={detail.id} />}
          <div className="form-note">
            <ShieldCheck size={15} />
            {t(
              '只有已发布版本参与检索。撤回后来源和检索会同时停止访问。',
              'Only published versions enter retrieval. Withdrawing a document disables both source access and retrieval.',
            )}
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
                {t('上传新版本', 'Upload new version')}
              </Button>
              <div className="button-row">
                {detail.status === 'published' && (
                  <Button
                    variant="danger"
                    loading={busy === 'withdraw'}
                    disabled={!!busy}
                    onClick={() =>
                      void action('withdraw', () => post(`/knowledge/${sid(detail.id)}/withdraw`), [
                        '文档已撤回，不再参与检索。',
                        'Document withdrawn from retrieval.',
                      ])
                    }
                  >
                    {t('撤回发布', 'Withdraw')}
                  </Button>
                )}
                <Button
                  loading={busy === 'publish'}
                  disabled={!!busy}
                  onClick={() =>
                    void action('publish', () => post(`/knowledge/${sid(detail.id)}/publish`), [
                      '知识版本已发布。',
                      'Knowledge version published.',
                    ])
                  }
                >
                  <Check size={15} />
                  {t('发布待审版本', 'Publish reviewed version')}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {inspect && (
        <Modal
          title={t('检查一次检索', 'Inspect retrieval')}
          onClose={() => setInspect(false)}
          wide
        >
          <form
            className="inspect-form"
            onSubmit={(event) => {
              event.preventDefault();
              void inspectQuery();
            }}
          >
            <label className="sr-only" htmlFor="inspect-query">
              {t('检索问题', 'Retrieval query')}
            </label>
            <input
              id="inspect-query"
              maxLength={8000}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(
                '输入一个问题，查看实际检索过程',
                'Enter a question to inspect retrieval',
              )}
              required
            />
            <Button type="submit" disabled={!query.trim()} loading={busy === 'inspect'}>
              <Search size={15} />
              {t('检索', 'Search')}
            </Button>
          </form>
          <ErrorBox error={error} />
          {result ? (
            <>
              <TraceView data={result} />
              {array(result.evidence).length > 0 && (
                <section className="inspect-sources">
                  <h3>{t('命中证据', 'Retrieved evidence')}</h3>
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
            <Empty
              title={t('输入问题以检查检索', 'Enter a question to inspect retrieval')}
              icon={<GitBranch size={25} />}
            >
              {t(
                '展示当前身份可见的候选、检索耗时和实际执行的处理阶段。',
                'View authorized candidates, retrieval latency, and the stages that actually ran.',
              )}
            </Empty>
          )}
        </Modal>
      )}
    </div>
  );
}
function arrayRoles(value: unknown) {
  const map: Record<string, string> = {
    employee: t('员工', 'Employee'),
    it: 'IT',
    admin: t('管理员', 'Administrator'),
  };
  return Array.isArray(value) && value.length
    ? value.map((role) => map[role] || role).join(' / ')
    : t('按文档策略', 'Document policy');
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
  useI18n();
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
      setError(t('请选择要上传的文件。', 'Choose a file to upload.'));
      return;
    }
    if (!metadata.roles.length) {
      setError(t('请至少选择一个可见角色。', 'Select at least one role with access.'));
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
    <Modal
      title={
        document.id
          ? t('上传知识新版本', 'Upload a new knowledge version')
          : t('上传知识文档', 'Upload a knowledge document')
      }
      onClose={onClose}
      wide
    >
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
          <strong>
            {file ? file.name : t('选择文件，或拖放到这里', 'Choose a file or drop it here')}
          </strong>
          <small>
            {file
              ? t(
                  `${(file.size / 1024).toFixed(1)} KB · 点击重新选择`,
                  `${(file.size / 1024).toFixed(1)} KB · Click to replace`,
                )
              : t(
                  '支持 Markdown、TXT、PDF、Word 文档，解析能力以服务端为准',
                  'Supports Markdown, TXT, PDF, and Word; extraction depends on the backend.',
                )}
          </small>
        </button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          aria-label={t('选择知识文件', 'Choose knowledge file')}
          accept=".md,.markdown,.txt,.pdf,.docx"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <div className="form-grid">
          <label className="field full">
            {t('文档标题', 'Document title')}
            <input
              required
              value={metadata.title}
              maxLength={160}
              onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
              placeholder={t(
                '例如：Windows 11 VPN 故障排查指南',
                'For example: Windows 11 VPN troubleshooting',
              )}
            />
          </label>
          <label className="field">
            {t('所属产品', 'Product')}
            <input
              required
              value={metadata.product}
              onChange={(event) => setMetadata({ ...metadata, product: event.target.value })}
              placeholder={t('例如：GlobalProtect', 'For example: GlobalProtect')}
            />
          </label>
          <label className="field">
            {t('产品版本', 'Product version')}
            <input
              value={metadata.product_version}
              onChange={(event) =>
                setMetadata({ ...metadata, product_version: event.target.value })
              }
              placeholder={t('例如：6.2 / 通用', 'For example: 6.2 / General')}
            />
          </label>
          <label className="field full">
            {t('知识负责人', 'Knowledge owner')}
            <input
              required
              value={metadata.owner}
              onChange={(event) => setMetadata({ ...metadata, owner: event.target.value })}
              placeholder={t('团队或负责人的名称', 'Team or owner name')}
            />
          </label>
        </div>
        <fieldset className="role-fieldset">
          <legend>{t('哪些角色可以访问？', 'Which roles can access this?')}</legend>
          <div className="checkbox-row">
            {[
              ['employee', t('员工', 'Employee')],
              ['it', t('IT 支持', 'IT support')],
              ['admin', t('管理员', 'Administrator')],
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
          {t('指定用户', 'Specific users')}
          <span className="optional">
            {t('可选，逗号分隔用户 ID', 'Optional, comma-separated user IDs')}
          </span>
          <input
            value={allowed}
            onChange={(event) => setAllowed(event.target.value)}
            placeholder={t(
              '留空则仅按角色判断，例如 alice, chen',
              'Leave blank for role-based access; for example alice, chen',
            )}
          />
        </label>
        <label className="permission-toggle">
          <input
            type="checkbox"
            checked={metadata.cloud_allowed}
            onChange={(event) => setMetadata({ ...metadata, cloud_allowed: event.target.checked })}
          />
          <div>
            <strong>
              {t(
                '允许此文档参与云端检索和回答',
                'Allow this document in cloud retrieval and answers',
              )}
            </strong>
            <p>
              {t(
                '默认仅在本地使用。开启后仍会执行权限与敏感内容检查。',
                'Local-only by default. Access and sensitive-content checks still apply when enabled.',
              )}
            </p>
          </div>
          <Globe2 size={19} />
        </label>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('取消', 'Cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!file}>
            {t('提交并开始解析', 'Submit and parse')}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function KnowledgePreview({ documentId }: { documentId: string }) {
  useI18n();
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
                ? t('已解析', 'Parsed')
                : data.state === 'published'
                  ? t('已发布', 'Published')
                  : data.state === 'failed'
                    ? t('解析失败', 'Parsing failed')
                    : data.state}
            </Badge>
          )
        }
      >
        {t('解析与发布预览', 'Parsing & publication preview')}
      </PanelTitle>
      <p className="preview-description">
        {t(
          '检查即将发布版本的元数据和原文分块。只有 IT 支持与管理员可以查看暂存内容。',
          'Review metadata and source chunks before publication. Only IT support and administrators can view staged content.',
        )}
      </p>
      <ErrorBox error={preview.error} retry={preview.reload} />
      {preview.loading ? (
        <Loading>{t('正在读取解析结果…', 'Loading parsed content…')}</Loading>
      ) : (
        data && (
          <>
            <div className="preview-metadata">
              <span>
                {t('标题', 'Title')}
                <strong>{metadata.title || t('未提供', 'Not provided')}</strong>
              </span>
              <span>
                {t('产品', 'Product')}{' '}
                <strong>
                  {metadata.product || t('未提供', 'Not provided')} /{' '}
                  {metadata.product_version || t('通用', 'General')}
                </strong>
              </span>
              <span>
                {t('可见角色', 'Visible to roles')}
                <strong>{arrayRoles(metadata.roles)}</strong>
              </span>
              <span>
                {t('云端使用', 'Cloud use')}
                <strong>
                  {metadata.cloud_allowed ? t('允许', 'Allowed') : t('仅限本地', 'Local only')}
                </strong>
              </span>
              {Array.isArray(metadata.allowed_users) && metadata.allowed_users.length > 0 && (
                <span>
                  {t('指定用户', 'Specific users')}
                  <strong>{metadata.allowed_users.join('、')}</strong>
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
                        <strong>
                          {chunk.anchor || t(`分块 ${index + 1}`, `Chunk ${index + 1}`)}
                        </strong>
                        <small>
                          {chunk.token_count == null
                            ? t(
                                `${(chunk.text || '').length} 字符`,
                                `${(chunk.text || '').length} characters`,
                              )
                            : `${chunk.token_count} tokens`}
                        </small>
                        <ChevronRight size={14} />
                      </summary>
                      <pre>
                        {chunk.text || t('此分块没有原文内容', 'No source text in this chunk')}
                      </pre>
                    </details>
                  ))}
                </div>
                {chunks.length > 3 && (
                  <button
                    className="text-button preview-expand"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded
                      ? t('收起额外分块', 'Show fewer chunks')
                      : t(`查看全部 ${chunks.length} 个分块`, `View all ${chunks.length} chunks`)}
                    <ChevronRight size={14} />
                  </button>
                )}
              </>
            ) : (
              <p className="quiet-empty">
                {t(
                  '该版本暂未生成可用分块，请检查导入任务状态。',
                  'This version has no usable chunks yet. Check its import job status.',
                )}
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
