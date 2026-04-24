import { ipcMain, safeStorage } from 'electron'
import { getDatabase } from '../db/database'

// ─── AI Configuration ─────────────────────────────────────────────────────
// Change these two lines to switch providers/models. No other changes needed.
const AI_PROVIDER: 'openai' | 'anthropic' | 'ollama' | 'openrouter' = 'openai'
const AI_MODEL = 'gpt-4o-mini'
// Models: openai → gpt-4o-mini | gpt-4o | gpt-4-turbo
//         anthropic → claude-haiku-4-5-20251001 | claude-sonnet-4-5
//         ollama → llama3 | mistral | any local model
//         openrouter → nvidia/nemotron-3-super-120b-a12b:free | any OR model
// ──────────────────────────────────────────────────────────────────────────

function getBusinessContext(): string {
  try {
    const db = getDatabase()
    const profile = db.prepare('SELECT * FROM business_profile WHERE id = 1').get() as
      | Record<string, unknown>
      | undefined
    if (!profile) return ''

    const activities = (() => {
      try {
        return JSON.parse(String(profile.primary_activities || '[]')) as string[]
      } catch {
        return [] as string[]
      }
    })()

    const businessType = String(profile.business_type || '').startsWith('other:')
      ? String(profile.business_type).slice(6)
      : String(profile.business_type || '')

    const parts = [
      profile.business_name ? `Business: ${String(profile.business_name)}` : '',
      businessType ? `Type: ${businessType}` : '',
      `Team size: ${String(profile.team_size || 1)}`,
      activities.length > 0 ? `Primary activities: ${activities.join(', ')}` : '',
      profile.monthly_sales_target
        ? `Yearly sales target: ₹${String(profile.monthly_sales_target)}`
        : '',
    ].filter(Boolean)

    return parts.length > 0 ? `\n\nBusiness context:\n${parts.join('\n')}` : ''
  } catch {
    return ''
  }
}

interface GoalValidationResult {
  valid: boolean
  note: string
}

interface SubgoalSuggestion {
  title: string
  priority: 'high' | 'medium' | 'low'
}

async function callAI(prompt: string, systemPrompt: string): Promise<string> {
  const db = getDatabase()
  const config = db.prepare('SELECT * FROM config WHERE id = 1').get() as
    | Record<string, string>
    | undefined

  if (!config) throw new Error('No config found. Complete setup first.')

  const provider = AI_PROVIDER
  const encryptedApiKey = config.api_key_encrypted as string | undefined
  const isEncrypted = Number(config.api_key_is_encrypted ?? 0) === 1
  console.log('encryptedApiKey', encryptedApiKey)
  console.log('isEncrypted', isEncrypted)
  console.log('safeStorage.isEncryptionAvailable()', safeStorage.isEncryptionAvailable())

  let apiKey = ''
  if (encryptedApiKey) {
    if (isEncrypted && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'))
    } else {
      apiKey = encryptedApiKey
    }
  }

  console.log('apiKey', apiKey)
  console.log('provider', provider)

  if (!apiKey && provider !== 'ollama') {
    throw new Error('API key is missing. Please set it in Settings.')
  }

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    })
    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
      error?: { message: string }
    }
    if (data.error) throw new Error(data.error.message)
    let raw = data.choices[0].message.content
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    return raw
  }

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = (await response.json()) as {
      content: { text: string }[]
      error?: { message: string }
    }
    if (data.error) throw new Error(data.error.message)
    let raw = data.content[0].text
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    return raw
  }

  if (provider === 'ollama') {
    const model = config.ollama_model || AI_MODEL || 'llama3'
    const baseUrl = config.ollama_base_url || 'http://localhost:11434'
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const data = (await response.json()) as {
      message: { content: string }
      error?: string
    }
    if (data.error) throw new Error(data.error)
    let raw = data.message.content
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    return raw
  }

  if (provider === 'openrouter') {
    const model = config.openrouter_model || AI_MODEL
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://execd.app',
        'X-Title': 'Execd',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    })

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
      error?: { message: string }
    }
    if (data.error) throw new Error(data.error.message)
    let raw = data.choices[0].message.content
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    return raw
  }

  throw new Error(`Unknown provider: ${provider}`)
}

export async function generateEndOfDayFeedback(context: {
  score: number
  completed: { title: string; proof_type: string }[]
  missed: { title: string }[]
  flags: string[]
  history: { date: string; score: number; missed: string[] }[]
}): Promise<string> {
  const systemPrompt = `You are an execution coach giving end-of-day feedback.
Rules:
- Never use motivational language. No "great job", "keep it up", "you're doing well".
- Name specific tasks that were skipped.
- If a pattern exists, name it explicitly.
- If score > 80%, still identify what was missed and why it matters.
- Tone: direct, honest, neutral.
- Maximum 3 sentences. No bullet points.`

  const prompt = `Execution score: ${Math.round(context.score * 100)}%
Completed: ${context.completed.map((t) => t.title).join(', ') || 'none'}
Missed: ${context.missed.map((t) => t.title).join(', ') || 'none'}
Active behavior flags: ${context.flags.join(', ') || 'none'}
Last 7 days history: ${JSON.stringify(context.history)}`

  const raw = await callAI(prompt, systemPrompt)
  return raw.trim()
}

export function registerAIHandlers(): void {
  ipcMain.handle('ai:validate-goal', async (_event, goalTitle: string) => {
    const systemPrompt = `You are an execution coach. Evaluate monthly goals.
Respond ONLY with valid JSON in this exact format: {"valid": boolean, "note": "string"}
Note must be under 20 words. No encouragement. State the problem directly if invalid.`

    const prompt = `Evaluate this monthly goal: "${goalTitle}"
Check: Is it specific? Is it actionable? Is it realistic for one month?`

    try {
      const raw = await callAI(prompt, systemPrompt)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const result = JSON.parse(cleaned) as GoalValidationResult
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('ai:generate-subgoals', async (_event, goalTitle: string, goalType: string) => {
    const businessCtx = getBusinessContext()
    const systemPrompt = `You are an execution coach. Generate subgoals for monthly goals.
Respond ONLY with valid JSON array in this exact format:
[{"title": "string", "priority": "high"|"medium"|"low"}]
Each subgoal must be completable in 1-2 weeks and map to a concrete output.
Generate exactly 5 subgoals. No explanation, no markdown, just the JSON array.${businessCtx}`

    const prompt = `Goal: "${goalTitle}" (Type: ${goalType})
Generate 5 subgoals that break this down into concrete 1-2 week deliverables.`

    try {
      const raw = await callAI(prompt, systemPrompt)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const result = JSON.parse(cleaned) as SubgoalSuggestion[]
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle(
    'ai:generate-daily-tasks',
    async (
      _event,
      context: {
        availableMinutes: number
        workingStart: string
        workingEnd: string
        subgoals: { id: string; title: string; priority: string }[]
        carryOvers: { title: string; effort: string }[]
        behaviorFlags: string[]
        maxTasks?: number
      },
    ) => {
      const businessCtx = getBusinessContext()
      const systemPrompt = `You are an execution coach generating daily tasks.
Respond ONLY with valid JSON array in this exact format:
[{"title":"string","effort":"light"|"medium"|"heavy","proof_type":"none"|"comment"|"link","subgoal_id":"string","scheduled_time_slot":"morning"|"afternoon"|"anytime"}]
Rules:
- light = 30min max, medium = 60min max, heavy = 120min max
- Never generate vague tasks. "Work on X" is invalid. "Write intro section of X" is valid.
- proof_type: none for internal work, comment for built/wrote/fixed, link for posted/published/submitted
- Generate tasks that are specific and relevant to the business context provided.
- No explanation, no markdown, just the JSON array.${businessCtx}`

      const prompt = `Available time: ${context.availableMinutes} minutes (${context.workingStart} - ${context.workingEnd})
Active subgoals: ${JSON.stringify(context.subgoals)}
Carry-over tasks: ${JSON.stringify(context.carryOvers)}
Behavior flags: ${context.behaviorFlags.join(', ') || 'none'}
Generate ${context.maxTasks || 5} tasks (minimum 3, maximum ${context.maxTasks || 5}).
Max 2 carry-overs. Prioritize high-priority subgoals.`

      try {
        const raw = await callAI(prompt, systemPrompt)
        const cleaned = raw.replace(/```json|```/g, '').trim()
        const result = JSON.parse(cleaned)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },
  )

  ipcMain.handle(
    'ai:end-of-day-feedback',
    async (
      _event,
      context: {
        score: number
        completed: { title: string; proof_type: string }[]
        missed: { title: string }[]
        flags: string[]
        history: { date: string; score: number; missed: string[] }[]
      },
    ) => {
      try {
        const businessCtx = getBusinessContext()
        const systemPrompt = `You are an execution coach giving end-of-day feedback.
Rules:
- Never use motivational language. No "great job", "keep it up", "you're doing well".
- Name specific tasks that were skipped.
- If a pattern exists, name it explicitly.
- If score > 80%, still identify what was missed and why it matters.
- Tone: direct, honest, neutral.
- Maximum 3 sentences. No bullet points.${businessCtx}`

        const prompt = `Execution score: ${Math.round(context.score * 100)}%
Completed: ${context.completed.map((t) => t.title).join(', ') || 'none'}
Missed: ${context.missed.map((t) => t.title).join(', ') || 'none'}
Active behavior flags: ${context.flags.join(', ') || 'none'}
Last 7 days history: ${JSON.stringify(context.history)}`

        const raw = await callAI(prompt, systemPrompt)
        return { success: true, data: raw }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },
  )

  ipcMain.handle(
    'ai:suggest-goal-fix',
    async (_event, goalTitle: string, validationNote: string) => {
      const systemPrompt = `You are an execution coach. Suggest an improved version of a monthly goal.
Respond ONLY with the improved goal text as a plain string. No explanation, no JSON, no quotes.
Keep it under 120 characters. Make it specific, actionable, and realistic for one month.`

      const prompt = `Original goal: "${goalTitle}"
Problem: ${validationNote}
Write an improved version that fixes the problem.`

      try {
        const raw = await callAI(prompt, systemPrompt)
        const cleaned = raw.trim().replace(/^["']|["']$/g, '')
        return { success: true, data: cleaned }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },
  )

  ipcMain.handle(
    'ai:analytics-insight',
    async (
      _event,
      context: {
        avgScore: number
        trend: string
        topMissedEffort: string
        topMissedSlot: string
        carryRate: number
        days: number
      },
    ) => {
      const systemPrompt = `You are a brutal execution analyst.
Respond ONLY with valid JSON: {"heading": "string", "body": "string"}
heading: 4-6 words max. A sharp, specific label that names the dominant pattern.
Not a question. Not motivational. A diagnosis. Examples:
"Afternoon execution is collapsing", "Heavy tasks are being avoided",
"Carry-overs are becoming a habit", "Consistent but light work only".
body: 1-2 sentences max. Brutally honest. Reference specific numbers.
No encouragement. No hedging. State what is actually happening.`

      const prompt = `Last ${context.days} days:
Avg execution score: ${Math.round(context.avgScore * 100)}%
Score trend: ${context.trend}
Most missed effort level: ${context.topMissedEffort}
Most missed time slot: ${context.topMissedSlot}
Carry-over rate: ${Math.round(context.carryRate * 100)}% of days had carry-overs
Generate the insight JSON.`

      try {
        const raw = await callAI(prompt, systemPrompt)
        const cleaned = raw.replace(/```json|```/g, '').trim()
        return { success: true, data: JSON.parse(cleaned) }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },
  )

  ipcMain.handle(
    'ai:generate-monthly-targets',
    async (
      _event,
      context: {
        yearlyTarget: number
        collectionTarget: number | null
        businessType: string
        fiscalYearStart: number
        year: number
      },
    ) => {
      const systemPrompt = `You are a business planning assistant.
Generate realistic monthly sales targets based on business type and seasonal patterns.
Respond ONLY with valid JSON array, no markdown, no explanation:
[{"month": "YYYY-MM", "sales_target": number, "collection_target": number}]
Rules:
- Generate exactly 12 months starting from the fiscal year start month
- Total of all sales_target values must equal exactly the yearlyTarget provided
- Distribute based on realistic seasonal patterns for the business type
- For textile/trading businesses in India:
  Sep-Oct-Nov are peak (Navratri, Diwali, wedding season)
  Dec-Jan are high (winter wedding season)
  Apr-May-Jun are slow
  Feb-Mar are slowest (FY closing)
- For other business types, distribute more evenly with slight Q4 peak
- collection_target per month = roughly 85-90% of that month's sales_target
  (collections lag sales slightly)
- If collectionTarget is provided, total collection must equal collectionTarget
- Round all values to nearest 1000`

      const prompt = `Business type: ${context.businessType}
Yearly sales target: ₹${context.yearlyTarget}
Yearly collection target: ${context.collectionTarget ? '₹' + context.collectionTarget : 'not set'}
Financial year starts: month ${context.fiscalYearStart} (1=Jan, 4=Apr)
Current year: ${context.year}
Generate 12 monthly targets starting from ${context.fiscalYearStart}/${context.year}.
For months after December, use year ${context.year + 1}.`

      try {
        const raw = await callAI(prompt, systemPrompt)
        const cleaned = raw.replace(/```json|```/g, '').trim()
        const result = JSON.parse(cleaned)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },
  )
}
