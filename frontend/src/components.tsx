import { translate as t, useI18n } from './i18n';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  LoaderCircle,
  SearchX,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { array, display, type Data } from './api';

function statusLabels(): Record<string, string> {
  return {
    completed: t('已完成', 'Completed'),
    ready: t('可用', 'Ready'),
    published: t('已发布', 'Published'),
    active: t('使用中', 'Active'),
    evaluated: t('已评测', 'Evaluated'),
    passed: t('通过', 'Passed'),
    succeeded: t('成功', 'Succeeded'),
    awaiting_approval: t('等待审批', 'Awaiting approval'),
    needs_clarification: t('需要补充', 'Needs clarification'),
    no_evidence: t('暂无依据', 'No evidence'),
    degraded: t('降级运行', 'Degraded'),
    failed: t('失败', 'Failed'),
    rejected: t('已拒绝', 'Rejected'),
    pending: t('待处理', 'Pending'),
    processing: t('处理中', 'In progress'),
    staged: t('待发布', 'Staged'),
    draft: t('草稿', 'Draft'),
    withdrawn: t('已撤回', 'Withdrawn'),
    approved: t('已批准', 'Approved'),
    consumed: t('已执行', 'Executed'),
    prepared: t('已解析，待审核', 'Parsed · awaiting review'),
    staging: t('暂存版本', 'Staged version'),
    running: t('执行中', 'Running'),
    resolved: t('已解决', 'Resolved'),
    open: t('处理中', 'In progress'),
    expired: t('已过期', 'Expired'),
    employee: t('员工', 'Employee'),
    it: t('IT 支持', 'IT support'),
    admin: t('管理员', 'Administrator'),
    candidate: t('知识候选', 'Candidate'),
    interrupted: t('已中断', 'Interrupted'),
    cancelled: t('已取消', 'Cancelled'),
  };
}
export function statusLabel(value: string): string {
  return statusLabels()[value] || value;
}
// Backward-compatible property reads resolve the active locale at render time.
export const labels: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, key) => (typeof key === 'string' ? statusLabels()[key] : undefined),
  },
);
export function Badge({
  value,
  children,
  tone,
}: {
  value?: string;
  children?: ReactNode;
  tone?: string;
}) {
  useI18n();
  const kind =
    tone ||
    ([
      'completed',
      'ready',
      'published',
      'active',
      'passed',
      'succeeded',
      'approved',
      'consumed',
      'resolved',
      'evaluated',
    ].includes(value || '')
      ? 'good'
      : ['failed', 'rejected', 'withdrawn', 'expired'].includes(value || '')
        ? 'bad'
        : [
              'pending',
              'awaiting_approval',
              'degraded',
              'needs_clarification',
              'candidate',
              'staged',
              'draft',
            ].includes(value || '')
          ? 'warn'
          : 'neutral');
  return (
    <span className={`badge ${kind}`}>
      <span className="badge-dot" />
      {children || labels[value || ''] || value || t('未知', 'Unknown')}
    </span>
  );
}
export function Button({
  children,
  loading = false,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`button ${variant} ${className}`}
    >
      {loading && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon || <SearchX size={24} />}</span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  useI18n();
  return error ? (
    <div className="error-box" role="alert">
      <CircleAlert size={18} />
      <span>{error}</span>
      {retry && <button onClick={retry}>{t('重试', 'Retry')}</button>}
    </div>
  ) : null;
}
export function Loading({
  children = t('正在载入工作台…', 'Loading workspace…'),
}: {
  children?: ReactNode;
}) {
  useI18n();
  return (
    <div className="loading">
      <LoaderCircle size={20} className="spin" />
      {children}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="panel-title">
      <h2>{children}</h2>
      {aside}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  drawer = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
}) {
  useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role=dialog]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const focusable = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            {subtitle && <div className="eyebrow">{subtitle}</div>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label={t('关闭窗口', 'Close dialog')}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function Markdown({ text }: { text: string }) {
  useI18n();
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ alt }) => (
            <span className="markdown-image-label">[{alt || t('图片', 'Image')}]</span>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
export function SourceCard({
  source,
  index,
  onOpen,
}: {
  source: Data;
  index: number;
  onOpen: (id: string) => void;
}) {
  useI18n();
  const id = source.id || source.chunk_id;
  return (
    <button className="source-card" onClick={() => onOpen(id)} disabled={!id}>
      <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <strong>{source.title || t('知识来源', 'Knowledge source')}</strong>
        <span>
          {source.version ? `v${source.version} · ` : ''}
          {source.anchor || source.document_id || t('查看原文片段', 'View source excerpt')}
        </span>
      </div>
      <ArrowUpRight size={17} />
    </button>
  );
}
export function TraceView({ data }: { data: Data }) {
  useI18n();
  const retrieval = data.retrieval || data;
  const trace = retrieval.trace || {};
  return (
    <div className="trace-view">
      <div className="trace-summary">
        <Badge value={data.status || retrieval.status} />
        <span>
          {retrieval.mode || '—'}{' '}
          {retrieval.elapsed_ms !== undefined && `· ${Math.round(retrieval.elapsed_ms)} ms`}
        </span>
      </div>
      <div className="trace-section">
        <span className="field-caption">{t('原始问题', 'Original question')}</span>
        <p>{retrieval.query || data.message || t('未记录', 'Not recorded')}</p>
        {retrieval.rewritten_query && (
          <>
            <span className="field-caption">{t('检索问题', 'Retrieval query')}</span>
            <p>{retrieval.rewritten_query}</p>
          </>
        )}
      </div>
      {Object.entries(trace).map(([key, value], index) => (
        <div className="trace-stage" key={key}>
          <div className="stage-marker">{index + 1}</div>
          <div>
            <h3>
              {(
                {
                  permission_filter: t('权限过滤', 'Access filter'),
                  rewrite: t('问题改写', 'Query rewrite'),
                  retrieval: t('候选召回', 'Candidate retrieval'),
                  rerank: t('重排', 'Reranking'),
                  context: t('上下文组装', 'Context assembly'),
                  generation: t('回答生成', 'Answer generation'),
                  outbound: t('出站检查', 'Outbound check'),
                  citation_validation: t('引用验证', 'Citation validation'),
                  bm25: t('BM25 检索', 'BM25 retrieval'),
                  confidence: t('证据置信度', 'Evidence sufficiency'),
                } as Record<string, string>
              )[key] || key}
            </h3>
            <pre>{display(value)}</pre>
          </div>
        </div>
      ))}
      {!Object.keys(trace).length && (
        <Empty title={t('尚无检索阶段记录', 'No retrieval stages recorded')}>
          {t(
            '执行一次查询后，这里会显示实际运行轨迹。',
            'Run a query to see its execution trace here.',
          )}
        </Empty>
      )}
      {array(data.events).length > 0 && (
        <details className="raw-details">
          <summary>
            {t('查看完整运行事件', 'View all run events')}
            <ChevronRight size={15} />
          </summary>
          <pre>{display(data.events)}</pre>
        </details>
      )}
    </div>
  );
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <div className="check-line">
      <Check size={15} />
      <span>{children}</span>
    </div>
  );
}
export function FileMark() {
  return (
    <span className="file-mark">
      <FileText size={19} />
    </span>
  );
}
