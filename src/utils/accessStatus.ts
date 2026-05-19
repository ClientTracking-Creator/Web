import { AppSettings } from "@/models/types";

export const TRIAL_DAYS = 3;

export type AccessStatus =
  | { active: true; type: "trial" | "subscription"; days: number }
  | { active: false; type: "none"; days: 0 };

const getTime = (value?: string) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export function getAccessStatus(settings: AppSettings, now = Date.now(), trialDays = TRIAL_DAYS): AccessStatus {
  const subscriptionExpiry = getTime(settings.subscriptionExpiry);
  if (subscriptionExpiry > now) {
    return { active: true, type: "subscription", days: Math.ceil((subscriptionExpiry - now) / 86400000) };
  }

  const trialStart = getTime(settings.trialStartedAt);
  const trialExpiry = trialStart + trialDays * 86400000;
  if (trialStart > 0 && trialExpiry > now) {
    return { active: true, type: "trial", days: Math.ceil((trialExpiry - now) / 86400000) };
  }

  return { active: false, type: "none", days: 0 };
}

