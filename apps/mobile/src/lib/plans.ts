import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/*
 * Quizzly credits and plans (CREDITS_AND_PLANS.md, FR-INV-03..05, FR-PLAN-01..03). The server
 * decides everything: credits, the discount and the plan; the app only shows them.
 */

export type Friend = {
  display_name: string | null;
  credited_at: string | null;
  /** counted: a credit; started: joined and studied on `study_days` of 3 days so far. */
  state: 'counted' | 'started';
  study_days: number;
};

export type Invite = {
  code: string;
  link: string;
  friends: Friend[];
  credited: number;
  next_reward: { kind: 'lavender' | 'discount'; at: number; percent: number | null } | null;
  lavender_unlocked: boolean;
  discount: { percent: number; at: number; unlocked: boolean; celebrate: boolean };
};

export type PlanId = 'free' | 'student' | 'premium';

export type Plan = {
  id: PlanId;
  price_usd: number;
  discounted_price_usd: number | null;
  limits: { upload: number; question_set: number; explanation: number; chat_message: number; marking: number };
  storage_mb: number;
  monthly_ai_usd: number;
  extras: string[];
  product_id: string | null;
};

export type Plans = {
  current: PlanId;
  expires_at: string | null;
  effective: PlanId | 'capped';
  discount_percent: number | null;
  invite_offer_id: string | null;
  payments_ready: boolean;
  plans: Plan[];
};

export const STUDY_DAYS_NEEDED = 3;
export const LAVENDER_AT = 3;

export function useInvite() {
  const signedIn = Boolean(useAuth((s) => s.session));
  return useQuery({ queryKey: ['invite'], queryFn: () => apiFetch<Invite>('/v1/me/invite'), enabled: signedIn });
}

/** The discount celebration (23c) was shown; the server won't ask for it again. */
export function useRewardSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/v1/me/invite/reward-seen', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['invite'] }),
  });
}

export function usePlans() {
  const signedIn = Boolean(useAuth((s) => s.session));
  return useQuery({ queryKey: ['plans'], queryFn: () => apiFetch<Plans>('/v1/plans'), enabled: signedIn });
}

// Prices are in dollars; Google Play shows the exact local price at checkout. Nigerian students see
// an approximate naira price first (the Play price table), everyone else dollars (FR-PROF-08).
const NAIRA_PER_DOLLAR = 1500;

/** "$6", "$5.40". */
export function dollars(usd: number) {
  return `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
}

/** "₦9,000" in Nigeria, "$6" elsewhere. */
export function price(usd: number, country: string | undefined) {
  if (country === 'NG') return `₦${(Math.round((usd * NAIRA_PER_DOLLAR) / 100) * 100).toLocaleString('en-NG')}`;
  return dollars(usd);
}

/** "about $5.40" under a naira price; nothing when the main price is already in dollars. */
export function priceNote(usd: number, country: string | undefined) {
  return country === 'NG' ? `about ${dollars(usd)}` : null;
}

export function planName(id: PlanId | 'capped') {
  return id === 'student' ? 'Student' : id === 'premium' ? 'Premium' : 'Free';
}
