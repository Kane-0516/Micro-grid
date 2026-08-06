/**
 * DownloadReportModal.tsx
 * 下载选型配置方案弹窗
 *  1. 收集客户联系信息（美国常用格式）
 *  2. 调用后端 /api/send-report，后端用 openpyxl 生成符合
 *     《解决方案部件清单》模板格式的 xlsx 文件（BOM + 经济分析 + 联系信息）
 *  3. 将后端返回的 base64 文件触发浏览器下载
 *  4. 若 SMTP 已配置，后端还会同时发送邮件给客户
 */

import React, { useState } from 'react';
import './DownloadReportModal.css';
import { useLang } from '@/context/LangContext';

// ── 美国州 ────────────────────────────────────────────────────
const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  'District of Columbia','Puerto Rico','Guam','Other / International',
];

// ── 类型 ──────────────────────────────────────────────────────
export interface ContactInfo {
  firstName: string;
  lastName:  string;
  company:   string;
  email:     string;
  phone:     string;
  state:     string;
  city:      string;
}

export interface ReportData {
  systemConfig?:    Record<string, unknown>;
  capex?:           Record<string, unknown>;
  simulation?:      Record<string, unknown>;
  summary?:         Record<string, unknown>;
  comparisonTable?: Record<string, unknown>[];
}

interface Props {
  reportData: ReportData;
  onClose:    () => void;
}

// ── 触发浏览器下载 base64 文件 ────────────────────────────────
function downloadBase64(b64: string, fileName: string) {
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════
export default function DownloadReportModal({ reportData, onClose }: Props) {
  const { t, lang } = useLang();
  const systemConfig = reportData.systemConfig ?? {};
  const summary = reportData.summary ?? {};
  const simulation = reportData.simulation ?? {};
  const [contact, setContact] = useState<ContactInfo>({
    firstName: '', lastName: '', company: '',
    email: '', phone: '', state: '', city: '',
  });
  const [status,    setStatus]    = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [emailSent, setEmailSent] = useState(false);
  const [fileName,  setFileName]  = useState('MicroGrid_Microgrid_Solution.xlsx');
  const [errorMsg,  setErrorMsg]  = useState('');

  const projectYears = asNumber(systemConfig.projectYears ?? summary.analysisYears);
  const nominalDiscountRatePct = asNumber(summary.nominalDiscountRatePct ?? systemConfig.nominalDiscountRatePct);
  const inflationRatePct = asNumber(summary.inflationRatePct ?? systemConfig.inflationRatePct);
  const realDiscountRatePct = asNumber(summary.realDiscountRatePct);
  const batteryLifeYears = asNumber(summary.batteryLifeYears);
  const mgGeneratorLifeYears = asNumber(summary.microgridGeneratorLifeYears);
  const dieselOnlyGeneratorLifeYears = asNumber(summary.dieselOnlyGeneratorLifeYears);
  const mgDieselHours = asNumber(simulation.mgDieselHours);
  const dieselRunHoursA = asNumber(simulation.dieselRunHoursA);
  const dispatchMode = typeof systemConfig.dieselDispatchMode === 'string' ? systemConfig.dieselDispatchMode : null;

  const fmtMaybe = (value: number | null, digits = 1, suffix = '') =>
    value == null ? '—' : `${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;

  function upd(field: keyof ContactInfo, value: string) {
    setContact(prev => ({ ...prev, [field]: value }));
  }

  const isValid = contact.email.includes('@') && contact.firstName.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setStatus('loading');

    try {
      const res = await fetch('/api/send-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact,
          systemConfig:    reportData.systemConfig,
          capex:           reportData.capex,
          simulation:      reportData.simulation,
          summary:         reportData.summary,
          comparisonTable: reportData.comparisonTable,
        }),
      });
      const json = await res.json();
      if (json.success && json.fileBase64) {
        const fn = json.fileName || 'MicroGrid_Microgrid_Solution.xlsx';
        setFileName(fn);
        downloadBase64(json.fileBase64, fn);
        setEmailSent(json.emailSent ?? false);
        setStatus('done');
      } else {
        setErrorMsg(json.error || (lang === 'en' ? 'Server returned an error.' : '服务器返回错误。'));
        setStatus('error');
      }
    } catch {
      setErrorMsg(lang === 'en'
        ? 'Cannot reach the backend server. Please make sure the API service is running.'
        : '无法连接后端服务，请确认 API 服务已启动。');
      setStatus('error');
    }
  }

  return (
    <div className="drm-overlay" onClick={onClose}>
      <div className="drm-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="drm-header">
          <div className="drm-header-title">
            <div className="drm-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div>
              <h2>{t('modal.title')}</h2>
              <p>{lang === 'en' ? 'Get your personalized microgrid solution in Excel format' : '获取您的个性化微电网解决方案（Excel 格式）'}</p>
            </div>
          </div>
          <button className="drm-close" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        {/* Content */}
        {status === 'done' ? (
          /* ── Success ──────────────────────────────────────── */
          <div className="drm-done">
            <div className="drm-done-check">&#10003;</div>
            <h3>{lang === 'en' ? 'Report Downloaded' : '报告已下载'}</h3>
            <p>
              <strong>{fileName}</strong>
              {lang === 'en'
                ? ' has been saved to your Downloads folder.'
                : ' 已保存至您的下载文件夹。'}
            </p>
            {emailSent ? (
              <p className="drm-email-note ok">
                {lang === 'en' ? 'A copy was also sent to ' : '副本已发送至 '}
                <strong>{contact.email}</strong>.
              </p>
            ) : (
              <p className="drm-email-note warn">
                {lang === 'en'
                  ? 'Email delivery is not configured on this server. Please share the downloaded file directly with your team.'
                  : '本服务器未配置邮件发送功能，请直接将下载文件分享给您的团队。'}
              </p>
            )}
            <button className="btn btn-primary" style={{ marginTop: '1.25rem' }} onClick={onClose}>
              {lang === 'en' ? 'Close' : '关闭'}
            </button>
          </div>

        ) : status === 'error' ? (
          /* ── Error ────────────────────────────────────────── */
          <div className="drm-done">
            <div className="drm-done-check err">!</div>
            <h3>{lang === 'en' ? 'Something went wrong' : '出错了'}</h3>
            <p className="drm-email-note warn">{errorMsg}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setStatus('idle')}>
                {lang === 'en' ? 'Back' : '返回'}
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                {lang === 'en' ? 'Close' : '关闭'}
              </button>
            </div>
          </div>

        ) : (
          /* ── Form ─────────────────────────────────────────── */
          <form className="drm-form" onSubmit={handleSubmit} noValidate>
            <p className="drm-desc">
              {t('modal.desc')}
            </p>

            {/* Name */}
            <div className="drm-row">
              <div className="drm-field">
                <label>{lang === 'en' ? 'First Name' : '名'} <span className="drm-req">*</span></label>
                <input
                  type="text"
                  placeholder="John"
                  value={contact.firstName}
                  onChange={e => upd('firstName', e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="drm-field">
                <label>{lang === 'en' ? 'Last Name' : '姓'}</label>
                <input
                  type="text"
                  placeholder="Smith"
                  value={contact.lastName}
                  onChange={e => upd('lastName', e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            {/* Company */}
            <div className="drm-field">
              <label>{t('modal.company')}</label>
              <input
                type="text"
                placeholder="Acme Corp"
                value={contact.company}
                onChange={e => upd('company', e.target.value)}
                autoComplete="organization"
              />
            </div>

            {/* Email */}
            <div className="drm-field">
              <label>{t('modal.email')} <span className="drm-req">*</span></label>
              <input
                type="email"
                placeholder="john.smith@example.com"
                value={contact.email}
                onChange={e => upd('email', e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {/* Phone + City */}
            <div className="drm-row">
              <div className="drm-field">
                <label>{t('modal.phone')}</label>
                <input
                  type="tel"
                  placeholder="(555) 000-1234"
                  value={contact.phone}
                  onChange={e => upd('phone', e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="drm-field">
                <label>{t('modal.city')}</label>
                <input
                  type="text"
                  placeholder="Los Angeles"
                  value={contact.city}
                  onChange={e => upd('city', e.target.value)}
                  autoComplete="address-level2"
                />
              </div>
            </div>

            {/* State */}
            <div className="drm-field">
              <label>{t('modal.state')}</label>
              <select
                value={contact.state}
                onChange={e => upd('state', e.target.value)}
                autoComplete="address-level1"
              >
                <option value="">{lang === 'en' ? '— Select a state —' : '— 选择州 —'}</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* What they'll get */}
            <div className="drm-preview">
              <div className="drm-preview-title">
                {lang === 'en' ? 'Your report will include:' : '报告将包含：'}
              </div>
              <ul>
                {lang === 'en' ? (
                  <>
                    <li>Key Components List (BOM) — parts, quantities, specifications</li>
                    <li>Project summary and economic analysis</li>
                    <li>20-year economic analysis, payback, and site layout note</li>
                  </>
                ) : (
                  <>
                    <li>关键部件清单（BOM）— 零件、数量、规格</li>
                    <li>项目摘要与经济分析</li>
                    <li>20 年经济分析、回本时间线与场地排布说明</li>
                  </>
                )}
              </ul>
            </div>

            <div className="drm-assumptions">
              <div className="drm-assumptions-title">
                {lang === 'en' ? 'Economic assumptions included in the report' : '报告中将写入的经济假设'}
              </div>
              <div className="drm-assumptions-grid">
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Project life' : '项目周期'}</span>
                  <strong>{fmtMaybe(projectYears, 0, lang === 'en' ? ' years' : ' 年')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Nominal rate' : '名义贴现率'}</span>
                  <strong>{fmtMaybe(nominalDiscountRatePct, 2, '%')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Inflation rate' : '通胀率'}</span>
                  <strong>{fmtMaybe(inflationRatePct, 2, '%')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Real rate' : '真实贴现率'}</span>
                  <strong>{fmtMaybe(realDiscountRatePct, 2, '%')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Battery life' : '电池寿命'}</span>
                  <strong>{fmtMaybe(batteryLifeYears, 1, lang === 'en' ? ' years' : ' 年')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'MG generator life' : '微电网柴发寿命'}</span>
                  <strong>{fmtMaybe(mgGeneratorLifeYears, 1, lang === 'en' ? ' years' : ' 年')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Diesel-only generator life' : '纯柴发寿命'}</span>
                  <strong>{fmtMaybe(dieselOnlyGeneratorLifeYears, 1, lang === 'en' ? ' years' : ' 年')}</strong>
                </div>
                <div className="drm-assumption-item">
                  <span className="drm-assumption-label">{lang === 'en' ? 'Dispatch/runtime' : '调度与运行时长'}</span>
                  <strong>
                    {dispatchMode ?? '—'}
                    {(mgDieselHours != null || dieselRunHoursA != null)
                      ? ` · MG ${fmtMaybe(mgDieselHours, 0, 'h')} / A ${fmtMaybe(dieselRunHoursA, 0, 'h')}`
                      : ''}
                  </strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="drm-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t('modal.cancel')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!isValid || status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className="drm-spin-wrap">
                    <span className="drm-spinner" />
                    {lang === 'en' ? 'Generating…' : '生成中…'}
                  </span>
                ) : (
                  t('sys.download_report')
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
