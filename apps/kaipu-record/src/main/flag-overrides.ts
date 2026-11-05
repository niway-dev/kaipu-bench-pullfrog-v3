import type { WebPreferences } from "electron";
import { flagOverridesArg, type FlagOverrides } from "@shared/flag-overrides";

let active: FlagOverrides = {};

/** Set once at startup, before any window exists. */
export function setActiveFlagOverrides(overrides: FlagOverrides): void {
  active = overrides;
}

export function activeFlagOverrides(): FlagOverrides {
  return active;
}

/**
 * `webPreferences` for a window that loads the renderer: passes the active feature-flag
 * overrides to its preload, keeping any `additionalArguments` the window already had.
 * With no override active the preferences come back untouched.
 */
export function withFlagOverrides(webPreferences: WebPreferences): WebPreferences {
  if (Object.keys(active).length === 0) return webPreferences;
  return {
    ...webPreferences,
    additionalArguments: [...(webPreferences.additionalArguments ?? []), flagOverridesArg(active)],
  };
}
