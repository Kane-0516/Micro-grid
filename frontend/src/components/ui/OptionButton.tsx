import './OptionButton.css';

interface OptionButtonProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function OptionButton({
  label,
  description,
  selected,
  onClick,
  disabled = false,
}: OptionButtonProps) {
  return (
    <button
      className={`option-button ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="option-label">{label}</div>
      {description && <div className="option-description">{description}</div>}
    </button>
  );
}
