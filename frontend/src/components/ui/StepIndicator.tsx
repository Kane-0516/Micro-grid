import './StepIndicator.css';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export default function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`step-item ${step === currentStep ? 'active' : step < currentStep ? 'completed' : ''}`}
        >
          <div className="step-number">{step}</div>
          {step < totalSteps && <div className="step-line" />}
        </div>
      ))}
    </div>
  );
}
