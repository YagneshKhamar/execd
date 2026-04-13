export interface IElectronAPI {
  config: {
    save: (data: unknown) => Promise<{ success: boolean }>
    get: () => Promise<unknown>
  }
  goals: {
    save: (goals: unknown) => Promise<{ success: boolean; ids: string[] }>
    get: (month: string) => Promise<unknown[]>
    updateValidation: (id: string, note: string, valid: boolean) => Promise<{ success: boolean }>
  }
  subgoals: {
    save: (subgoals: unknown) => Promise<{ success: boolean }>
    getByGoal: (goalId: string) => Promise<unknown[]>
    delete: (id: string) => Promise<{ success: boolean }>
    update: (id: string, title: string, priority: string) => Promise<{ success: boolean }>
  }
  ai: {
    validateGoal: (
      title: string,
    ) => Promise<{ success: boolean; data?: { valid: boolean; note: string }; error?: string }>
    generateSubgoals: (
      title: string,
      type: string,
    ) => Promise<{ success: boolean; data?: { title: string; priority: string }[]; error?: string }>
    generateDailyTasks: (
      context: unknown,
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>
    endOfDayFeedback: (
      context: unknown,
    ) => Promise<{ success: boolean; data?: string; error?: string }>
    suggestGoalFix: (
      title: string,
      note: string,
    ) => Promise<{ success: boolean; data?: string; error?: string }>
    generateAnalyticsInsight: (context: unknown) => Promise<{
      success: boolean
      data?: { heading: string; body: string }
      error?: string
    }>
  }
  tasks: {
    getByDate: (date: string) => Promise<unknown[]>
    getDayPlan: (date: string) => Promise<unknown>
    saveDayPlan: (data: unknown) => Promise<{ success: boolean }>
    saveTasks: (tasks: unknown) => Promise<{ success: boolean }>
    lockDayPlan: (date: string) => Promise<{ success: boolean }>
    completeTask: (id: string, proof: string | null) => Promise<{ success: boolean }>
    getMissed: (date: string) => Promise<unknown[]>
    markMissed: (date: string) => Promise<{ success: boolean }>
    carryOver: (taskId: string, toDate: string) => Promise<{ success: boolean; newTaskId?: string }>
    drop: (taskId: string, date: string) => Promise<{ success: boolean }>
    getCarryOverCount: (date: string) => Promise<number>
    endOfDay: (date: string) => Promise<{
      score: number
      feedback: string
      completed: unknown[]
      missed: unknown[]
    }>
  }
  reports: {
    week: (endDate: string) => Promise<{
      days: {
        date: string
        execution_score: number
        tasks_completed: number
        tasks_missed: number
      }[]
      patterns: { title: string; miss_count: number }[]
    }>
    dayLog: (date: string) => Promise<{
      execution_score: number
      ai_feedback: string
      tasks_completed: number
      tasks_missed: number
    } | null>
    year: (year: string) => Promise<{
      days: {
        date: string
        execution_score: number
        tasks_completed: number
        tasks_missed: number
        tasks_carried: number
      }[]
      months: {
        month: string
        avg_score: number
        total_completed: number
        total_missed: number
        days_logged: number
      }[]
      topMissed: {
        title: string
        miss_count: number
      }[]
    }>
    analytics: (days: number) => Promise<{
      trend: {
        date: string
        execution_score: number
        tasks_completed: number
        tasks_missed: number
      }[]
      byEffort: {
        effort: string
        completed: number
        missed: number
      }[]
      bySlot: {
        slot: string
        completed: number
        missed: number
      }[]
      carryTrend: {
        date: string
        tasks_carried: number
      }[]
    }>
  }
  overlay: {
    openMain: () => Promise<void>
    hide: () => Promise<void>
  }
  electronAPI: {
    captureReport: () => Promise<string>
  }
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
