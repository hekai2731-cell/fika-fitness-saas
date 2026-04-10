export type TrainingDay = {
  id: string;
  day: string;
  name: string;
  focus?: string;
  modules?: any[];
  exercises?: string;
};

export type TrainingWeek = {
  id: string;
  week_num: number;
  days: TrainingDay[];
};

export type Block = {
  id: string;
  title: string;
  training_weeks: TrainingWeek[];
};

export type ClientSession = {
  week: number;
  day: string;
  level: number;
  price: number;
  note: string;
  date: string;
  rpe: number;
  performance: string;
  duration: number;
  block_index?: number;
  block_week?: number;
};

export type Client = {
  id: string;
  roadCode?: string;
  name: string;
  tier?: 'standard' | 'pro' | 'ultra';
  gender?: 'male' | 'female';
  age?: number;
  height?: number;
  weight?: number;
  goal?: string;
  injury?: string;
  weeklyData?: Array<Record<string, any>>;
  start_date?: string;
  current_week?: number;
  blocks?: Block[];
  published_blocks?: Block[];
  plan_draft_version?: number;
  plan_published_version?: number;
  plan_updated_at?: string;
  plan_published_at?: string;
  sessions?: ClientSession[];
  bodyMetrics?: {
    bf_pct?: number;
    smm_pct?: number;
    waist_cm?: number;
    rhr?: number;
    sleep_hours?: number;
    training_age_months?: number;
  };
  goal_type?: 'muscle_gain' | 'fat_loss' | 'performance' | 'rehabilitation';
  injury_detail?: {
    area?: string;
    level?: 'mild' | 'moderate' | 'avoid';
    forbidden_moves?: string;
  };
  assessments?: Array<{
    date: string;
    weight?: number;
    bf_pct?: number;
    smm_pct?: number;
    rhr?: number;
    score_snapshot?: number;
  }>;
};

export function getLevelInfo(level: number): { price: number } {
  if (level <= 1) return { price: 399 };
  if (level === 2) return { price: 499 };
  if (level === 3) return { price: 599 };
  return { price: 399 };
}
