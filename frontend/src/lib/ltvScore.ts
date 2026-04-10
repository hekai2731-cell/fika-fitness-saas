import type { Client } from '@/lib/db';

export function calcLtvScore(client: Client): number {
  const renewalScore = Math.min(40, (client.weeklyData?.filter((w: any) => Number(w?.paid || 0) > 0).length || 0) * 8);
  const referralScore = client.profile?.referral_source === 'friend' ? 20 : 0;
  const sessions = client.sessions?.length || 0;
  const weeks = Math.max(1, Math.ceil(sessions / 3));
  const freqScore = Math.min(20, Math.round((sessions / weeks) / 3 * 20));
  const tierScore = client.tier === 'ultra' ? 20 : client.tier === 'pro' ? 13 : 6;
  return Math.min(100, renewalScore + referralScore + freqScore + tierScore);
}
