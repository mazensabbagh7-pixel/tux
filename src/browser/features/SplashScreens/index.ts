import { OnboardingWizardSplash } from "./OnboardingWizardSplash";

export interface SplashConfig {
  id: string;
  priority: number;
  component: React.FC<{ onDismiss: () => void }>;
}

export const ONBOARDING_WIZARD_SPLASH_ID = "onboarding-wizard-v1";

// Add new splash screens here
// Priority 0 = Never show
// Priority 1 = Lowest priority
// Priority 2 = Medium priority
// Priority 3+ = Higher priority (shown first)
export const SPLASH_REGISTRY: SplashConfig[] = [
  { id: ONBOARDING_WIZARD_SPLASH_ID, priority: 5, component: OnboardingWizardSplash },
  // Future: { id: "new-feature-xyz", priority: 2, component: NewFeatureSplash },
];

// Nux should open straight into the app. Keep first-run splash screens disabled
// so onboarding never blocks testing or normal use.
export const DISABLE_SPLASH_SCREENS = true;
