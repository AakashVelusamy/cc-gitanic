import { HapticInput, TriggerOptions } from 'web-haptics';

export const DEFAULT_HAPTIC_PATTERN: HapticInput = [
  { duration: 10 },
  { delay: 60, duration: 60 },
];

export const DEFAULT_HAPTIC_OPTIONS: TriggerOptions = { intensity: 1 };

/**
 * Triggers the default haptic feedback sequence.
 * @param trigger The trigger function from useWebHaptics()
 */
export const triggerDefaultHaptic = (trigger: (input?: HapticInput, options?: TriggerOptions) => unknown) => {
  if (typeof trigger === 'function') {
    trigger(DEFAULT_HAPTIC_PATTERN, DEFAULT_HAPTIC_OPTIONS);
  }
};
