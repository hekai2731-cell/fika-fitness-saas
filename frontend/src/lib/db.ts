export type TrainingDay = {
  id: string;
  day: string;
  name: string;
  focus?: string;
  modules?: unknown[];
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
  hrAvg?: number;
  hrMax?: number;
  hrMin?: number;
  hrZoneDurations?: Record<number, number>;
  kcal?: number;
  block_index?: number;
  block_week?: number;
};

export type Client = {
  id: string;
  roadCode?: string;
  name: string;
  coachCode?: string;
  coachName?: string;
  tier?: 'standard' | 'pro' | 'ultra';
  gender?: 'male' | 'female';
  age?: number;
  height?: number;
  weight?: number;
  goal?: string;
  injury?: string;
  weeks?: number;
  weeks_total?: number;
  deletedAt?: string;
  deletedByCoachCode?: string;
  deletedByCoachName?: string;
  membershipLevel?: 'standard' | 'advanced' | 'professional' | 'elite';
  weeklyData?: Array<Record<string, unknown>>;
  start_date?: string;
  current_week?: number;
  blocks?: Block[];
  published_blocks?: Block[];
  plan_draft_version?: number;
  plan_draft_status?: 'draft' | 'review_ready' | 'published' | 'archived';
  plan_published_version?: number;
  plan_updated_at?: string;
  plan_published_at?: string;
  plan_publish_history?: Array<{
    version?: number;
    published_at?: string;
    published_by?: {
      coachCode?: string;
      coachName?: string;
    };
    blocks?: Block[];
  }>;
  sessions?: ClientSession[];
  dietPlans?: unknown[];
  dailyLogs?: Array<{
    date?: string;
    totalProtein?: number;
  }>;
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

// ── 新架构类型定义 ───────────────────────────────────────────────

export type TrainingPlan = {
  _id?: string;
  clientId: string;
  coachCode?: string;
  status: 'draft' | 'review_ready' | 'published' | 'archived';
  draft_version?: number;
  published_version?: number;
  published_at?: string;
  updated_at?: string;
  blocks: Block[];
  published_blocks?: Block[];
  publish_history?: Array<{
    version: number;
    published_at: string;
    published_by?: { coachCode?: string; coachName?: string };
    summary?: { block_count: number; week_count: number; day_count: number };
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type AiDraft = {
  _id?: string;
  clientId: string;
  coachCode?: string;
  planType: 'session' | 'week' | 'full' | 'diet';
  status: 'pending' | 'approved' | 'rejected';
  input_payload?: Record<string, unknown>;
  output_result?: Record<string, unknown>;
  approved_at?: string;
  rejected_at?: string;
  reject_reason?: string;
  target_plan_id?: string;
  target_week_id?: string;
  target_day_id?: string;
  createdAt?: string;
};

export type SessionRecord = {
  _id?: string;
  clientId: string;
  coachCode?: string;
  date: string;
  week?: number;
  day?: string;
  duration?: number;
  price?: number;
  level?: number;
  rpe?: number;
  performance?: string;
  note?: string;
  hrAvg?: number;
  hrMax?: number;
  hrMin?: number;
  hrZoneDurations?: Record<number, number>;
  kcal?: number;
  plan_id?: string;
  plan_day_id?: string;
  block_index?: number;
  block_week?: number;
  exercises?: unknown[];
  createdAt?: string;
};

export type FinanceRecord = {
  _id?: string;
  clientId: string;
  coachCode?: string;
  type: 'purchase' | 'consumption' | 'refund' | 'adjustment';
  sessions_count?: number;
  sessions_remaining?: number;
  amount?: number;
  package_type?: 'standard' | 'advanced' | 'professional' | 'elite';
  date?: string;
  note?: string;
  session_id?: string;
  createdAt?: string;
};

export type FinanceSummary = {
  sessions_purchased: number;
  sessions_consumed: number;
  sessions_refunded: number;
  sessions_remaining: number;
};
