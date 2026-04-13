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
  },
  tasks: {
    getByDate: (date: string) => ipcRenderer.invoke('tasks:get-by-date', date),
    getDayPlan: (date: string) => ipcRenderer.invoke('tasks:get-day-plan', date),
    saveDayPlan: (data: unknown) => ipcRenderer.invoke('tasks:save-day-plan', data),
    saveTasks: (tasks: unknown) => ipcRenderer.invoke('tasks:save-tasks', tasks),
    lockDayPlan: (date: string) => ipcRenderer.invoke('tasks:lock-day-plan', date),
    completeTask: (id: string, proof: string | null) =>
      ipcRenderer.invoke('tasks:complete', id, proof),
    getMissed: (date: string) => ipcRenderer.invoke('tasks:get-missed', date),
    markMissed: (date: string) => ipcRenderer.invoke('tasks:mark-missed', date),
    carryOver: (taskId: string, toDate: string) =>
      ipcRenderer.invoke('tasks:carry-over', taskId, toDate),
    drop: (taskId: string, date: string) => ipcRenderer.invoke('tasks:drop', taskId, date),
    getCarryOverCount: (date: string) => ipcRenderer.invoke('tasks:get-carryover-count', date),
    endOfDay: (date: string) => ipcRenderer.invoke('tasks:end-of-day', date),
  },
  reports: {
    week: (endDate: string) => ipcRenderer.invoke('reports:week', endDate),
  },
  overlay: {
    openMain: () => ipcRenderer.invoke('overlay:open-main'),
    hide: () => ipcRenderer.invoke('overlay:hide'),
  },
  electronAPI: {
    captureReport: () => ipcRenderer.invoke('capture-report'),
  },
})
