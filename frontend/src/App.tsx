import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLang } from '@/context/LangContext';
import AppScaffold from './components/layout/AppScaffold';
import type { NavPage } from './components/layout/SideNav';
import {
  createDefaultConfig,
  WizardFlowPage,
  canProceedStep,
  getStepProceedBlockers,
  getStepDescription,
  getStepInfoMessage,
  getStepTitle,
  getStepType,
  getTotalWizardSteps,
  shouldShowSiteAreaMap,
} from '@/features/wizard';
import { StandardProductPage } from '@/features/standard-product';
import { PlanSelectionPage } from '@/features/plan-selection';
import { WelcomePage } from '@/features/welcome';
import { ResultPage } from '@/features/result';
import { checkHealth } from '@/api/client';
import { useProducts } from '@/context/ProductsContext';
import { useWizardCalculation } from '@/features/wizard';
import type { ConfigData, CustomFlowBranch, Scenario } from './types/index';
import { configToTopologyData } from './utils/configToTopology';
import './App.css';

export type DensityMode = 'auto' | 'compact' | 'comfortable';

const APP_NAV_STATE_KEY = 'microgrid.presale.navState.v1';

interface StoredNavState {
  showWelcome?: boolean;
  navPage?: NavPage;
  currentStep?: number;
  config?: ConfigData;
}

const NAV_PAGES: NavPage[] = ['standard-small', 'standard-medium', 'standard-large', 'custom-solution'];

function readSessionNavState(): StoredNavState {
  try {
    const raw = window.sessionStorage.getItem(APP_NAV_STATE_KEY);
    return raw ? JSON.parse(raw) as StoredNavState : {};
  } catch {
    return {};
  }
}

function isNavPage(page: NavPage | null | undefined): page is NavPage {
  return !!page && NAV_PAGES.includes(page);
}

function restoreConfig(stored: StoredNavState, navPage: NavPage | undefined, branch: CustomFlowBranch | null): ConfigData {
  const config = stored.config
    ? { ...stored.config }
    : createDefaultConfig(navPage === 'custom-solution' ? 'custom' : undefined);
  if (branch === 'known-load' || branch === 'diy') {
    config.scenario = branch;
    config.customFlowBranch = branch;
  }
  return config;
}

function getRestoredStep(params: URLSearchParams, stored: StoredNavState): number {
  const stepParam = Number.parseInt(params.get('step') || '', 10);
  const restoredStep = Number.isFinite(stepParam)
    ? Math.max(1, stepParam)
    : Math.max(1, stored.currentStep ?? 1);
  const viewParam = params.get('view');
  return viewParam === 'result' || viewParam === 'plans' ? 6 : restoredStep;
}

function shouldShowWelcome(params: URLSearchParams, stored: StoredNavState): boolean {
  const pageParam = params.get('page');
  if (pageParam === 'welcome') return true;
  const hasAppState = !!pageParam
    || Number.isFinite(Number.parseInt(params.get('step') || '', 10))
    || !!params.get('branch');
  return hasAppState ? false : (stored.showWelcome ?? true);
}

function readStoredNavState(): StoredNavState {
  if (typeof window === 'undefined') return {};

  const stored = readSessionNavState();
  const params = new URLSearchParams(window.location.search);
  const pageParam = params.get('page') as NavPage | null;
  const navPage = isNavPage(pageParam) ? pageParam : stored.navPage;
  const branch = params.get('branch') as CustomFlowBranch | null;

  return {
    showWelcome: shouldShowWelcome(params, stored),
    navPage: isNavPage(navPage) ? navPage : 'standard-small',
    currentStep: getRestoredStep(params, stored),
    config: restoreConfig(stored, navPage, branch),
  };
}

function getAutoDensityMode(): DensityMode {
  if (typeof window === 'undefined') return 'auto';

  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  if (width <= 1720 || height <= 980) return 'compact';
  if (width >= 2200 || (dpr >= 1.5 && width >= 1800)) return 'comfortable';
  return 'auto';
}

function appendCustomPageParams(
  params: URLSearchParams,
  currentStep: number,
  config: ConfigData,
  showPlanSelection: boolean,
  inWizard: boolean,
  totalWizardSteps: number,
): void {
  params.set('step', String(currentStep));
  if (config.customFlowBranch) params.set('branch', config.customFlowBranch);
  if (showPlanSelection) params.set('view', 'plans');
  if (inWizard && currentStep === totalWizardSteps + 1) params.set('view', 'result');
}

function buildNavigationParams(
  showWelcome: boolean,
  navPage: NavPage,
  currentStep: number,
  config: ConfigData,
  showPlanSelection: boolean,
  inWizard: boolean,
  totalWizardSteps: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (showWelcome) {
    params.set('page', 'welcome');
    return params;
  }
  params.set('page', navPage);
  if (navPage === 'custom-solution') {
    appendCustomPageParams(params, currentStep, config, showPlanSelection, inWizard, totalWizardSteps);
  }
  return params;
}

function ProductCatalogStatus({ isLoading, error, lang, onRetry }: Readonly<{
  isLoading: boolean;
  error: string | null;
  lang: ReturnType<typeof useLang>['lang'];
  onRetry: () => void;
}>) {
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f8fc', padding: '2rem' }}>
        <div style={{ width: 'min(560px, 100%)', background: '#fff', border: '1px solid #d9e2f2', borderRadius: '20px', padding: '2rem 2.25rem', boxShadow: '0 12px 28px rgba(18, 42, 86, 0.08)' }}>
          <h1 style={{ marginBottom: '0.75rem', color: '#183b79', fontSize: '1.75rem' }}>
            {lang === 'en' ? 'Loading product catalog' : '正在加载产品库'}
          </h1>
          <p style={{ color: '#52607a', fontSize: '1rem' }}>
            {lang === 'en'
              ? 'We are fetching the latest product definitions before rendering the application.'
              : '正在获取最新产品定义，加载完成后再进入应用。'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f8fc', padding: '2rem' }}>
      <div style={{ width: 'min(620px, 100%)', background: '#fff', border: '1px solid #f1c6c6', borderRadius: '20px', padding: '2rem 2.25rem', boxShadow: '0 12px 28px rgba(18, 42, 86, 0.08)' }}>
        <h1 style={{ marginBottom: '0.75rem', color: '#8f1d1d', fontSize: '1.75rem' }}>
          {lang === 'en' ? 'Unable to load product catalog' : '产品库加载失败'}
        </h1>
        <p style={{ color: '#5f6b7a', fontSize: '1rem', marginBottom: '0.75rem' }}>
          {lang === 'en'
            ? 'The application now depends on the backend product catalog and will not continue with stale frontend defaults.'
            : '当前应用完全依赖后端产品库，不会再使用前端静态默认值继续运行。'}
        </p>
        <p style={{ color: '#8f1d1d', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            border: 'none',
            borderRadius: '999px',
            background: '#1d4ed8',
            color: '#fff',
            fontWeight: 700,
            padding: '0.85rem 1.4rem',
            cursor: 'pointer',
          }}
        >
          {lang === 'en' ? 'Retry loading catalog' : '重新加载产品库'}
        </button>
      </div>
    </div>
  );
}

function App() {
  const { t, lang } = useLang();
  const [initialNavState] = useState<StoredNavState>(() => readStoredNavState());
  const [showWelcome, setShowWelcome] = useState(initialNavState.showWelcome ?? true);
  const [navPage, setNavPage] = useState<NavPage>(initialNavState.navPage ?? 'standard-small');
  const [currentStep, setCurrentStep] = useState(initialNavState.currentStep ?? 1);
  const [config, setConfig] = useState<ConfigData>(initialNavState.config ?? createDefaultConfig());
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [densityMode, setDensityMode] = useState<DensityMode>(() => getAutoDensityMode());
  const [showProceedBlockers, setShowProceedBlockers] = useState(false);
  const [showBranchPrompt, setShowBranchPrompt] = useState(false);

  const inWizard = navPage === 'custom-solution';
  const wizardScenario: Scenario | null = navPage === 'custom-solution' ? 'custom' : null;
  const effectiveScenario: Scenario | null = wizardScenario === 'custom'
    ? (config.customFlowBranch ?? null)
    : wizardScenario;

  const {
    calcPvKw,
    getBracketByModel,
    defaultBracketModel,
    defaultPanelModel,
    defaultBatteryModel,
    economicDefaults,
    simulationDefaults,
    isFromAPI: isProductsFromAPI,
    isLoading: isProductsLoading,
    loadError: productsLoadError,
    retry: retryProductsLoad,
  } = useProducts();

  useEffect(() => {
    let cancelled = false;

    const refreshHealth = async () => {
      const ok = await checkHealth();
      if (!cancelled) setApiAvailable(ok);
    };

    refreshHealth();
    const intervalId = window.setInterval(refreshHealth, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateDensity = () => setDensityMode(getAutoDensityMode());
    updateDensity();
    window.addEventListener('resize', updateDensity);
    return () => window.removeEventListener('resize', updateDensity);
  }, []);

  useEffect(() => {
    if (!isProductsFromAPI) return;
    setConfig(prev => ({
      ...prev,
      panelModel: prev.panelModel || defaultPanelModel,
      bracketModel: prev.bracketModel || defaultBracketModel,
      batteryPackModel: prev.batteryPackModel || defaultBatteryModel,
      loadType: prev.loadType ?? simulationDefaults.defaultLoadType,
      electricityPriceUsd: prev.electricityPriceUsd === 0.35
        ? economicDefaults.electricityPriceUsdPerKwh
        : prev.electricityPriceUsd,
      dieselPriceUsd: prev.dieselPriceUsd === 0.95
        ? economicDefaults.dieselPriceUsdPerLiter
        : prev.dieselPriceUsd,
      dieselDispatchMode: prev.dieselDispatchMode === 'proxy'
        ? simulationDefaults.dieselDispatchMode
        : prev.dieselDispatchMode,
      year: prev.year === 2020 ? simulationDefaults.defaultYear : prev.year,
      projectYears: prev.projectYears === 25
        ? economicDefaults.projectYears
        : prev.projectYears,
      nominalDiscountRatePct: prev.nominalDiscountRatePct === 10
        ? economicDefaults.nominalDiscountRatePct
        : prev.nominalDiscountRatePct,
      inflationRatePct: prev.inflationRatePct === 2
        ? economicDefaults.inflationRatePct
        : prev.inflationRatePct,
    }));
  }, [
    defaultBatteryModel,
    defaultBracketModel,
    defaultPanelModel,
    economicDefaults,
    isProductsFromAPI,
    simulationDefaults,
  ]);

  const topology = useMemo(() => configToTopologyData(config, lang), [config, lang]);

  const updateConfig = useCallback((updates: Partial<ConfigData>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    setShowProceedBlockers(false);
    setShowBranchPrompt(false);
  }, [navPage, currentStep]);

  const handlePvSetupUpdate = useCallback((data: Partial<ConfigData> & { pvCapacityKw?: number; bracketSets?: number }) => {
    setConfig(prev => {
      const bracketModel = (data as any).bracketModel ?? prev.bracketModel ?? defaultBracketModel;
      const panelModel = (data as any).panelModel ?? prev.panelModel ?? defaultPanelModel;
      const sets = (data as any).bracketSets ?? prev.bracketSets ?? 0;
      const pvKwComputed = sets > 0 ? calcPvKw(sets, panelModel, bracketModel) : 0;
      return { ...prev, ...data, pvCapacityKw: pvKwComputed };
    });
  }, [calcPvKw, defaultBracketModel, defaultPanelModel]);

  const totalWizardSteps = getTotalWizardSteps(wizardScenario);
  const currentStepType = getStepType(wizardScenario, currentStep, config.customFlowBranch);
  const showSiteAreaMap = shouldShowSiteAreaMap(wizardScenario, currentStepType);

  const {
    apiError,
    apiErrorDiagnostics,
    apiResult,
    handlePlanSelect,
    isCalculating,
    isLoadingDetail,
    isSimulationRunning,
    planDieselKw,
    planOptions,
    returnFromResult,
    resetCalculationState,
    runCalculation,
    showPlanSelection,
  } = useWizardCalculation({
    apiAvailable,
    config,
    scenario: effectiveScenario,
    totalWizardSteps,
    t,
    getBracketAreaM2: model => getBracketByModel(model).areaM2,
    setConfig,
    setCurrentStep,
  });

  const handleNavigate = (page: NavPage) => {
    setNavPage(page);
    setCurrentStep(1);
    setShowProceedBlockers(false);
    resetCalculationState();

    if (page === 'custom-solution') {
      setConfig(createDefaultConfig('custom'));
    } else {
      setConfig(createDefaultConfig());
    }
  };

  const handleBranchSelect = (branch: CustomFlowBranch) => {
    setConfig(prev => ({
      ...prev,
      scenario: branch,
      customFlowBranch: branch,
    }));
    setShowBranchPrompt(false);
    setShowProceedBlockers(false);
    setCurrentStep(3);
  };

  const handleNext = async () => {
    if (!canProceed && !isCalculating) {
      setShowProceedBlockers(true);
      return;
    }

    if (wizardScenario === 'custom' && currentStep === 2) {
      setShowBranchPrompt(true);
      return;
    }

    setShowProceedBlockers(false);

    if (currentStep < totalWizardSteps) {
      setCurrentStep(currentStep + 1);
      return;
    }
    await runCalculation();
  };

  const handlePrevious = () => {
    setShowProceedBlockers(false);
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleResultBack = () => {
    returnFromResult(planOptions.length > 0);
  };

  const title = getStepTitle(currentStepType, lang, t);
  const description = getStepDescription(currentStepType, lang, t);
  const infoMessage = getStepInfoMessage(currentStepType, lang, t);
  const canProceed = canProceedStep(config, currentStepType) && !isCalculating;
  const proceedBlockers = getStepProceedBlockers(config, currentStepType, lang, apiAvailable);
  useEffect(() => {
    if (canProceed) setShowProceedBlockers(false);
  }, [canProceed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = buildNavigationParams(
      showWelcome,
      navPage,
      currentStep,
      config,
      showPlanSelection,
      inWizard,
      totalWizardSteps,
    );
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }

    const state: StoredNavState = {
      showWelcome,
      navPage,
      currentStep,
      config,
    };
    try {
      window.sessionStorage.setItem(APP_NAV_STATE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota/private-mode failures; URL state still works.
    }
  }, [config, currentStep, inWizard, navPage, showPlanSelection, showWelcome, totalWizardSteps]);
  const blockingMessage = showProceedBlockers && !canProceed && !isCalculating && proceedBlockers.length > 0
    ? `${proceedBlockers.join(lang === 'en' ? '; ' : '；')}${lang === 'en' ? '.' : '。'}`
    : undefined;
  const nextLabel = isCalculating
    ? t('btn.calculating')
    : currentStep === totalWizardSteps
      ? t('app.generate_plans')
      : t('btn.next');

  const renderApp = () => {
  if (isProductsLoading || productsLoadError) {
    return (
      <ProductCatalogStatus
        isLoading={isProductsLoading}
        error={productsLoadError}
        lang={lang}
        onRetry={retryProductsLoad}
      />
    );
  }

  if (showWelcome) {
    return <WelcomePage onStart={() => setShowWelcome(false)} />;
  }

  if (showPlanSelection) {
    return (
      <AppScaffold activePage={navPage} onNavigate={handleNavigate} apiAvailable={apiAvailable} densityMode={densityMode}>
        <PlanSelectionPage
          options={planOptions}
          dieselKw={planDieselKw}
          annualLoadKwh={config.annualLoadKwh ?? 0}
          layoutMaxSets={config.maxBracketSetsByLayout ?? null}
          isLoadingDetail={isLoadingDetail}
          onSelect={handlePlanSelect}
          onBack={() => resetCalculationState()}
        />
      </AppScaffold>
    );
  }

  if (inWizard && currentStep === totalWizardSteps + 1) {
    return (
      <AppScaffold activePage={navPage} onNavigate={handleNavigate} apiAvailable={apiAvailable} densityMode={densityMode}>
        <ResultPage
            config={config}
            apiResult={apiResult}
            isCalculating={isCalculating}
            apiError={apiError}
            apiErrorDiagnostics={apiErrorDiagnostics}
            isSimulationRunning={isSimulationRunning}
          onRetry={runCalculation}
          onRetryWithConfig={(updates) => {
            const nextConfig = { ...config, ...updates };
            setConfig(nextConfig);
            void runCalculation(nextConfig);
          }}
          onBack={handleResultBack}
          onRestart={() => {
            setCurrentStep(1);
            resetCalculationState();
            setConfig(createDefaultConfig((wizardScenario ?? 'known-load') as Scenario));
          }}
        />
      </AppScaffold>
    );
  }

  if (!inWizard) {
      const sizeMap: Record<NavPage, 'small' | 'medium' | 'large'> = {
      'standard-small': 'small',
      'standard-medium': 'medium',
      'standard-large': 'large',
      'custom-solution': 'small',
    };

    return (
      <AppScaffold activePage={navPage} onNavigate={handleNavigate} apiAvailable={apiAvailable} densityMode={densityMode} mainClassName="app-main-scroll">
        <StandardProductPage size={sizeMap[navPage]} />
      </AppScaffold>
    );
  }

  return (
    <AppScaffold activePage={navPage} onNavigate={handleNavigate} apiAvailable={apiAvailable} densityMode={densityMode} mainClassName="app-main-flow">
      <WizardFlowPage
        apiAvailable={apiAvailable}
        canProceed={canProceed}
        config={config}
        currentStep={currentStep}
        currentStepType={currentStepType}
        description={description}
        handleNext={handleNext}
        handlePrevious={currentStep > 1 ? handlePrevious : undefined}
        handlePvSetupUpdate={handlePvSetupUpdate}
        infoMessage={infoMessage}
        isCalculating={isCalculating}
        isBranchPromptOpen={showBranchPrompt}
        nextLabel={nextLabel}
        blockingMessage={blockingMessage}
        nextDisabled={isCalculating}
        onBranchPromptClose={() => setShowBranchPrompt(false)}
        onBranchSelect={handleBranchSelect}
        scenario={wizardScenario}
        showSiteAreaMap={showSiteAreaMap}
        title={title}
        topology={topology}
        totalWizardSteps={totalWizardSteps}
        updateConfig={updateConfig}
        calcPvKw={calcPvKw}
      />
    </AppScaffold>
  );
  };

  return renderApp();
}

export default App;
