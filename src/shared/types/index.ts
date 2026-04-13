export type AiProvider = 'openai' | 'anthropic'
export type WorkingDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type EffortLevel = 'light' | 'medium' | 'heavy'
export type ProofType = 'none' | 'comment' | 'link'
export type TimeSlot = 'morning' | 'afternoon' | 'anytime'
export type GoalType = 'business' | 'personal' | 'family'
export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'completed' | 'carried' | 'dropped' | 'missed'
export type TaskAction = 'completed' | 'carried' | 'dropped' | 'missed'
export type FlagType = 'avoidance' | 'overload' | 'category_skip' | 'time_mismatch'

export interface Config {
  id: number
  ai_provider: AiProvider
  api_key_encrypted: string
  working_start: string
  working_end: string
  working_days: string
  break_start: string
  break_end: string
  created_at: string
  updated_at: string
}

export interface Holiday {
  id: string
  date: string
  is_working: number
  note: string
}

export interface Goal {
  id: string
  month: string
  title: string
  type: GoalType
  ai_validated: number
  ai_validation_note: string
  created_at: string
}

export interface Subgoal {
  id: string
  goal_id: string
  title: string
  priority: Priority
  created_at: string
}

export interface Task {
  id: string
  subgoal_id: string
  title: string
  effort: EffortLevel
  proof_type: ProofType
  scheduled_date: string
  scheduled_time_slot: TimeSlot
  status: TaskStatus
  proof_value: string | null
  carried_over_from: string | null
  carry_count: number
  created_at: string
  completed_at: string | null
}

export interface DayPlan {
  id: string
  date: string
  available_minutes: number
  locked: number
  locked_at: string | null
  replan_used: number
  created_at: string
}

export interface DayLog {
  id: string
  date: string
  total_weight: number
  completed_weight: number
  execution_score: number
  ai_feedback: string
  tasks_completed: number
  tasks_missed: number
  tasks_carried: number
  tasks_dropped: number
  created_at: string
}

export interface TaskLog {
  id: string
  task_id: string
  date: string
  action: TaskAction
  proof_type: string | null
  proof_value: string | null
  carry_count_at_time: number
  created_at: string
}

export interface BehaviorFlag {
  id: string
  flag_type: FlagType
  description: string
  task_id: string | null
  subgoal_id: string | null
  detected_on: string
  resolved: number
  resolved_on: string | null
}
