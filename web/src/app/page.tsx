import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, type Plan } from '@/lib/data'
import ThemeToggle from '@/components/ThemeToggle'
import './landing.css'

export const dynamic = 'force-dynamic'

const LOOP = [
  ['Monthly goals', '5 fixed goals'],
  ['AI subgoals', 'concrete deliverables'],
  ['Daily tasks', 'fit your real hours'],
  ['Lock the plan', 'no mid-day reshuffle'],
  ['Prove it', 'comment or link'],
  ['Score the day', 'weighted by effort'],
  ['Honest feedback', 'then repeat'],
]

const FEATURES = [
  ['01 · GOALS', 'Five goals. No more.', 'Three business, one personal, one family. A fixed structure keeps a founder focused on what actually moves the month.'],
  ['02 · PLAN', 'Tasks sized to your day', 'AI breaks goals into subgoals, then into daily tasks scoped to your real working hours. Between 5 and 15 a day, your call.'],
  ['03 · LOCK', 'Plan lock', 'Once you lock the plan, tasks freeze. Replan once a day if you must, carry over at most two. Prioritization is forced, not suggested.'],
  ['04 · PROOF', 'Done means proven', 'Completion needs evidence, a comment or a link. Claims without proof do not count toward your score.'],
  ['05 · SCORE', 'Execution score', 'Your day is scored and weighted by effort, so one heavy win outweighs three easy ticks. Then comes direct, unsoftened AI feedback.'],
  ['06 · FOCUS', 'Always-on-top overlay', 'A small live panel keeps today’s task status in view while you work, with hourly nudges so the day does not slip.'],
  ['07 · REPORTS', 'Daily to yearly reports', 'Export a daily report as an image. Zoom out to weekly, monthly and yearly views to see the real pattern.'],
  ['08 · ANALYTICS', 'AI pattern diagnosis', 'Charts show score trends, misses by effort and time slot, and recurring skips. The AI names the pattern you keep repeating.'],
  ['09 · YOUR AI', 'Bring your own model', 'Works with OpenAI, Anthropic, OpenRouter, or Ollama running locally, for free and private.'],
]

export default async function Home() {
  const supabase = createClient()
  const [{ data: plans }, { data: userData }] = await Promise.all([
    supabase.from('plans').select('*').eq('is_active', true).order('sort_order'),
    supabase.auth.getUser(),
  ])
  const planList = (plans ?? []) as Plan[]
  const popular = planList.length === 3 ? 1 : -1
  const signedIn = Boolean(userData.user)

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link href="/" className="lp-brand">
            <i /> EXECD
          </Link>
          <nav className="lp-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#teams">Teams</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="lp-tools">
            <ThemeToggle />
            <Link className="lp-btn solid" href={signedIn ? '/dashboard' : '/login'}>
              {signedIn ? 'Open dashboard' : 'Login'}
            </Link>
          </div>
        </div>
      </header>

      <div className="lp-wrap">
        <section className="lp-hero">
          <div>
            <div className="lp-kicker">Execution enforcement for founders</div>
            <h1>
              Not a task manager. <em>An execution system.</em>
            </h1>
            <p className="lp-lede">
              Execd turns your monthly goals into a daily plan, locks it, demands proof, and scores
              the day. Then it tells you the truth about what you missed.
            </p>
            <div className="lp-cta">
              <Link className="lp-btn blue" href={signedIn ? '/dashboard' : '/login'}>
                {signedIn ? 'Open dashboard' : 'Login to your workspace'}
              </Link>
              <a className="lp-btn" href="#pricing">
                See pricing
              </a>
            </div>
            <div className="lp-fine">Local-first desktop app · Windows · macOS · Linux</div>
          </div>

          <div className="lp-mock" aria-hidden="true">
            <div className="lp-mock-bar">
              <span />
              <span />
              <span />
              <b>EXECD</b>
            </div>
            <div className="lp-mock-body">
              <div className="lp-mock-head">
                <strong>Today</strong>
                <span className="lp-lock">PLAN LOCKED</span>
              </div>
              <div className="lp-task">
                <div className="lp-task-row">
                  <p>Close the pricing proposal for Acme</p>
                  <span className="lp-chip done">done</span>
                </div>
                <div className="lp-proof">
                  <b>proof</b> docs.google.com/proposal-acme
                </div>
              </div>
              <div className="lp-task">
                <div className="lp-task-row">
                  <p>Record onboarding walkthrough</p>
                  <span className="lp-chip heavy">heavy</span>
                </div>
                <div className="lp-proof">in progress · 2h block</div>
              </div>
              <div className="lp-task">
                <div className="lp-task-row">
                  <p>Follow up with 5 warm leads</p>
                  <span className="lp-chip open">open</span>
                </div>
                <div className="lp-proof">carry-over 1 of 2</div>
              </div>
              <div className="lp-score">
                <div className="n">78%</div>
                <div style={{ flex: 1 }}>
                  <small>EXECUTION SCORE · WEIGHTED BY EFFORT</small>
                  <div className="bar" style={{ marginTop: 6 }}>
                    <i />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-loop" id="how">
          <ol>
            {LOOP.map(([title, sub]) => (
              <li key={title}>
                {title}
                <span>{sub}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-sec">
          <div className="lp-label">Why Execd</div>
          <h2>Task managers store intentions. Execd enforces them.</h2>
          <p className="sub">
            A to-do list lets you reshuffle, postpone and quietly forget. Execd removes the escape
            hatches.
          </p>
          <div className="lp-vs">
            <div className="them">
              <h3>A task manager</h3>
              <ul>
                <li>Endless lists you re-sort every morning</li>
                <li>“Done” is just a checkbox</li>
                <li>Misses disappear without a trace</li>
                <li>Feedback is a streak counter</li>
              </ul>
            </div>
            <div className="us">
              <h3>Execd</h3>
              <ul>
                <li>A locked daily plan sized to your real hours</li>
                <li>Done needs proof: a comment or a link</li>
                <li>Every miss is scored, logged and analysed</li>
                <li>Blunt AI feedback on the pattern behind your day</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-sec" id="features">
          <div className="lp-label">Features</div>
          <h2>Everything the loop needs. Nothing it doesn’t.</h2>
          <p className="sub">
            Built for a founder running a business, a life and a family on the same calendar.
          </p>
          <div className="lp-feat">
            {FEATURES.map(([tag, title, body]) => (
              <div key={tag}>
                <span className="tag">{tag}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-sec" id="teams">
          <div className="lp-team">
            <div>
              <div className="lp-label">For teams</div>
              <h2>Run your team on the same standard.</h2>
              <p className="sub" style={{ marginBottom: 20 }}>
                Invite managers and members, assign weekly work, and see where it stands from the
                web console.
              </p>
              <ul>
                <li>
                  <b>Assign and track.</b> Give each member weekly tasks and watch progress by
                  person, not by guesswork.
                </li>
                <li>
                  <b>Review before it counts.</b> Turn on manager approval so work is only done
                  once it is approved, or sent back with notes.
                </li>
                <li>
                  <b>Always in sync.</b> Changes appear live across your team, and the desktop app
                  keeps working offline and catches up when you reconnect.
                </li>
                <li>
                  <b>Full history.</b> Every status change and review note is kept as an audit
                  trail.
                </li>
              </ul>
              <div className="lp-langs">
                <span>English</span>
                <span>ગુજરાતી</span>
                <span>हिन्दी</span>
              </div>
            </div>
            <div className="lp-flow" aria-hidden="true">
              <div className="step a">
                Assigned: Prepare Q4 sales deck <em>pending</em>
              </div>
              <div className="step b">
                Submitted with proof link <em>awaiting review</em>
              </div>
              <div className="step c">
                Manager: “Add churn numbers” <em>needs changes</em>
              </div>
              <div className="step d">
                Resubmitted and approved <em>completed</em>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec" id="pricing">
          <div className="lp-label">Pricing</div>
          <h2>Simple plans that grow with your team.</h2>
          <p className="sub">Start free. Move up when your team does.</p>
          <div className="lp-plans">
            {planList.map((p, i) => (
              <div className={`lp-plan${i === popular ? ' pop' : ''}`} key={p.id}>
                {i === popular && <span className="badge-pop">MOST POPULAR</span>}
                <h3>{p.name}</h3>
                <p className="desc">{p.description}</p>
                <div className="price">
                  {formatPrice(p.price_monthly, p.currency)} <small>/ month</small>
                </div>
                <div className="yr">
                  {p.price_yearly > 0
                    ? `or ${formatPrice(p.price_yearly, p.currency)} billed yearly`
                    : ''}
                </div>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  className={`lp-btn ${i === popular ? 'blue' : ''}`}
                  href={signedIn ? '/dashboard' : '/login'}
                  style={{ justifyContent: 'center' }}
                >
                  {signedIn ? 'Go to dashboard' : `Get ${p.name}`}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <h2>Stop planning. Start proving.</h2>
          <p>Lock today’s plan, ship the work, show the proof. Your score is waiting.</p>
          <Link className="lp-btn blue" href={signedIn ? '/dashboard' : '/login'}>
            {signedIn ? 'Open dashboard' : 'Login to Execd'}
          </Link>
        </section>

        <footer className="lp-foot">
          <span>© {new Date().getFullYear()} Execd</span>
          <span>Execution enforcement for founders</span>
        </footer>
      </div>
    </div>
  )
}
