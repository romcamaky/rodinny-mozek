// Domain types for the Kids Development Tracker (Module 4B).
// Aligned with `milestones`, `milestone_logs`, and `milestone_tasks` tables.

/** Milestone — a developmental goal being tracked for one child */
export interface Milestone {
  id: string
  user_id: string
  child_name: 'viky' | 'adri'
  title: string
  category: 'life_skill' | 'developmental'
  description: string | null
  status: 'active' | 'paused' | 'completed'
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** MilestoneLog — a single progress update logged by the parent */
export interface MilestoneLog {
  id: string
  user_id: string
  milestone_id: string
  note: string
  source: 'voice' | 'text'
  /** JSON string of Claude's evaluation (shape may vary; parse with helpers). */
  ai_response: string | null
  logged_at: string
  created_at: string
  updated_at: string
}

/** MilestoneTask — AI-generated weekly micro-tasks */
export interface MilestoneTask {
  id: string
  user_id: string
  milestone_id: string
  week_start: string
  tasks: TaskItem[]
  generated_at: string
  created_at: string
  updated_at: string
}

/** Single micro-task within a weekly set (stored inside milestone_tasks.tasks JSONB). */
export interface TaskItem {
  task: string
  tip: string
  difficulty: 'easy' | 'medium' | 'challenge'
  done: boolean
}

/** Parsed AI evaluation stored in MilestoneLog.ai_response (preferred shape). */
export interface AiEvaluation {
  evaluation: string
  suggested_status: 'active' | 'completed' | null
  updated_tasks: TaskItem[]
}

/** AI ask response from milestone-ai `ask` mode (not persisted). */
export interface AiAskResponse {
  answer: string
  follow_up_suggestion: string | null
}

/** Single activity in the shared weekly development plan (twins — not per-child milestone tasks). */
export interface ActivityItem {
  id: string
  activity: string
  tip: string
  category: 'motor' | 'speech' | 'independence' | 'sensory' | 'play' | 'social'
  estimated_minutes: number
  done: boolean
}

/** Weekly activity plan row in `weekly_activities`. */
export interface WeeklyActivities {
  id: string
  user_id: string
  week_start: string
  difficulty_level: 'easier' | 'normal' | 'harder'
  activities: ActivityItem[]
  generated_at: string
  created_at: string
  updated_at: string
}
