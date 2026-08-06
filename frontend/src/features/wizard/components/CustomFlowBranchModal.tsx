import { useLang } from '@/context/LangContext';
import './CustomFlowBranchModal.css';

interface CustomFlowBranchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (branch: 'known-load' | 'diy') => void;
}

export default function CustomFlowBranchModal({
  open,
  onClose,
  onSelect,
}: CustomFlowBranchModalProps) {
  const { lang, t } = useLang();

  if (!open) return null;

  return (
    <div className="custom-branch-modal-backdrop" onClick={onClose}>
      <div
        className="custom-branch-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="custom-branch-modal-header">
          <h3>{t('custom.branch.title')}</h3>
        </div>

        <div className="custom-branch-modal-options">
          <button
            type="button"
            className="custom-branch-option custom-branch-option-known"
            onClick={() => onSelect('known-load')}
          >
            <span className="custom-branch-option-kicker">
              {lang === 'en' ? 'Load-driven path' : '负载驱动路径'}
            </span>
            <strong>{t('custom.branch.known.title')}</strong>
            <span className="custom-branch-option-desc">{t('custom.branch.known.desc')}</span>
            <span className="custom-branch-option-cta">{lang === 'en' ? 'Continue with Known-Load' : '进入已知负载方案'}</span>
          </button>

          <button
            type="button"
            className="custom-branch-option custom-branch-option-diy"
            onClick={() => onSelect('diy')}
          >
            <span className="custom-branch-option-kicker">
              {lang === 'en' ? 'Manual hardware path' : '手动配置路径'}
            </span>
            <strong>{t('custom.branch.diy.title')}</strong>
            <span className="custom-branch-option-desc">{t('custom.branch.diy.desc')}</span>
            <span className="custom-branch-option-cta">{lang === 'en' ? 'Continue with DIY' : '进入 DIY 方案'}</span>
          </button>
        </div>

        <div className="custom-branch-modal-footer">
          <button type="button" className="custom-branch-cancel" onClick={onClose}>
            {t('btn.not_now')}
          </button>
        </div>
      </div>
    </div>
  );
}
