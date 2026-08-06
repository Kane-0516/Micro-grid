import { useState } from 'react';
import { useLang } from '@/context/LangContext';
import './SideNav.css';

export type NavPage =
  | 'standard-small'
  | 'standard-medium'
  | 'standard-large'
  | 'custom-solution';

interface SideNavProps {
  activePage: NavPage | null;
  onNavigate: (page: NavPage) => void;
  apiAvailable?: boolean | null;
}

export default function SideNav({
  activePage,
  onNavigate,
  apiAvailable,
}: SideNavProps) {
  const { t, lang } = useLang();
  const [stdOpen, setStdOpen] = useState(true);
  const [custOpen, setCustOpen] = useState(true);

  const isStd = !!activePage?.startsWith('standard');
  const isCust = activePage === 'custom-solution';

  const statusText = apiAvailable
    ? t('nav.status.online')
    : apiAvailable === null
      ? t('nav.status.pending')
      : t('nav.status.offline');

  const statusClass = apiAvailable
    ? 'online'
    : apiAvailable === null
      ? 'pending'
      : 'offline';

  return (
    <nav className="sidenav">
      <div className="sidenav-brand">
        <div className="sidenav-brand-name">MicroGrid</div>
        <div className="sidenav-brand-sub">
          {lang === 'en' ? 'Microgrid Advisor' : '微电网方案顾问'}
        </div>
      </div>

      <div className="sidenav-menu">
        <div className="sidenav-section">
          <button
            className={`sidenav-group-btn${isStd ? ' active' : ''}`}
            onClick={() => setStdOpen(v => !v)}
          >
            <span className="sidenav-group-label">{t('nav.standard')}</span>
            <span className="sidenav-group-toggle">{stdOpen ? '▾' : '▸'}</span>
          </button>

          {stdOpen && (
            <div className="sidenav-children">
              <button
                className={`sidenav-child-btn${activePage === 'standard-small' ? ' active' : ''}`}
                onClick={() => onNavigate('standard-small')}
              >
                <span className="sidenav-child-dot" />
                {t('nav.std.small')}
              </button>
              <button
                className={`sidenav-child-btn${activePage === 'standard-medium' ? ' active' : ''}`}
                onClick={() => onNavigate('standard-medium')}
              >
                <span className="sidenav-child-dot" />
                {t('nav.std.medium')}
              </button>
              <button
                className={`sidenav-child-btn${activePage === 'standard-large' ? ' active' : ''}`}
                onClick={() => onNavigate('standard-large')}
              >
                <span className="sidenav-child-dot" />
                {t('nav.std.large')}
              </button>
            </div>
          )}
        </div>

        <div className="sidenav-divider" />

        <div className="sidenav-section">
          <button
            className={`sidenav-group-btn${isCust ? ' active' : ''}`}
            onClick={() => setCustOpen(v => !v)}
          >
            <span className="sidenav-group-label">{t('nav.custom')}</span>
            <span className="sidenav-group-toggle">{custOpen ? '▾' : '▸'}</span>
          </button>

          {custOpen && (
            <div className="sidenav-children">
              <button
                className={`sidenav-child-btn${activePage === 'custom-solution' ? ' active' : ''}`}
                onClick={() => onNavigate('custom-solution')}
              >
                <span className="sidenav-child-dot" />
                {t('nav.custom.solution')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sidenav-footer">
        <div className="sidenav-status-row">
          <span className={`sidenav-status-dot ${statusClass}`} />
          <span className="sidenav-status-text">{statusText}</span>
        </div>
      </div>
    </nav>
  );
}
