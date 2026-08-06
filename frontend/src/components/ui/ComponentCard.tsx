import { useState } from 'react';
import { useLang } from '@/context/LangContext';
import './ComponentCard.css';

interface ComponentCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  isVital?: boolean;
  details?: string;
}

export default function ComponentCard({ title, description, icon, isVital = false, details }: ComponentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { lang } = useLang();

  return (
    <div 
      className={`component-card ${isVital ? 'vital' : ''} ${isExpanded ? 'expanded' : ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="card-header">
        {icon && <div className="card-icon">{icon}</div>}
        <div className="card-title-section">
          <h3 className="card-title">{title}</h3>
          {isVital && <span className="vital-badge">{lang === 'en' ? 'Core Component' : '核心组件'}</span>}
        </div>
        <span className="expand-icon">{isExpanded ? '−' : '+'}</span>
      </div>
      <div className="card-description">{description}</div>
      {isExpanded && details && (
        <div className="card-details">
          <p>{details}</p>
        </div>
      )}
    </div>
  );
}
