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
  batch_cooking: Record<string, unknown>
  shopping_list: Record<string, unknown>
  status: 'draft' | 'active' | 'archived'
  created_at: string
  updated_at: string
}
