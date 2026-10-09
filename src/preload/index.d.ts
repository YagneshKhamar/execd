export interface AuthState {
  configured: boolean
  signedIn: boolean
  user: { id: string; email: string; displayName: string } | null
  organization: {
    id: string
    name: string
    role: 'owner' | 'manager' | 'member'
    requireApproval: boolean
  } | null
  error?: string
}

export type TeamSyncStatus = 'local' | 'pending' | 'unlinked' | 'synced' | 'failed'

export interface SyncErrorEntry {
  entityType: 'team_task' | 'my_task'
  entityId: string
  title: string
  status: 'failed' | 'waiting'
  error: string
  retryCount: number
  updatedAt: string
}

export interface TaskHistoryEntry {
  action: string
  type: string
  note: string
  actor: string
  actorKind?: 'you' | 'someone'
  at: string
}

export interface SyncInfo {
  enabled: boolean
  disabledByUser: boolean
  role: 'owner' | 'manager' | 'member' | null
  online: boolean
  realtime: 'disabled' | 'connecting' | 'connected' | 'disconnected'
  syncing: boolean
  pending: number
  waiting: number
  failed: number
  lastSyncedAt: string | null
  lastError: string | null
}

export interface TeamWriteResult {
  success: boolean
  id?: string
  sync?: TeamSyncStatus
  syncError?: string
}

export interface AppNotification {
  id: string
  type:
    | 'task_assigned'
    | 'task_due_soon'
    | 'task_overdue'
    | 'task_completed'
    | 'task_blocked'
    | 'task_approved'
    | 'task_rejected'
    | 'invitation_accepted'
  task_id: string | null
  title: string
  body: string
  read_at: string | null
  created_at: string
}

export interface MigrationPreview {
  eligible: boolean
  unlinkedMembersWithEmail: number
  unlinkedMembersWithoutEmail: number
  linkedMembers: number
  legacyTasks: number
}

export interface MigrationResult {
  success: boolean
  error?: string
  invitationsSent: number
  invitationsSkippedNoEmail: number
  invitationsFailed: { name: string; error: string }[]
  tasksQueued: number
}

export interface MyTask {
  id: string
  title: string
  description: string
  effort: string
  status: string
  due_date: string
  week_start: string
  proof_value: string | null
  notes: string
  completed_at: string | null
  version: number | null
  sync_status: TeamSyncStatus
  sync_error: string | null
}

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
      businessDescription?: string
      fiscalYearStart: number
      year: number
      currentMonth?: string
      daysRemainingInCurrentMonth?: number
      salesTargetUnit?: 'amount' | 'units'
      salesTargetUnitLabel?: string
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
    saveTasks: (tasks: unknown, replace?: boolean) => Promise<{ success: boolean }>
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
    getHistory: (filters: { month?: string; date?: string; status?: string }) => Promise<
      {
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
      }[]
    >
    updateProof: (taskId: string, proof: string) => Promise<{ success: boolean }>
    replan: (date: string) => Promise<{ success: boolean; reason?: string }>
    markReplanUsed: (date: string) => Promise<{ success: boolean }>
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
      fy_label: string
      fy_start: number
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
    missedPatterns: (
      fromDate: string,
      toDate: string,
      minCount: number,
    ) => Promise<{ title: string; miss_count: number }[]>
  }
  sales: {
    getMonthlyTargets: (filters: { fiscalYearStart: number; year: number }) => Promise<
      {
        year_month: string
        sales_target: number
        collection_target: number
      }[]
    >
    saveMonthlyTargets: (
      targets: {
        year_month: string
        sales_target: number
        collection_target: number
      }[],
    ) => Promise<{ success: boolean }>
    getDailySales: (filters: { month: string }) => Promise<
      {
        date: string
        sales_amount: number
        collection_amount: number
        notes: string
      }[]
    >
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
    getYearlySummary: (filters: { fiscalYearStart: number; year: number }) => Promise<
      {
        year_month: string
        sales_target: number
        collection_target: number
        sales_done: number
        collection_done: number
      }[]
    >
  }
  business: {
    get: () => Promise<{
      business_name: string
      business_type: string
      business_description: string
      sales_target_unit?: string
      sales_target_unit_label?: string
      monthly_sales_target: number | null
      collection_target: number | null
      primary_activities: string[]
      departments: string[]
      team_size: number
      language: string
    } | null>
    save: (data: {
      business_name: string
      business_type: string
      business_description?: string
      sales_target_unit?: string
      sales_target_unit_label?: string
      monthly_sales_target?: number | null
      collection_target?: number | null
      primary_activities: string[]
      departments?: string[]
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
    addTask: (data: unknown) => Promise<TeamWriteResult>
    updateTaskStatus: (
      taskId: string,
      status: string,
      proof?: string,
      reviewNote?: string,
    ) => Promise<TeamWriteResult>
    addNote: (taskId: string, note: string) => Promise<TeamWriteResult>
    getFollowups: (date: string) => Promise<unknown[]>
    addFollowup: (data: unknown) => Promise<{ success: boolean; id?: string }>
    completeFollowup: (id: string) => Promise<{ success: boolean; id?: string }>
    getOverdue: () => Promise<unknown[]>
    taskHistory: (
      taskId: string,
    ) => Promise<{ success: boolean; history?: TaskHistoryEntry[]; error?: string }>
    myTaskHistory: (
      taskId: string,
    ) => Promise<{ success: boolean; history?: TaskHistoryEntry[]; error?: string }>
    syncNow: () => Promise<SyncInfo>
    syncStatus: () => Promise<SyncInfo>
    retrySync: () => Promise<SyncInfo>
    discardFailedSync: () => Promise<SyncInfo>
    syncErrors: () => Promise<SyncErrorEntry[]>
    getSyncDisabled: () => Promise<boolean>
    setSyncDisabled: (disabled: boolean) => Promise<{ success: boolean }>
    exportData: () => Promise<{ success: boolean; json: string; filename: string }>
    myTasks: () => Promise<{ success: boolean; tasks?: MyTask[]; error?: string }>
    updateMyTask: (data: {
      taskId: string
      status: string
      proofValue?: string
    }) => Promise<{ success: boolean; error?: string }>
  }
  auth: {
    getState: () => Promise<AuthState>
    signUp: (data: {
      email: string
      password: string
      displayName: string
    }) => Promise<{ success: boolean; needsConfirmation?: boolean; error?: string }>
    signIn: (data: { email: string; password: string }) => Promise<{
      success: boolean
      error?: string
    }>
    signOut: () => Promise<{ success: boolean; error?: string }>
    createOrganization: (name: string) => Promise<{ success: boolean; id?: string; error?: string }>
    setRequireApproval: (data: {
      organizationId: string
      requireApproval: boolean
    }) => Promise<{ success: boolean; error?: string }>
  }
  invitations: {
    list: (organizationId: string) => Promise<{
      success: boolean
      error?: string
      invitations?: {
        id: string
        email: string
        role: 'manager' | 'member'
        status: 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked'
        expires_at: string
        accepted_at: string | null
        created_at: string
      }[]
      members?: {
        userId: string
        role: 'owner' | 'manager' | 'member'
        joinedAt: string
        displayName: string
        email: string
      }[]
    }>
    create: (data: {
      organizationId: string
      email: string
      role: 'manager' | 'member'
    }) => Promise<{
      success: boolean
      id?: string
      error?: string
    }>
    revoke: (invitationId: string) => Promise<{ success: boolean; error?: string }>
    getMine: () => Promise<{
      success: boolean
      error?: string
      invitations?: {
        id: string
        organizationName: string
        role: string
        invitedByName: string
        expiresAt: string
      }[]
    }>
    accept: (invitationId: string) => Promise<{ success: boolean; error?: string }>
  }
  notifications: {
    list: () => Promise<{ success: boolean; notifications?: AppNotification[]; error?: string }>
    markRead: (ids: string[] | null) => Promise<{ success: boolean; error?: string }>
  }
  migration: {
    preview: () => Promise<MigrationPreview>
    run: () => Promise<MigrationResult>
  }
  overlay: {
    openMain: () => Promise<void>
    hide: () => Promise<void>
  }
  autoEod: {
    onComplete: (
      callback: (data: {
        score: number
        completed: number
        missed: number
        missedTasks: string[]
        feedback: string
      }) => void,
    ) => void
    removeListener: () => void
  }
  updater: {
    check: () => Promise<void>
    download: () => Promise<void>
    install: () => Promise<void>
    onStatus: (
      callback: (data: {
        status: 'checking' | 'available' | 'latest' | 'downloading' | 'ready' | 'error'
        version?: string
        percent?: number
        message?: string
      }) => void,
    ) => void
    removeStatusListener: () => void
  }
  electronAPI: {
    captureReport: (rect?: {
      x: number
      y: number
      width: number
      height: number
    }) => Promise<string>
  }
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
