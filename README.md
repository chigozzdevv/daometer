# Daometer Backend

Production-style Express + MongoDB backend and worker for DAO proposal automation.

## Stack

- TypeScript
- Express
- MongoDB (Mongoose)
- Zod request validation
- JWT auth (access + refresh)
- Background worker for proposal execution jobs
- Rule-based workflow engine (conditions + actions)
- Resend email integration for workflow notifications

## Project Structure

```txt
src/
  config/
    env.config.ts
    database.config.ts
    logger.config.ts
  shared/
    errors/
    middlewares/
    utils/
    types/
  features/
    auth/
    dao/
    flow/
    proposal/
    execution-job/
    automation/
    workflow/
  routes/
  worker/
```

Each feature uses:

- `feature.model.ts`
- `feature.schema.ts`
- `feature.service.ts`
- `feature.controller.ts`
- `feature.routes.ts`

## Setup

Run all backend commands from `/Users/chigozzdev/Desktop/daometer/server`.

1. Install deps:

```bash
cd server
npm install
```

2. Create `.env` from `.env.example` and set values.

3. Start API:

```bash
npm run dev
```

4. Start worker:

```bash
npm run worker:dev
```

## Scripts

- `npm run dev` - start API with watch mode
- `npm run worker:dev` - start worker with watch mode
- `npm run seed:dev` - seed demo user/dao/flow/proposal
- `npm run type-check` - run TypeScript checks
- `npm run build` - compile to `dist` with alias rewriting
- `npm run start` - run compiled API
- `npm run worker:start` - run compiled worker

## API Prefix

Configured by `API_PREFIX` (default: `/api/v1`).

## Main Endpoints

- `POST /api/v1/auth/challenge`
- `POST /api/v1/auth/verify`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/daos`
- `POST /api/v1/daos`
- `POST /api/v1/daos/onchain-create`
- `GET /api/v1/daos/:daoId`
- `PATCH /api/v1/daos/:daoId`
- `GET /api/v1/flows`
- `POST /api/v1/flows`
- `GET /api/v1/flows/:flowId`
- `PATCH /api/v1/flows/:flowId`
- `POST /api/v1/flows/compile-inline`
- `POST /api/v1/flows/:flowId/compile`
- `POST /api/v1/flows/:flowId/publish`
- `POST /api/v1/proposals`
- `GET /api/v1/proposals/dao/:daoId`
- `GET /api/v1/proposals/:proposalId`
- `PATCH /api/v1/proposals/:proposalId/state`
- `PATCH /api/v1/proposals/:proposalId/onchain-execution`
- `POST /api/v1/proposals/:proposalId/onchain-create`
- `POST /api/v1/proposals/:proposalId/onchain-sync`
- `POST /api/v1/proposals/:proposalId/manual-approval`
- `GET /api/v1/execution-jobs`
- `POST /api/v1/execution-jobs/schedule/:proposalId`
- `POST /api/v1/execution-jobs/:executionJobId/retry`
- `POST /api/v1/automation/sync`
- `POST /api/v1/automation/process-next`
- `GET /api/v1/workflows`
- `POST /api/v1/workflows`
- `GET /api/v1/workflows/:workflowRuleId`
- `PATCH /api/v1/workflows/:workflowRuleId`
- `GET /api/v1/workflows/:workflowRuleId/events`
- `POST /api/v1/workflows/evaluate`

`execution-jobs/*` and `automation/*` are admin-only operations. Workflow CRUD operations require DAO management permissions.

## Worker Behavior

On each tick, the worker:

1. Releases expired job locks
2. Syncs proposal states from onchain (when configured)
3. Evaluates workflow rules and executes matching actions
4. Syncs eligible succeeded proposals into execution jobs
5. Claims one job with distributed lock semantics
6. Executes, reschedules, or fails the job based on DAO policy and proposal state

Onchain execution requires:

- `WORKER_EXECUTOR_SECRET_KEY` configured
- `proposal.onchainExecution.enabled=true`
- governance metadata + transaction addresses attached via onchain config or sync endpoint

Workflow email actions require:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Drag-and-drop is represented server-side as persisted `blocks` in the Flow feature, compiled into proposal instructions before publish.

## End-to-End Flow

1. Create a `flow` with drag-and-drop blocks.
2. Compile and publish flow to an internal proposal record.
   - Publish can optionally include `onchainCreate` to create the Realms proposal immediately.
3. Create onchain proposal from the stored compiled instructions:
   - `POST /api/v1/proposals/:proposalId/onchain-create`
4. Worker monitors proposal state and executes onchain transactions after success + hold-up.

## Workflow Rules (If/Else + Timing + Actions)

Workflow rules let you automate proposal handling with:

- Triggers:
  - `proposal-state-changed` (for selected states)
  - `voting-ends-in` (offset minutes)
  - `hold-up-expires-in` (offset minutes)
- Conditions:
  - `mode: "all" | "any"`
  - field/operator checks (state, riskScore, voteScope, onchainEnabled, hoursToVotingEnd, etc.)
- Branch actions:
  - `actions.onTrue[]`
  - `actions.onFalse[]`

Available actions:

- `send-email` (Resend)
- `enqueue-execution` (queue job)
- `execute-now` (prioritize immediate execution)
- `set-manual-approval` (require/release manual gate)

Manual approval gate behavior:

- If manual approval is required and not approved, execution jobs are rescheduled.
- If manual approval is explicitly rejected, the proposal is marked `execution-error` and execution job is failed.

Example rule (5-hour reminder before vote end):

```json
{
  "daoId": "65f0f7f71f8f17dc18f2a001",
  "name": "Voting ends in 5h",
  "trigger": {
    "type": "voting-ends-in",
    "states": [],
    "offsetMinutes": 300
  },
  "conditions": {
    "mode": "all",
    "rules": [
      { "field": "state", "operator": "eq", "value": "voting" }
    ]
  },
  "actions": {
    "onTrue": [
      {
        "type": "send-email",
        "enabled": true,
        "config": {
          "to": ["ops@example.com"],
          "subject": "Proposal ends soon: {{proposal.title}}",
          "body": "State: {{proposal.state}}\nVoting ends at: {{proposal.votingEndsAt}}"
        }
      }
    ],
    "onFalse": []
  }
}
```

Current automatic onchain-creation support:

- `transfer-sol` blocks
- `transfer-spl` blocks
- `custom-instruction` blocks (requires explicit `accountMetas`)

If unsupported instruction kinds are present, automatic onchain creation/execution configuration is rejected.
Internal proposal records use their own `proposalAddress` reference; onchain proposal addresses are tracked separately under `onchainExecution.proposalAddress`.

DAO on-chain creation support:

- `POST /api/v1/daos/onchain-create` prepares an unsigned Realm-creation transaction for wallet signing.
- The connected user wallet is the fee payer/signer; backend only prepares metadata and stores DAO records when explicitly posted to `POST /api/v1/daos`.

## Notes

- No new smart contracts are required for this backend.
- Automation policy is enforced at the service layer using DAO + proposal config.
- This service is an orchestration layer around existing Realms/SPL governance; it does not implement full onchain governance UX features (wallet voting, deposits/delegation, plugin lifecycle, Sowellian market lifecycle).
