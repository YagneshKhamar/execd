# Supabase Implementation Plan for Execd

## Target architecture

```text
┌──────────────────────────┐
│ Manager Electron app     │
│                          │
│ React UI                 │
│ Local SQLite             │
│ Sync queue               │
└────────────┬─────────────┘
             │ HTTPS + Realtime
             ▼
┌────────────────────────────────────┐
│ Supabase                            │
│                                    │
│ Auth                               │
│ PostgreSQL                         │
│ Row Level Security                 │
│ Realtime                           │
│ Storage                            │
└────────────┬───────────────────────┘
             │ HTTPS + Realtime
             ▼
┌──────────────────────────┐
│ Member Electron app      │
│                          │
│ React UI                 │
│ Local SQLite             │
│ Sync queue               │
└──────────────────────────┘
```

The key rule is:

```text
Supabase PostgreSQL = shared source of truth
SQLite              = local cache and offline store
Realtime            = fast live updates
Sync queue          = reliable recovery after disconnects
```

The current local team functionality is concentrated in [Team.tsx](src/renderer/src/pages/Team.tsx), [team.ipc.ts](src/main/ipc/team.ipc.ts), [database.ts](src/main/db/database.ts), and [preload/index.ts](src/preload/index.ts).

---

## Phase 0 — Define product and security decisions

**Goal:** Confirm the rules before creating the backend.

### Decisions

- One Execd installation can belong to one organization initially.
- A user can belong to one or more organizations later.
- Roles:
  - `owner`
  - `manager`
  - `member`
- Managers can assign tasks.
- Members can view and update only tasks assigned to them.
- Managers can view all team tasks.
- Completion requires optional proof, comment, or link.
- A manager may approve or reject completion later if required.

### Deliverables

- Authentication flow decision
- Organization/team permission model
- Offline behavior rules
- Conflict resolution policy
- Data retention policy for task logs

### Recommended initial policy

```text
Last valid server update wins
```

For task status, a stricter event-based model can be added later.

---

## Phase 1 — Create and configure Supabase

**Goal:** Establish the backend project without changing the current app behavior.

### Work

1. Create a Supabase project.
2. Configure:
   - Project URL
   - Publishable/anonymous key
   - Auth settings
   - Email redirect URL
   - Realtime
3. Add environment variables to the Electron build process.
4. Ensure secrets are not committed.
5. Create separate Supabase projects or environments for development and production.

### Expected configuration

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Only the publishable key should be present in the desktop client. Never embed the Supabase service-role key in Electron or renderer code.

### Acceptance criteria

- App starts without Supabase configured during the transition period.
- Development and production use separate projects.
- No credentials are committed to Git.

---

## Phase 2 — Design and create the database schema

**Goal:** Create the shared relational model.

### Core tables

```text
organizations
├── id
├── name
├── created_by
└── created_at

organization_members
├── organization_id
├── user_id
├── role
├── status
└── joined_at

invitations
├── id
├── organization_id
├── email
├── role
├── invited_by
├── status
├── expires_at
├── accepted_at
└── created_at

team_tasks
├── id
├── organization_id
├── assigned_to
├── assigned_by
├── title
├── description
├── effort
├── status
├── due_date
├── week_start
├── proof_value
├── notes
├── created_at
├── updated_at
├── completed_at
└── version

team_task_events
├── id
├── organization_id
├── task_id
├── actor_id
├── event_type
├── payload
├── created_at
└── client_event_id
```

Optional later tables:

```text
task_comments
task_attachments
notifications
push_tokens
sync_cursors
```

### Important constraints

- Use UUIDs for server IDs.
- Add foreign keys.
- Add indexes for:
  - `organization_id`
  - `assigned_to`
  - `status`
  - `due_date`
  - `updated_at`
- Add a unique constraint for one active membership per user and organization.
- Add a unique `client_event_id` to prevent duplicate offline events.

### Acceptance criteria

- Schema can be applied repeatedly through migrations.
- Duplicate events are rejected safely.
- Task history is auditable.

---

## Phase 3 — Implement authentication and organization setup

**Goal:** Give every participant a real identity.

### Manager flow

```text
Manager opens Execd
        │
        ▼
Sign up / sign in
        │
        ▼
Create organization
        │
        ▼
Become organization owner
```

### Member flow

```text
Member receives invitation
        │
        ▼
Opens invitation link
        │
        ▼
Creates account or signs in
        │
        ▼
Joins organization
        │
        ▼
Sees assigned tasks
```

### Work

- Add auth state management.
- Add sign-in/sign-out.
- Store the current user ID locally.
- Create an organization on first setup.
- Replace local-only member identity with `user_id`.
- Keep display name, role, and email in the profile/membership model.

### UI changes

Add:

- Login page
- Registration page
- Logout action
- Current user indicator
- Organization/team selector if needed later

### Acceptance criteria

- A user can create an account.
- A user can sign in from another machine.
- The same user sees the same organization membership.
- No task data is visible before authentication.

---

## Phase 4 — Add Row Level Security

**Goal:** Ensure users can only access authorized data.

This phase must be completed before exposing production data.

### Access rules

#### Organizations

```text
Owner/manager:
  view and update organization

Member:
  view organization if active member
```

#### Organization members

```text
Manager:
  view and manage members

Member:
  view limited team information
```

#### Tasks

```text
Manager:
  view, create, update all organization tasks

Member:
  view tasks assigned to them
  update status/proof/notes of assigned tasks
```

#### Events

```text
Organization members:
  read events belonging to their organization

Authenticated users:
  insert events only as themselves
```

Never rely only on frontend checks. Authorization must be enforced using Supabase RLS policies.

### Acceptance criteria

- A member cannot read another organization’s tasks.
- A member cannot assign tasks.
- A member cannot modify someone else’s task.
- A removed member loses access.
- Anonymous requests cannot access team data.

---

## Phase 5 — Implement invitation management

**Goal:** Convert the existing “add member” behavior into a real invitation flow.

The current email field in [Team.tsx](src/renderer/src/pages/Team.tsx) is only stored locally. It should become an invitation workflow.

### Flow

```text
Manager enters email and role
        │
        ▼
Create invitation record
        │
        ▼
Send invitation email
        │
        ▼
Invitation status = sent
        │
        ▼
Member accepts link
        │
        ▼
Create/identify Supabase user
        │
        ▼
Create organization membership
        │
        ▼
Invitation status = accepted
```

### Invitation states

```text
pending
sent
accepted
expired
revoked
```

### UI additions

- Invite member button
- Invitation status
- Resend invitation
- Revoke invitation
- Expiry date
- Accepted date
- Pending invitations list

### Email delivery

Use a configured SMTP/provider for production delivery. Do not depend solely on development email behavior.

### Acceptance criteria

- Manager can invite an email address.
- Duplicate active invitations are prevented.
- Invitation expires safely.
- Accepted users appear in the team.
- Reinviting an expired or revoked invitation works.

---

## Phase 6 — Migrate team task operations to Supabase

**Goal:** Make Supabase the shared task source while preserving existing local behavior.

### Migration strategy

Use a dual-write transition initially:

```text
Create/update task
        │
        ├── Write local SQLite
        └── Write Supabase
```

After reliability is proven:

```text
Create/update task
        │
        └── Write SQLite + outbox
                  │
                  ▼
              Sync worker
                  │
                  ▼
              Supabase
```

### Required changes

- Add a Supabase data access layer.
- Stop calling Supabase directly from UI components.
- Update IPC methods in [team.ipc.ts](src/main/ipc/team.ipc.ts).
- Add server IDs and synchronization metadata to local team tables.
- Preserve existing local task display while remote support is introduced.

### Acceptance criteria

- Manager-created tasks appear in Supabase.
- Member-created status updates reach Supabase.
- Existing local task UI continues to work.
- Failed remote writes are visible rather than silently ignored.

---

## Phase 7 — Build the offline sync queue

**Goal:** Make task updates reliable when the device is offline.

### Local tables

```text
sync_outbox
├── id
├── client_event_id
├── entity_type
├── entity_id
├── event_type
├── payload
├── created_at
├── retry_count
├── last_error
└── synced_at

sync_state
├── scope
├── last_server_cursor
└── updated_at
```

### Offline behavior

```text
User changes task offline
        │
        ├── Update local SQLite immediately
        ├── Add event to sync_outbox
        └── Show "Pending sync"
```

When connected:

```text
Upload pending events
        │
        ▼
Download changes after cursor
        │
        ▼
Apply changes to local SQLite
        │
        ▼
Mark events as synced
```

### Retry policy

Use bounded retries with visible failure state:

```text
Immediate retry
Then: 5 seconds
Then: 30 seconds
Then: 5 minutes
```

Do not silently discard failed updates.

### Acceptance criteria

- Offline task status changes remain visible locally.
- Reconnection uploads pending changes.
- Duplicate uploads do not create duplicate task events.
- Sync failures are visible to the user.
- App restart does not lose pending updates.

---

## Phase 8 — Add realtime task updates

**Goal:** Make assignment and completion appear live.

### Realtime subscriptions

Subscribe by organization:

```text
organization_id = currentOrganizationId
```

Events:

```text
task assigned
task updated
task completed
task blocked
proof submitted
comment added
member joined
```

### Example flow

```text
Member completes task
        │
        ▼
Update local SQLite
        │
        ▼
Write Supabase task/event
        │
        ▼
Supabase Realtime broadcast
        │
        ▼
Manager receives event
        │
        ▼
Manager updates local SQLite
        │
        ▼
Team page refreshes
```

Realtime must be treated as an optimization. The app must still perform a catch-up sync after reconnecting.

### UI additions

- “Live” connection indicator
- Last synchronized time
- “Syncing…” state
- “Offline” state
- Task status update without manual refresh
- Notification when a member completes a task

### Acceptance criteria

- Assignment appears on the member app without refresh.
- Completion appears on the manager app without refresh.
- Realtime reconnects after network interruption.
- Missed events are recovered by normal sync.

---

## Phase 9 — Add notifications and task inbox

**Goal:** Ensure assigned users know about their tasks.

### In-app notifications

Create a `notifications` table:

```text
notifications
├── id
├── user_id
├── organization_id
├── type
├── task_id
├── title
├── body
├── read_at
└── created_at
```

Notification types:

```text
task_assigned
task_due_soon
task_overdue
task_completed
task_blocked
invitation_accepted
```

### Notification channels

Start with:

1. In-app notification center
2. Email invitation
3. Email task assignment
4. Desktop notification while the app is running

Add push notifications later if required.

### Acceptance criteria

- A member sees newly assigned tasks in an inbox.
- Unread count is shown.
- Notifications can be marked read.
- A closed app can still notify users through email.
- Notification failures do not prevent task creation.

---

## Phase 10 — Add proof, audit history, and manager approval

**Goal:** Make completion trustworthy.

### Completion flow

```text
Member clicks Complete
        │
        ▼
Adds comment/link/proof
        │
        ▼
Task status = completed
        │
        ▼
Completion event recorded
        │
        ▼
Manager sees proof and history
```

For stricter workflows:

```text
Member submits completion
        │
        ▼
Task status = awaiting_review
        │
        ├── Manager approves → completed
        └── Manager rejects  → needs_changes
```

### UI improvements

- Completion proof field
- Task event timeline
- Who changed the task
- When it changed
- Previous statuses
- Manager approval/rejection

This addresses the current limitation where the manager can mark tasks complete but the assigned user has no independent completion workflow.

---

## Phase 11 — Data migration and rollout

**Goal:** Move existing local team data safely.

### Migration steps

1. Detect existing local `team_members`.
2. Ask the owner to sign in.
3. Create or match organization.
4. Import members.
5. Send invitations to existing email addresses.
6. Import existing team tasks.
7. Preserve original creation dates where possible.
8. Mark imported records with a migration source.

```text
Existing SQLite
      │
      ▼
Migration preview
      │
      ▼
User confirms
      │
      ▼
Upload to Supabase
      │
      ▼
Show import report
```

### Acceptance criteria

- No existing local records are deleted.
- Import can be retried safely.
- Duplicate records are not created.
- User receives a migration summary.

---

## Phase 12 — Production hardening

**Goal:** Prepare for real users.

### Security

- Verify all RLS policies.
- Never expose the service-role key.
- Validate all IPC inputs.
- Validate task ownership server-side.
- Add rate limiting where needed.
- Protect invitation tokens.
- Expire unused invitations.
- Log security-relevant events.

### Reliability

- Add backups/export strategy.
- Add sync error reporting.
- Add migration versioning.
- Add health and connection status.
- Test app restart during sync.
- Test network interruption during task completion.

### Supabase Free-tier safeguards

- Avoid downloading all tasks repeatedly.
- Use incremental sync by `updated_at` or cursor.
- Limit attachment sizes.
- Archive old events.
- Monitor database size, storage, and egress.
- Keep development projects active or recreate them when needed.
- Plan an upgrade path before production dependency becomes critical.

---

## Suggested implementation order

```text
Phase 0  Product/security decisions
   ↓
Phase 1  Supabase setup
   ↓
Phase 2  Database schema
   ↓
Phase 3  Authentication
   ↓
Phase 4  Row Level Security
   ↓
Phase 5  Invitations
   ↓
Phase 6  Remote task operations
   ↓
Phase 7  Offline sync queue
   ↓
Phase 8  Realtime updates
   ↓
Phase 9  Notifications
   ↓
Phase 10 Proof and audit history
   ↓
Phase 11 Data migration
   ↓
Phase 12 Production hardening
```

## Recommended MVP scope

For the first usable release, implement only:

```text
Authentication
Organizations and members
Invitations
Task assignment
Member task inbox
Task completion
Supabase RLS
Realtime updates
Basic offline queue
```

Defer:

```text
File attachments
Push notifications
Manager approval workflow
Advanced reporting
Multiple organizations per user
Complex conflict resolution
```

## MVP success criteria

The implementation is ready for internal testing when this scenario works:

```text
1. Manager signs in on Computer A.
2. Manager invites a member by email.
3. Member signs in on Computer B.
4. Member accepts the invitation.
5. Manager assigns a task.
6. Member sees it without manually refreshing.
7. Member completes it with a proof comment.
8. Manager sees the completion live.
9. Both apps go offline.
10. Each user changes data locally.
11. Both reconnect.
12. Pending changes synchronize without duplication or data loss.
```
