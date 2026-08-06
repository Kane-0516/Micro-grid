import StepIndicator from '@/components/ui/StepIndicator';
import QuestionCard from '@/components/ui/QuestionCard';
import WizardLeftPanel from './WizardLeftPanel';
import WizardStepContent from './WizardStepContent';
import CustomFlowBranchModal from './CustomFlowBranchModal';
import type { ConfigData, Scenario } from '@/types/index';
import { useLang } from '@/context/LangContext';
import type { StepType } from '@/utils/wizardFlow';

interface WizardFlowPageProps {
  apiAvailable: boolean | null;
  canProceed: boolean;
  config: ConfigData;
  currentStep: number;
  currentStepType: StepType;
  description: string;
  handleNext: () => void | Promise<void>;
  handlePrevious: (() => void) | undefined;
  handlePvSetupUpdate: (data: Partial<ConfigData> & { pvCapacityKw?: number; bracketSets?: number }) => void;
  infoMessage: string;
  isBranchPromptOpen: boolean;
  isCalculating: boolean;
  nextLabel: string;
  blockingMessage?: string;
  nextDisabled?: boolean;
  onBranchPromptClose: () => void;
  onBranchSelect: (branch: 'known-load' | 'diy') => void;
  scenario: Scenario | null;
  showSiteAreaMap: boolean;
  title: string;
  topology: {
    data: any;
    visibility: any;
    pvFullFields: any;
  };
  totalWizardSteps: number;
  updateConfig: (updates: Partial<ConfigData>) => void;
  calcPvKw: (sets: number, panelModel: string, bracketModel: string) => number;
}

export default function WizardFlowPage({
  apiAvailable,
  canProceed,
  config,
  currentStep,
  currentStepType,
  description,
  handleNext,
  handlePrevious,
  handlePvSetupUpdate,
  infoMessage,
  isBranchPromptOpen,
  isCalculating,
  nextLabel,
  blockingMessage,
  nextDisabled,
  onBranchPromptClose,
  onBranchSelect,
  scenario,
  showSiteAreaMap,
  title,
  topology,
  totalWizardSteps,
  updateConfig,
  calcPvKw,
}: WizardFlowPageProps) {
  const { lang } = useLang();
  const layoutClass = currentStep === 1 ? ' map-active-primary' : ' map-active-secondary';

  return (
    <div className="app-main-flow">
      <CustomFlowBranchModal
        open={isBranchPromptOpen}
        onClose={onBranchPromptClose}
        onSelect={onBranchSelect}
      />

      {isCalculating && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              width: '320px',
              background: 'rgba(255,255,255,0.95)',
              borderRadius: '14px',
              padding: '1.5rem 1.75rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.75rem' }}>
              {lang === 'en' ? 'Generating plans...' : '正在生成配置方案...'}
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#e2e8f0',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '40%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #3182ce, #63b3ed, #3182ce)',
                  borderRadius: '3px',
                  animation: 'siteMapProgressSlide 1.5s ease-in-out infinite',
                }}
              />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.6rem' }}>
              {lang === 'en'
                ? 'Running optimization and simulation, this may take a moment...'
                : '正在运行优化与仿真计算，请稍候...'}
            </div>
          </div>
        </div>
      )}

      <div className="step-indicator-container">
        <StepIndicator currentStep={currentStep} totalSteps={totalWizardSteps} />
      </div>

      <div className={`app-layout${layoutClass}`}>
        <div className="layout-left">
          <WizardLeftPanel
            config={config}
            currentStepType={currentStepType}
            scenario={scenario}
            showSiteAreaMap={showSiteAreaMap}
            topology={topology}
            updateConfig={updateConfig}
          />
        </div>
        <div className="layout-right">
          <QuestionCard
            title={title}
            description={description}
            infoMessage={infoMessage}
            stepNumber={currentStep}
            totalSteps={totalWizardSteps}
            onPrevious={handlePrevious}
            onNext={handleNext}
            canProceed={canProceed}
            nextDisabled={nextDisabled}
            nextLabel={nextLabel}
            blockingMessage={blockingMessage}
          >
            <WizardStepContent
              apiAvailable={apiAvailable}
              config={config}
              currentStep={currentStep}
              currentStepType={currentStepType}
              handlePvSetupUpdate={handlePvSetupUpdate}
              totalWizardSteps={totalWizardSteps}
              updateConfig={updateConfig}
              calcPvKw={calcPvKw}
            />
          </QuestionCard>
        </div>
      </div>
    </div>
  );
}
