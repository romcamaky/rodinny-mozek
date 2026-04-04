export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  assigned_to: 'romi' | 'petr' | 'both'
  deadline: string | null
  status: 'todo' | 'in_progress' | 'done'
  source: 'voice' | 'text' | 'ai_generated'
  visibility: 'shared' | 'private'
  /** Google Calendar event IDs from calendar-sync Edge Function; null if never synced. */
  google_calendar_event_ids: {
    week_before: string | null
    two_days_before: string | null
    deadline: string | null
  } | null
  /** When google_calendar_event_ids was last written after a successful sync. */
  google_calendar_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  text: string
  category: 'idea' | 'trip' | 'kids' | 'personal' | 'project' | 'other'
  visibility: 'shared' | 'private'
  source: 'voice' | 'text'
  created_at: string
  updated_at: string
}

export interface Place {
  id: string
  user_id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  website: string | null
  visit_duration_minutes: number | null
  tags: string[]
  source: 'instagram' | 'friend' | 'web' | 'own_experience'
  source_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecipeIngredient {
  name: string
  quantity: string
  unit: string
}

export interface Recipe {
  id: string
  user_id: string
  name: string
  source: 'cookidoo' | 'web' | 'custom'
  source_url: string | null
  ingredients: RecipeIngredient[]
  instructions: string | null
  tags: string[]
  prep_time_minutes: number | null
  servings: number | null
  created_at: string
  updated_at: string
}

export interface MealPlan {
  id: string
  user_id: string
  week_start: string
  variant: 'A' | 'B'
  plan_data: Record<string, unknown>
  batch_cooking: unknown
  shopping_list: unknown
  status: 'draft' | 'active' | 'archived'
  created_at: string
  updated_at: string
}

// Milestone: a developmental goal being tracked for a child
export interface Milestone {
  id: string
  user_id: string
  title: string
  child_name: string
  category: 'life_skill' | 'developmental'
  description: string | null
  status: 'active' | 'paused' | 'completed'
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

// MilestoneLog: a single progress entry for a milestone
export interface MilestoneLog {
  id: string
  user_id: string
  milestone_id: string
  note: string
  source: 'voice' | 'text'
  ai_response: string | null
  logged_at: string
  created_at: string
  updated_at: string
}

// MilestoneTask: AI-generated weekly micro-tasks for a milestone
export interface MilestoneTask {
  id: string
  user_id: string
  milestone_id: string
  week_start: string
  tasks: Array<{ task: string; done: boolean }>
  generated_at: string
  created_at: string
  updated_at: string
}
