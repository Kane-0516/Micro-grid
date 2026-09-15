import { describe, expect, it } from 'vitest';

import type { Scenario } from '@/types';
import { getTotalWizardSteps } from './wizardFlow';

describe('getTotalWizardSteps', () => {
  it.each<Scenario | null>(['known-load', 'diy', 'custom', 'no-load', null])(
    'keeps the six-step flow for %s',
    (scenario) => {
      expect(getTotalWizardSteps(scenario)).toBe(6);
    },
  );
});
