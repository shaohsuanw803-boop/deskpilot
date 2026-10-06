import { useState } from 'react';
import { Cable, RefreshCw, ShieldCheck } from 'lucide-react';
import { array, date, errorText, post, sid, useResource, type Data, type User } from './api';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader } from './components';

export function Diagnostics({ items }: { items: Data[] }) {
  if (!items.length) return null;
  const status: Record<string, string> = {
    operational: '正常',
    degraded: '性能下降',
    outage: '中断',
  };
  return (
    <section className="diagnostic-results" aria-label="MCP 实时观测">
      <div className="diagnostic-heading">
        <Cable size={16} />
        <strong>MCP 实时观测</strong>
        <span>仅本地 · 不作为知识引用</span>
      </div>
      {items.map((item, index) => (
        <div className="diagnostic-row" key={item.id || index}>
          <div>
            <strong>{item.tool === 'asset_lookup' ? '我的设备' : '服务状态'}</strong>
            <Badge value={item.status} />
          </div>
          {item.output ? (
            <p>
              {item.output.simulated && <span className="demo-tag">虚构演示</span>}
              {item.tool === 'asset_lookup'
                ? `${item.output.device} · ${item.output.os} · ${item.output.managed ? '已纳管' : '未纳管'}`
                : `${item.output.service} · ${status[item.output.status] || item.output.status} · ${item.output.summary}`}
            </p>
          ) : (
            <p>{item.error || '暂无观测结果'}</p>
          )}
          {item.created_at && (
            <small>
              {date(item.created_at, true)} · {item.elapsed_ms} ms
            </small>
          )}
        </div>
      ))}
    </section>
  );
}

export default function Connectors({
  user,
  revision,
  onChange,
}: {
  user: User;
  revision: number;
  onChange: () => void;
}) {
  const catalog = useResource<{ items: Data[] }>('/connectors', revision);
  const history = useResource<{ items: Data[] }>('/tool-calls', revision);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Data | null>(null);
  async function execute(server: string, tool: string) {
    setBusy(`${server}:${tool}`);
    setError('');
    setResult(null);
    try {
      setResult(
        await post(`/connectors/${sid(server)}/call`, {
          tool,
          arguments: tool === 'service_status' ? { service: 'vpn' } : {},
        }),
      );
      onChange();
    } catch (e) {
      setError(errorText(e));
      onChange();
    } finally {
      setBusy('');
    }
  }
  async function reset(server: string) {
    setBusy(server);
    setError('');
    try {
      await post(`/connectors/${sid(server)}/reset`);
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
        title="连接器与执行控制"
        description="查询 IT 服务与本人设备，查看每次工具执行的权限、耗时与结果。"
      />
      <div className="info-strip">
        <ShieldCheck size={20} />
        <p>
          这里只开放审核过的只读工具。远程查询会向已配置的企业服务发送服务名或当前用户
          ID；结果留在本地，不发送给千问。
        </p>
      </div>
      <ErrorBox error={error || catalog.error || history.error} />
      {catalog.loading ? (
        <Loading />
      ) : (
        <div className="connector-grid">
          {array(catalog.data?.items).map((item) => {
            const open = item.circuit.open_until * 1000 > Date.now();
            return (
              <article className="connector-card" key={item.id}>
                <div className="connector-title">
                  <span className="connector-icon">
                    <Cable size={23} />
                  </span>
                  <div>
                    <h2>{item.name}</h2>
                    <span>{item.transport}</span>
                  </div>
                  <Badge tone={open ? 'warn' : item.enabled ? 'good' : 'neutral'}>
                    {open ? '熔断中' : item.enabled ? '已启用' : '未配置'}
                  </Badge>
                </div>
                <p>
                  {item.id === 'demo-it'
                    ? '真实 MCP 协议，内置虚构服务状态和设备数据。不需要额外密钥。'
                    : '维护人在本机配置 HTTPS 地址、允许主机和独立凭据。仅支持本项目审核的两项工具契约。'}
                </p>
                <dl className="connector-facts">
                  <div>
                    <dt>权限范围</dt>
                    <dd>服务状态 · 本人设备</dd>
                  </div>
                  <div>
                    <dt>连续失败</dt>
                    <dd>{item.circuit.failures} 次</dd>
                  </div>
                  <div>
                    <dt>工具契约</dt>
                    <dd>调用前校验 Schema 摘要</dd>
                  </div>
                </dl>
                <div className="connector-actions">
                  <Button
                    disabled={!item.enabled || !!busy || open}
                    loading={busy === `${item.id}:service_status`}
                    onClick={() => void execute(item.id, 'service_status')}
                  >
                    查询 VPN 状态
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!item.enabled || !!busy || open}
                    loading={busy === `${item.id}:asset_lookup`}
                    onClick={() => void execute(item.id, 'asset_lookup')}
                  >
                    查看我的设备
                  </Button>
                  {user.role === 'admin' && item.circuit.failures > 0 && (
                    <Button variant="ghost" disabled={!!busy} onClick={() => void reset(item.id)}>
                      <RefreshCw size={14} />
                      重置熔断
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {result && <Diagnostics items={[result]} />}
      <section className="connector-history">
        <h2>最近执行</h2>
        {!array(history.data?.items).length ? (
          <Empty title="还没有工具执行记录">选择一个只读查询，或在对话中开启 MCP 预检。</Empty>
        ) : (
          array(history.data?.items)
            .slice()
            .reverse()
            .slice(0, 30)
            .map((item) => (
              <details className="connector-log" key={item.id}>
                <summary>
                  <Badge value={item.status} />
                  <strong>{item.tool}</strong>
                  <span>
                    {item.server} · {date(item.created_at, true)} · {item.elapsed_ms ?? '—'} ms
                  </span>
                </summary>
                <p>
                  策略 {item.policy_version} · 契约 {item.contract_digest?.slice(0, 16)} ·{' '}
                  {item.run_id ? '关联诊断任务' : '手动查询'}
                </p>
                <pre>
                  {JSON.stringify(
                    { events: item.events, output: item.output, error: item.error },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))
        )}
      </section>
    </div>
  );
}
