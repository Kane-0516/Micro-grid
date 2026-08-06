import { useLang } from '@/context/LangContext';
import './WelcomePage.css';

interface WelcomePageProps {
  onStart?: () => void;
}

export default function WelcomePage({ onStart }: WelcomePageProps) {
  const { t, lang, setLang } = useLang();

  const handleGetStarted = () => {
    if (onStart) {
      onStart();
      return;
    }

    window.postMessage({ type: 'START_CONFIG' }, '*');
    window.dispatchEvent(new CustomEvent('startConfig'));
  };

  return (
    <div className="welcome-page">
      <div className="welcome-header">
        <div className="header-content">
          <div className="header-logo-section">
            <span className="brand-logo-text">MicroGrid</span>
          </div>

          <div style={{ flex: 1 }} />

          <div className="header-right">
            <div className="header-brand-section">
              <span className="header-slogan">{t('welcome.slogan')}</span>
              <div className="header-brand">
                <span className="brand-text">{t('welcome.brand')}</span>
                <span className="brand-subtitle">{t('welcome.subtitle')}</span>
              </div>
            </div>
            <button
              className="lang-toggle"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              title={lang === 'zh' ? '切换为英文 / Switch to English' : '切换为中文 / Switch to Chinese'}
            >
              <span className="lang-toggle-label">{lang === 'zh' ? '中' : 'EN'}</span>
              <span className="lang-toggle-divider">/</span>
              <span className="lang-toggle-label lang-toggle-target">{lang === 'zh' ? 'EN' : '中'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="welcome-content">
        <div className="content-wrapper">
          <h1 className="welcome-title">
            <span className="title-prefix">{t('welcome.prefix')}</span>
            <span className="title-main">{t('welcome.title')}</span>
          </h1>

          <div className="welcome-description">
            <p className="description-text">{t('welcome.desc1')}</p>
            <p className="description-text">{t('welcome.desc2')}</p>
          </div>

          <button className="welcome-cta" onClick={handleGetStarted}>
            {t('welcome.cta')}
            <span className="cta-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
