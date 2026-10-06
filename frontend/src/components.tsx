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

export const labels: Record<string, string> = {
  completed: '已完成',
  ready: '可用',
  published: '已发布',
  active: '使用中',
  evaluated: '已评测',
  passed: '通过',
  succeeded: '成功',
  awaiting_approval: '等待审批',
  needs_clarification: '需要补充',
  no_evidence: '暂无依据',
  degraded: '降级运行',
  failed: '失败',
  rejected: '已拒绝',
  pending: '待处理',
  processing: '处理中',
  staged: '待发布',
  draft: '草稿',
  withdrawn: '已撤回',
  approved: '已批准',
  consumed: '已执行',
  prepared: '已解析，待审核',
  staging: '暂存版本',
  running: '执行中',
  resolved: '已解决',
  open: '处理中',
  expired: '已过期',
  employee: '员工',
  it: 'IT 支持',
  admin: '管理员',
  candidate: '知识候选',
};
export function Badge({
  value,
  children,
  tone,
}: {
  value?: string;
  children?: ReactNode;
  tone?: string;
}) {
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
      {children || labels[value || ''] || value || '未知'}
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
  return error ? (
    <div className="error-box" role="alert">
      <CircleAlert size={18} />
      <span>{error}</span>
      {retry && <button onClick={retry}>重试</button>}
    </div>
  ) : null;
}
export function Loading({ children = '正在载入工作台…' }: { children?: ReactNode }) {
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
          <button className="icon-button" aria-label="关闭窗口" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ alt }) => <span className="markdown-image-label">[{alt || '图片'}]</span>,
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
  const id = source.id || source.chunk_id;
  return (
    <button className="source-card" onClick={() => onOpen(id)} disabled={!id}>
      <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <strong>{source.title || '知识来源'}</strong>
        <span>
          {source.version ? `v${source.version} · ` : ''}
          {source.anchor || source.document_id || '查看原文片段'}
        </span>
      </div>
      <ArrowUpRight size={17} />
    </button>
  );
}
export function TraceView({ data }: { data: Data }) {
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
        <span className="field-caption">原始问题</span>
        <p>{retrieval.query || data.message || '未记录'}</p>
        {retrieval.rewritten_query && (
          <>
            <span className="field-caption">检索问题</span>
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
                  permission_filter: '权限过滤',
                  rewrite: '问题改写',
                  retrieval: '候选召回',
                  rerank: '重排',
                  context: '上下文组装',
                  generation: '回答生成',
                  outbound: '出站检查',
                  citation_validation: '引用验证',
                  bm25: 'BM25 检索',
                  confidence: '证据置信度',
                } as Record<string, string>
              )[key] || key}
            </h3>
            <pre>{display(value)}</pre>
          </div>
        </div>
      ))}
      {!Object.keys(trace).length && (
        <Empty title="尚无检索阶段记录">执行一次查询后，这里会显示实际运行轨迹。</Empty>
      )}
      {array(data.events).length > 0 && (
        <details className="raw-details">
          <summary>
            查看完整运行事件 <ChevronRight size={15} />
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
