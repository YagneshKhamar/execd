import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'

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

  const apiKey = config.api_key_encrypted
  const provider = config.ai_provider

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
    return data.choices[0].message.content
  } else {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
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
    return data.content[0].text
  }
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
    const systemPrompt = `You are an execution coach. Generate subgoals for monthly goals.
Respond ONLY with valid JSON array in this exact format:
[{"title": "string", "priority": "high"|"medium"|"low"}]
Each subgoal must be completable in 1-2 weeks and map to a concrete output.
Generate exactly 5 subgoals. No explanation, no markdown, just the JSON array.`

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
      },
    ) => {
      const systemPrompt = `You are an execution coach generating daily tasks.
Respond ONLY with valid JSON array in this exact format:
[{"title":"string","effort":"light"|"medium"|"heavy","proof_type":"none"|"comment"|"link","subgoal_id":"string","scheduled_time_slot":"morning"|"afternoon"|"anytime"}]
Rules:
- light = 30min max, medium = 60min max, heavy = 120min max
- Never generate vague tasks. "Work on X" is invalid. "Write intro section of X" is valid.
- proof_type: none for internal work, comment for built/wrote/fixed, link for posted/published/submitted
- No explanation, no markdown, just the JSON array.`

      const prompt = `Available time: ${context.availableMinutes} minutes (${context.workingStart} - ${context.workingEnd})
Active subgoals: ${JSON.stringify(context.subgoals)}
Carry-over tasks: ${JSON.stringify(context.carryOvers)}
Behavior flags: ${context.behaviorFlags.join(', ') || 'none'}
Generate 3-5 tasks. Max 2 carry-overs. Prioritize high-priority subgoals.`

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
        const raw = await generateEndOfDayFeedback(context)
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
}
