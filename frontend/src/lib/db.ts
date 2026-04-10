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
  profile?: {
    age_range?: '18-25' | '26-35' | '36-45' | '45+';
    gender?: 'male' | 'female' | 'other';
    occupation?: 'white_collar' | 'entrepreneur' | 'freelance' | 'student' | 'other';
    distance_km?: 'walk10' | 'drive15' | 'far';
    referral_source?: 'friend' | 'xiaohongshu' | 'passing' | 'search' | 'other';
    decision_speed?: 'same_day' | 'few_days' | 'over_week';
    budget_level?: 'under_1000' | '1000_3000' | 'over_3000';
    training_experience?: 'none' | 'irregular' | 'regular_6m+';
    weekly_frequency_plan?: 1 | 2 | 3 | 4;
    goal_type?: 'fat_loss' | 'muscle_gain' | 'performance' | 'posture' | 'rehabilitation';
    goal_timeline?: '1month' | '3months' | '6months+' | 'no_expectation';
    sleep_quality?: 'good' | 'average' | 'poor';
    stress_level?: 'low' | 'medium' | 'high';
    diet_regularity?: 'regular' | 'occasional' | 'often_takeout';
    sedentary_6h?: boolean;
    survey_completed_at?: string;
  };
  ltv_score?: number;
  bodyMetrics?: {
    bf_pct?: number;
    smm_pct?: number;
    waist_cm?: number;
    hip_cm?: number;
    chest_cm?: number;
    rhr?: number;
    sleep_hours?: number;
    training_age_months?: number;
    squat_assessment?: 'good' | 'compensate' | 'limited';
    single_leg_balance_sec?: number;
    shoulder_mobility?: 'good' | 'limited' | 'poor';
  };
  goal_type?: 'muscle_gain' | 'fat_loss' | 'performance' | 'rehabilitation';
  injury_detail?: {
    area?: string;
    level?: 'mild' | 'moderate' | 'avoid';
    forbidden_moves?: string;
    surgery_history?: string;
  };
  assessments?: Array<{
    date: string;
    weight?: number;
    bf_pct?: number;
    smm_pct?: number;
    rhr?: number;
    waist_cm?: number;
    score_snapshot?: number;
    notes?: string;
  }>;
};

export function getLevelInfo(level: number): { price: number } {
  if (level <= 1) return { price: 399 };
  if (level === 2) return { price: 499 };
  if (level === 3) return { price: 599 };
  return { price: 399 };
}
