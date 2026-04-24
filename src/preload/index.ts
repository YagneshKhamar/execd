import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  config: {
    save: (data: unknown) => ipcRenderer.invoke('config:save', data),
    get: () => ipcRenderer.invoke('config:get'),
  },
  goals: {
    save: (goals: unknown) => ipcRenderer.invoke('goals:save', goals),
    get: (month: string) => ipcRenderer.invoke('goals:get', month),
    updateValidation: (id: string, note: string, valid: boolean) =>
      ipcRenderer.invoke('goals:update-validation', id, note, valid),
  },
  subgoals: {
    save: (subgoals: unknown) => ipcRenderer.invoke('subgoals:save', subgoals),
    getByGoal: (goalId: string) => ipcRenderer.invoke('subgoals:get-by-goal', goalId),
    delete: (id: string) => ipcRenderer.invoke('subgoals:delete', id),
    update: (id: string, title: string, priority: string) =>
      ipcRenderer.invoke('subgoals:update', id, title, priority),
  },
  ai: {
    validateGoal: (title: string) => ipcRenderer.invoke('ai:validate-goal', title),
    generateSubgoals: (title: string, type: string) =>
      ipcRenderer.invoke('ai:generate-subgoals', title, type),
    generateDailyTasks: (context: unknown) =>
      ipcRenderer.invoke('ai:generate-daily-tasks', context),
    endOfDayFeedback: (context: unknown) => ipcRenderer.invoke('ai:end-of-day-feedback', context),
    suggestGoalFix: (title: string, note: string) =>
      ipcRenderer.invoke('ai:suggest-goal-fix', title, note),
    generateAnalyticsInsight: (context: unknown) =>
      ipcRenderer.invoke('ai:analytics-insight', context),
    generateMonthlyTargets: (context: {
      yearlyTarget: number
      collectionTarget: number | null
      businessType: string
      fiscalYearStart: number
      year: number
    }) => ipcRenderer.invoke('ai:generate-monthly-targets', context),
  },
  tasks: {
    getByDate: (date: string) => ipcRenderer.invoke('tasks:get-by-date', date),
    getDayPlan: (date: string) => ipcRenderer.invoke('tasks:get-day-plan', date),
    saveDayPlan: (data: unknown) => ipcRenderer.invoke('tasks:save-day-plan', data),
    saveTasks: (tasks: unknown) => ipcRenderer.invoke('tasks:save-tasks', tasks),
    lockDayPlan: (date: string) => ipcRenderer.invoke('tasks:lock-day-plan', date),
    completeTask: (id: string, proof: string | null) =>
      ipcRenderer.invoke('tasks:complete', id, proof),
    uncompleteTask: (id: string) => ipcRenderer.invoke('tasks:uncomplete', id),
    updateNotes: (id: string, notes: string) => ipcRenderer.invoke('tasks:update-notes', id, notes),
    getMissed: (date: string) => ipcRenderer.invoke('tasks:get-missed', date),
    markMissed: (date: string) => ipcRenderer.invoke('tasks:mark-missed', date),
    carryOver: (taskId: string, toDate: string) =>
      ipcRenderer.invoke('tasks:carry-over', taskId, toDate),
    drop: (taskId: string, date: string) => ipcRenderer.invoke('tasks:drop', taskId, date),
    getCarryOverCount: (date: string) => ipcRenderer.invoke('tasks:get-carryover-count', date),
    endOfDay: (date: string) => ipcRenderer.invoke('tasks:end-of-day', date),
    getHistory: (filters: { month?: string; date?: string; status?: string }) =>
      ipcRenderer.invoke('tasks:get-history', filters),
    updateProof: (taskId: string, proof: string) =>
      ipcRenderer.invoke('tasks:update-proof', taskId, proof),
  },
  reports: {
    week: (endDate: string) => ipcRenderer.invoke('reports:week', endDate),
    dayLog: (date: string) => ipcRenderer.invoke('reports:day-log', date),
    year: (year: string) => ipcRenderer.invoke('reports:year', year),
    analytics: (days: number) => ipcRenderer.invoke('reports:analytics', days),
    exportTasksCsv: (filters: { month?: string }) =>
      ipcRenderer.invoke('reports:export-tasks-csv', filters),
    exportSummaryCsv: (filters: { year?: string }) =>
      ipcRenderer.invoke('reports:export-summary-csv', filters),
  },
  sales: {
    getMonthlyTargets: (filters: { fiscalYearStart: number; year: number }) =>
      ipcRenderer.invoke('sales:get-monthly-targets', filters),
    saveMonthlyTargets: (
      targets: {
        year_month: string
        sales_target: number
        collection_target: number
      }[],
    ) => ipcRenderer.invoke('sales:save-monthly-targets', targets),
    getDailySales: (filters: { month: string }) =>
      ipcRenderer.invoke('sales:get-daily-sales', filters),
    saveDailyEntry: (data: {
      date: string
      sales_amount: number
      collection_amount: number
      notes?: string
    }) => ipcRenderer.invoke('sales:save-daily-entry', data),
    getMonthSummary: (filters: { month: string }) =>
      ipcRenderer.invoke('sales:get-month-summary', filters),
    getYearlySummary: (filters: { fiscalYearStart: number; year: number }) =>
      ipcRenderer.invoke('sales:get-yearly-summary', filters),
  },
  business: {
    get: () => ipcRenderer.invoke('business:get'),
    save: (data: {
      business_name: string
      business_type: string
      monthly_sales_target?: number | null
      collection_target?: number | null
      primary_activities: string[]
      team_size: number
      language: string
    }) => ipcRenderer.invoke('business:save', data),
  },
  team: {
    getMembers: () => ipcRenderer.invoke('team:get-members'),
    addMember: (data: unknown) => ipcRenderer.invoke('team:add-member', data),
    removeMember: (id: string) => ipcRenderer.invoke('team:remove-member', id),
    getTasks: (memberId: string, weekStart: string) =>
      ipcRenderer.invoke('team:get-tasks', memberId, weekStart),
    getAllTasks: (weekStart: string) => ipcRenderer.invoke('team:get-all-tasks', weekStart),
    addTask: (data: unknown) => ipcRenderer.invoke('team:add-task', data),
    updateTaskStatus: (taskId: string, status: string, proof?: string) =>
      ipcRenderer.invoke('team:update-task-status', taskId, status, proof),
    addNote: (taskId: string, note: string) => ipcRenderer.invoke('team:add-note', taskId, note),
    getFollowups: (date: string) => ipcRenderer.invoke('team:get-followups', date),
    addFollowup: (data: unknown) => ipcRenderer.invoke('team:add-followup', data),
    completeFollowup: (id: string) => ipcRenderer.invoke('team:complete-followup', id),
    getOverdue: () => ipcRenderer.invoke('team:get-overdue'),
  },
  overlay: {
    openMain: () => ipcRenderer.invoke('overlay:open-main'),
    hide: () => ipcRenderer.invoke('overlay:hide'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (data: unknown) => void) => {
      ipcRenderer.on('updater:status', (_event, data) => callback(data))
    },
    removeStatusListener: () => {
      ipcRenderer.removeAllListeners('updater:status')
    },
  },
  electronAPI: {
    captureReport: (rect?: unknown) => ipcRenderer.invoke('capture-report', rect),
  },
})
