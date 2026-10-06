import { getLocale } from './i18n';

// Reviewed display aliases for the repository's fictional demo documents.
// Match both identity and original title so edits and custom uploads keep their names.
const names: Record<string, readonly [string, string]> = {
  'vpn-809-win11': [
    'Windows 11 星桥 VPN 错误 809：连接超时',
    'Windows 11 Starbridge VPN error 809: Connection timeout',
  ],
  'vpn-691-win11': [
    'Windows 11 星桥 VPN 错误 691：身份验证失败',
    'Windows 11 Starbridge VPN error 691: Authentication failed',
  ],
  'vpn-868-win11': [
    'Windows 11 星桥 VPN 错误 868：服务器名称无法解析',
    'Windows 11 Starbridge VPN error 868: Server name cannot be resolved',
  ],
  'vpn-macos-permission': [
    'macOS 14 星桥 VPN：允许网络扩展',
    'macOS 14 Starbridge VPN: Allow the network extension',
  ],
  'vpn-macos-profile': [
    'macOS 13 星桥 VPN：旧配置迁移',
    'macOS 13 Starbridge VPN: Migrate an older profile',
  ],
  'vpn-mfa-clock': [
    'VPN 动态验证码持续失效：时间同步检查',
    'VPN verification codes keep failing: Check time synchronization',
  ],
  'wifi-win11': [
    'Windows 11 办公 Wi-Fi 连接但无法上网',
    'Windows 11 office Wi-Fi: Connected without internet',
  ],
  'dns-office': [
    '办公网络 DNS 异常：有连接但域名打不开',
    'Office DNS issues: Connected but websites do not open',
  ],
  'proxy-browser': [
    '浏览器反复出现代理认证：检查代理配置',
    'Repeated browser proxy prompts: Check proxy settings',
  ],
  'account-unlock': [
    '企业账号被锁定：服务台解锁流程',
    'Locked company account: Service desk unlock process',
  ],
  'password-expired': ['密码到期后如何更新保存凭据', 'Password expired: Update saved credentials'],
  'mfa-new-phone': ['更换手机后的 MFA 迁移申请', 'MFA migration after changing phones'],
  'shared-folder': [
    '共享文件夹无权限：申请而非借用账号',
    'Shared folder access: Request permission',
  ],
  'local-admin': [
    '安装程序要求管理员权限：临时提权申请',
    'Installer requires administrator rights: Request temporary access',
  ],
  'office-activation': [
    'Microsoft 365 提示未授权产品',
    'Microsoft 365 shows an unlicensed product',
  ],
  'outlook-offline': [
    'Outlook 桌面版一直显示脱机工作',
    'Classic Outlook stays in Work Offline mode',
  ],
  'outlook-search': ['新版 Outlook 搜索不到旧邮件', 'New Outlook cannot find older emails'],
  'teams-mic-win': [
    'Windows 11 会议软件麦克风无声',
    'Windows 11 meeting app: Microphone has no sound',
  ],
  'teams-mic-mac': [
    'macOS 14 会议软件无法使用麦克风',
    'macOS 14 meeting app: Microphone access unavailable',
  ],
  'excel-protected': [
    'Excel 受保护视图：如何确认文档来源',
    'Excel Protected View: Verify the document source',
  ],
  'printer-win11': [
    'Windows 11 添加五楼北区打印机',
    'Windows 11: Add the fifth-floor north printer',
  ],
  'printer-macos': ['macOS 14 添加五楼北区打印机', 'macOS 14: Add the fifth-floor north printer'],
  'printer-queue': ['打印任务卡住：只取消自己的作业', 'Stuck print job: Cancel your own jobs only'],
  'printer-release': [
    '安全打印到设备后找不到待释放任务',
    'Secure printing: Release job not found at the device',
  ],
  'software-install': [
    '软件中心安装失败：下载与签名检查',
    'Software Center installation failed: Check download and signature',
  ],
  'software-license': [
    '专业软件许可证不足：申请席位',
    'No software licenses available: Request a seat',
  ],
  'update-restart': [
    'Windows 更新后需要重启：保存与安排',
    'Windows update restart: Save work and schedule',
  ],
  'disk-cleanup': [
    '系统盘空间不足：安全清理个人临时文件',
    'Low system disk space: Clean up personal temporary files',
  ],
  'bitlocker-recovery': [
    'Windows 启动要求恢复密钥：联系 IT',
    'Windows asks for a recovery key: Contact IT',
  ],
  'macos-storage': [
    'macOS 存储不足：查看分类并申请归档',
    'Low macOS storage: Review usage and request archiving',
  ],
  'onedrive-sync': [
    '企业云盘同步暂停：先确认账号和冲突',
    'Company drive sync paused: Check account and conflicts',
  ],
  'attachment-blocked': [
    '企业邮件附件被拦截：安全传递流程',
    'Blocked email attachment: Secure sharing process',
  ],
  'phishing-report': [
    '收到可疑登录邮件：报告而非点击',
    'Suspicious sign-in email: Report without clicking',
  ],
  'remote-assist': [
    '远程协助：先核对工单与会话授权',
    'Remote assistance: Verify the ticket and session consent',
  ],
  'asset-return': [
    '离职设备归还：交接与保留业务资料',
    'Device return: Handover and retain business records',
  ],
  'finance-share': ['财务季度归档区访问审批', 'Finance quarterly archive access approval'],
  'it-vpn-gateway': [
    'IT 专用：VPN 网关事件交接手册',
    'IT only: VPN gateway incident handover guide',
  ],
  'injection-sample': [
    '安全演练：工单附件中的指令注入',
    'Security exercise: Prompt injection in a ticket attachment',
  ],
  'support-escalation': [
    '服务台没有匹配答案时如何升级工单',
    'No matching answer: Escalate to the service desk',
  ],
  'office-mac-activation': [
    'macOS 14 Microsoft 365 许可登录',
    'macOS 14 Microsoft 365 license sign-in',
  ],
};

type NamedDocument = {
  id?: string;
  document_id?: string;
  title?: string;
  document?: { id?: string; title?: string };
};

export function documentTitle(item: NamedDocument): string {
  const title = item.title || item.document?.title || '';
  const id = item.document_id || item.document?.id || item.id || '';
  const alias = names[id];
  return getLocale() === 'en' && alias?.[0] === title ? alias[1] : title;
}
