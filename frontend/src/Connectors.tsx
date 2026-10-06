import { translate as t, useI18n } from './i18n';
import { useState } from 'react';
import { Cable, RefreshCw, ShieldCheck } from 'lucide-react';
import { array, date, errorText, post, sid, useResource, type Data, type User } from './api';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader } from './components';

export function Diagnostics({ items }: { items: Data[] }) {
  useI18n();
  if (!items.length) return null;
  const status: Record<string, string> = {
    operational: t('正常', 'Operational'),
    degraded: t('性能下降', 'Degraded'),
    outage: t('中断', 'Outage'),
  };
  return (
    <section className="diagnostic-results" aria-label={t('MCP 实时观测', 'MCP observations')}>
      <div className="diagnostic-heading">
        <Cable size={16} />
        <strong>{t('MCP 实时观测', 'MCP observations')}</strong>
        <span>{t('仅本地 · 不作为知识引用', 'Local only · not knowledge evidence')}</span>
      </div>
      {items.map((item, index) => (
        <div className="diagnostic-row" key={item.id || index}>
          <div>
            <strong>
              {item.tool === 'asset_lookup'
                ? t('我的设备', 'My device')
                : t('服务状态', 'Service status')}
            </strong>
            <Badge value={item.status} />
          </div>
          {item.output ? (
            <p>
              {item.output.simulated && (
                <span className="demo-tag">{t('虚构演示', 'Fictional demo')}</span>
              )}
              {item.tool === 'asset_lookup'
                ? `${item.output.device} · ${item.output.os} · ${item.output.managed ? t('已纳管', 'Managed') : t('未纳管', 'Unmanaged')}`
                : `${item.output.service} · ${status[item.output.status] || item.output.status} · ${item.output.summary}`}
            </p>
          ) : (
            <p>{item.error || t('暂无观测结果', 'No observation available')}</p>
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
  useI18n();
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
        title={t('连接器与执行控制', 'Connectors & execution')}
        description={t(
          '查询 IT 服务与本人设备，查看每次工具执行的权限、耗时与结果。',
          'Query IT services and your own device, then inspect access checks, latency, and results.',
        )}
      />
      <div className="info-strip">
        <ShieldCheck size={20} />
        <p>
          {t(
            '这里只开放审核过的只读工具。远程查询会向已配置的企业服务发送服务名或当前用户 ID；结果留在本地，不发送给千问。',
            'Only reviewed read-only tools are available. Remote queries send the service name or current user ID to your configured enterprise service. Results stay local and are not sent to Qwen.',
          )}
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
                    <h2>{item.display_name || item.name}</h2>
                    <span>{item.transport}</span>
                  </div>
                  <Badge tone={open ? 'warn' : item.enabled ? 'good' : 'neutral'}>
                    {open
                      ? t('熔断中', 'Circuit open')
                      : item.enabled
                        ? t('已启用', 'Enabled')
                        : t('未配置', 'Not configured')}
                  </Badge>
                </div>
                <p>
                  {item.id === 'demo-it'
                    ? t(
                        '真实 MCP 协议，内置虚构服务状态和设备数据。不需要额外密钥。',
                        'Real MCP protocol with fictional service and device data. No additional key required.',
                      )
                    : t(
                        '维护人在本机配置 HTTPS 地址、允许主机和独立凭据。仅支持本项目审核的两项工具契约。',
                        'A maintainer configures the HTTPS endpoint, allowed host, and dedicated credentials locally. Supports only the two reviewed tool contracts.',
                      )}
                </p>
                <dl className="connector-facts">
                  <div>
                    <dt>{t('权限范围', 'Access scope')}</dt>
                    <dd>{t('服务状态 · 本人设备', 'Service status · own device')}</dd>
                  </div>
                  <div>
                    <dt>{t('连续失败', 'Consecutive failures')}</dt>
                    <dd>
                      {item.circuit.failures} {t('次', 'failures')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('工具契约', 'Tool contract')}</dt>
                    <dd>{t('调用前校验 Schema 摘要', 'Schema digest checked before execution')}</dd>
                  </div>
                </dl>
                <div className="connector-actions">
                  <Button
                    disabled={!item.enabled || !!busy || open}
                    loading={busy === `${item.id}:service_status`}
                    onClick={() => void execute(item.id, 'service_status')}
                  >
                    {t('查询 VPN 状态', 'Check VPN status')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!item.enabled || !!busy || open}
                    loading={busy === `${item.id}:asset_lookup`}
                    onClick={() => void execute(item.id, 'asset_lookup')}
                  >
                    {t('查看我的设备', 'View my device')}
                  </Button>
                  {user.role === 'admin' && item.circuit.failures > 0 && (
                    <Button variant="ghost" disabled={!!busy} onClick={() => void reset(item.id)}>
                      <RefreshCw size={14} />
                      {t('重置熔断', 'Reset circuit')}
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
        <h2>{t('最近执行', 'Recent executions')}</h2>
        {!array(history.data?.items).length ? (
          <Empty title={t('还没有工具执行记录', 'No tool executions yet')}>
            {t(
              '选择一个只读查询，或在对话中开启 MCP 预检。',
              'Choose a read-only query or enable MCP preflight in a conversation.',
            )}
          </Empty>
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
                  {t('策略', 'Policy')} {item.policy_version} {t('· 契约', '· Contract')}{' '}
                  {item.contract_digest?.slice(0, 16)} ·{' '}
                  {item.run_id
                    ? t('关联诊断任务', 'Linked diagnosis task')
                    : t('手动查询', 'Manual query')}
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
