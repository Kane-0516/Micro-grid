import { useState, useEffect } from 'react';
import { useLang } from '@/context/LangContext';
import InfoBox from '@/components/ui/InfoBox';
import './QuestionCard.css';

interface QuestionCardProps {
  title: string;
  description?: string;
  infoMessage?: string;
  children: React.ReactNode;
  stepNumber: number;
  totalSteps: number;
  onPrevious?: () => void;
  onNext?: () => void;
  canProceed: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
  blockingMessage?: string;
}

export default function QuestionCard({
  title,
  description,
  infoMessage,
  children,
  stepNumber,
  totalSteps,
  onPrevious,
  onNext,
  canProceed,
  nextDisabled = false,
  nextLabel,
  blockingMessage,
}: QuestionCardProps) {
  const { t } = useLang();

  // Separate shake key for the blocking message (increments on every blocked click)
  const [shakeKey, setShakeKey] = useState(0);
  // Nudge pulse on the Next button
  const [btnNudge, setBtnNudge] = useState(false);

  const handleNextClick = () => {
    if (!canProceed && blockingMessage) {
      setShakeKey(k => k + 1);
      setBtnNudge(true);
    }
    onNext?.();
  };

  useEffect(() => {
    if (!btnNudge) return;
    const id = setTimeout(() => setBtnNudge(false), 420);
    return () => clearTimeout(id);
  }, [btnNudge]);

  return (
    <div className="question-card">
      <div className="question-header">
        <h2 className="question-title">{title}</h2>
      </div>
      
      {infoMessage && (
        <div className="question-info-section">
          <InfoBox message={infoMessage} />
        </div>
      )}
      <div className="question-content">
        {children}
      </div>

      {!canProceed && blockingMessage && (
        <div
          key={shakeKey}
          className={`question-blocking-message${shakeKey > 0 ? ' question-blocking-shake' : ''}`}
        >
          {blockingMessage}
        </div>
      )}

      <div className="question-footer">
        {onPrevious && (
          <button className="btn btn-secondary" onClick={onPrevious}>
            {t('btn.previous')}
          </button>
        )}
        {onNext && (
          <button
            className={`btn btn-primary${btnNudge ? ' btn-nudge' : ''}`}
            onClick={handleNextClick}
            disabled={nextDisabled}
          >
            {nextLabel ?? (stepNumber === totalSteps ? t('btn.generate') : t('btn.next'))}
          </button>
        )}
      </div>
    </div>
  );
}
