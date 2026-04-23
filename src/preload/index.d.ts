export interface IElectronAPI {
  config: {
    save: (data: unknown) => Promise<{ success: boolean }>
    get: () => Promise<{ fiscal_year_start: number } & Record<string, unknown>>
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
    generateMonthlyTargets: (context: {
      yearlyTarget: number
      collectionTarget: number | null
      businessType: string
      fiscalYearStart: number
      year: number
    }) => Promise<{
      success: boolean
      data?: { month: string; sales_target: number; collection_target: number }[]
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
    uncompleteTask: (id: string) => Promise<{ success: boolean }>
    updateNotes: (id: string, notes: string) => Promise<{ success: boolean }>
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
    getHistory: (filters: {
      month?: string
      date?: string
      status?: string
    }) => Promise<{
      id: string
      title: string
      effort: string
      proof_type: string
      proof_value: string | null
      status: string
      scheduled_date: string
      scheduled_time_slot: string
      carry_count: number
      subgoal_title: string | null
      goal_title: string | null
      completed_at: string | null
    }[]>
    updateProof: (taskId: string, proof: string) => Promise<{ success: boolean }>
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
    exportTasksCsv: (filters: { month?: string }) => Promise<{
      success: boolean
      csv: string
      filename: string
    }>
    exportSummaryCsv: (filters: { year?: string }) => Promise<{
      success: boolean
      csv: string
      filename: string
    }>
  }
  sales: {
    getMonthlyTargets: (filters: { fiscalYearStart: number; year: number }) => Promise<{
      year_month: string
      sales_target: number
      collection_target: number
    }[]>
    saveMonthlyTargets: (targets: {
      year_month: string
      sales_target: number
      collection_target: number
    }[]) => Promise<{ success: boolean }>
    getDailySales: (filters: { month: string }) => Promise<{
      date: string
      sales_amount: number
      collection_amount: number
      notes: string
    }[]>
    saveDailyEntry: (data: {
      date: string
      sales_amount: number
      collection_amount: number
      notes?: string
    }) => Promise<{ success: boolean }>
    getMonthSummary: (filters: { month: string }) => Promise<{
      month: string
      sales_done: number
      sales_target: number
      collection_done: number
      collection_target: number
      days_with_entry: number
    }>
    getYearlySummary: (filters: { fiscalYearStart: number; year: number }) => Promise<{
      year_month: string
      sales_target: number
      collection_target: number
      sales_done: number
      collection_done: number
    }[]>
  }
  business: {
    get: () => Promise<{
      business_name: string
      business_type: string
      monthly_sales_target: number | null
      collection_target: number | null
      primary_activities: string[]
      team_size: number
      language: string
    } | null>
    save: (data: {
      business_name: string
      business_type: string
      monthly_sales_target?: number | null
      collection_target?: number | null
      primary_activities: string[]
      team_size: number
      language: string
    }) => Promise<{ success: boolean }>
  }
  team: {
    getMembers: () => Promise<unknown[]>
    addMember: (data: unknown) => Promise<{ success: boolean; id?: string }>
    removeMember: (id: string) => Promise<{ success: boolean; id?: string }>
    getTasks: (memberId: string, weekStart: string) => Promise<unknown[]>
    getAllTasks: (weekStart: string) => Promise<unknown[]>
    addTask: (data: unknown) => Promise<{ success: boolean; id?: string }>
    updateTaskStatus: (
      taskId: string,
      status: string,
      proof?: string,
    ) => Promise<{ success: boolean; id?: string }>
    addNote: (taskId: string, note: string) => Promise<{ success: boolean; id?: string }>
    getFollowups: (date: string) => Promise<unknown[]>
    addFollowup: (data: unknown) => Promise<{ success: boolean; id?: string }>
    completeFollowup: (id: string) => Promise<{ success: boolean; id?: string }>
    getOverdue: () => Promise<unknown[]>
  }
  overlay: {
    openMain: () => Promise<void>
    hide: () => Promise<void>
  }
  updater: {
    check: () => Promise<void>
    download: () => Promise<void>
    install: () => Promise<void>
    onStatus: (callback: (data: {
      status: 'checking' | 'available' | 'latest' | 'downloading' | 'ready' | 'error'
      version?: string
      percent?: number
      message?: string
    }) => void) => void
    removeStatusListener: () => void
  }
  electronAPI: {
    captureReport: (rect?: { x: number; y: number; width: number; height: number }) => Promise<string>
  }
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
