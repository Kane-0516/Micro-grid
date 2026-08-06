import SideNav, { type NavPage } from '@/components/layout/SideNav';
import type { ReactNode } from 'react';
import type { DensityMode } from '@/App';

interface AppScaffoldProps {
  activePage: NavPage;
  apiAvailable: boolean | null;
  children: ReactNode;
  densityMode: DensityMode;
  mainClassName?: string;
  onNavigate: (page: NavPage) => void;
}

export default function AppScaffold({
  activePage,
  apiAvailable,
  children,
  densityMode,
  mainClassName,
  onNavigate,
}: AppScaffoldProps) {
  return (
    <div className="app" data-density-mode={densityMode}>
      <div className="app-body">
        <SideNav
          activePage={activePage}
          onNavigate={onNavigate}
          apiAvailable={apiAvailable}
        />
        <div className={mainClassName ? `app-main-content ${mainClassName}` : 'app-main-content'}>
          {children}
        </div>
      </div>
    </div>
  );
}
