# Daometer

Daometer is a non-custodial governance automation layer for Solana DAOs built around **Realms / SPL Governance**.

It gives DAO operators a guided path to:

- connect a wallet
- create a DAO (Realm) on Solana
- create governance accounts and treasury primitives
- manage governance token and voting power flows
- author proposal logic visually
- compile that logic into ordered governance instructions
- publish and sign proposals for Realms-compatible governance
- monitor proposal state and automate post-vote actions with a background worker

This repository contains:

- a **React + TypeScript client** in [`/client`](/Users/chigozzdev/Desktop/daometer/client)
- an **Express + MongoDB backend** in [`/server`](/Users/chigozzdev/Desktop/daometer/server)
- a **background worker** in [`/server/src/worker`](/Users/chigozzdev/Desktop/daometer/server/src/worker) that evaluates workflows and processes execution jobs

## Table of Contents

- [About](#about)
- [Core Concepts](#core-concepts)
- [What Was Built](#what-was-built)
- [How It Works](#how-it-works)
- [Realms / SPL Governance Integration](#realms--spl-governance-integration)
- [Realms Extension Surface](#realms-extension-surface)
- [Key Snippets](#key-snippets)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Scripts](#scripts)
- [API Surface](#api-surface)
- [Operational Notes](#operational-notes)
- [Known Limitations](#known-limitations)

## About

Daometer is built as an orchestration layer on top of Realms rather than a replacement for Realms.

The project focuses on the part that is still difficult for many DAO operators:

- translating intent into proposal instructions
- sequencing setup actions correctly
- managing proposal lifecycle automation
- reducing repetitive manual work around treasury actions, config changes, upgrades, and execution follow-through

The core product flow is:

1. Create or register a DAO.
2. Configure governance and voting primitives.
3. Build a reusable governance flow visually.
4. Compile the flow into proposal instructions.
5. Publish it as a proposal.
6. Monitor and automate the resulting proposal lifecycle.

## Core Concepts

The codebase is much easier to understand if these terms are kept separate:

### DAO / Realm

This is the top-level governance container. In Realms terms, this is the **Realm**.

It represents:

- the DAO identity
- the governing token relationship
- the main governance namespace where proposals live

### Governance

A governance account defines the rules for a set of proposals and owns a **native treasury**.

It controls:

- vote thresholds
- voting duration
- hold-up time
- vote tipping behavior
- which treasury or governed assets proposals operate against

### Flow

A flow is a reusable proposal blueprint inside Daometer.

A flow stores:

- ordered action blocks
- graph node layout
- dependency edges between actions
- the selected DAO / governance context

Flows are authoring-time objects. They are not votes by themselves.

### Proposal

A proposal is the concrete governance decision generated from a flow.

Publishing a flow creates:

- an internal proposal record in Daometer
- optionally, a real on-chain proposal creation path for Realms-compatible governance

This is the object that people eventually vote on.

### Workflow

A workflow is the automation policy attached to a flow.

It watches proposals created from that flow and can respond to proposal lifecycle changes such as:

- voting started
- proposal succeeded
- proposal defeated
- execution eligibility

So the relationship is:

- **Flow** authors the proposal logic
- **Proposal** is the runtime governance object
- **Workflow** monitors proposals created from that flow

## What Was Built

The current codebase includes:

### Wallet-based authentication

- challenge/verify flow using wallet signatures
- JWT session handling after successful wallet verification

### DAO creation + registration

- internal DAO records
- wallet-signed on-chain Realm creation
- wallet-signed community mint preparation
- wallet-signed governance account + native treasury preparation

### Governance token operations

- prepare mint distribution transactions
- prepare mint authority changes

### Voting power operations

- prepare deposit transactions
- prepare withdraw transactions
- prepare delegate transactions

### Flow authoring

- drag-and-drop builder using **React Flow**
- reusable block types for common governance operations
- persisted graph layout + node widths

### Flow compilation

- risk scoring
- warning generation
- topological ordering based on block links
- instruction generation for proposal publication

### Proposal publication

- internal proposal records
- wallet-prepared on-chain proposal creation support for Realms-compatible governance

### Workflow automation

- flow-scoped workflow rules
- proposal lifecycle evaluation
- worker-based queue synchronization and execution processing

## How It Works

This is the intended end-to-end lifecycle of the product.

### 1. Connect wallet and authenticate

The client requests a challenge from the backend, signs it with the connected wallet, and exchanges the signature for access/refresh tokens.

Relevant files:

- [client/src/features/auth/api/api.ts](/Users/chigozzdev/Desktop/daometer/client/src/features/auth/api/api.ts)
- [client/src/features/auth/components/card.tsx](/Users/chigozzdev/Desktop/daometer/client/src/features/auth/components/card.tsx)
- [server/src/features/auth/auth.routes.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/auth/auth.routes.ts)
- [server/src/features/auth/auth.service.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/auth/auth.service.ts)

Key route wiring:

```ts
authRouter.post('/challenge', validateRequest(createChallengeSchema), authController.challenge);
authRouter.post('/verify', validateRequest(verifyChallengeSchema), authController.verify);
```

### 2. Create a DAO (Realm)

Daometer supports both:

- creating an internal DAO record
- preparing a wallet-signed on-chain Realm creation transaction

The backend prepares transactions; the connected wallet signs and submits them.

Relevant files:

- [server/src/features/dao/dao.routes.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/dao/dao.routes.ts)
- [server/src/features/dao/dao.service.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/dao/dao.service.ts)
- [client/src/features/dashboard/pages/daos.tsx](/Users/chigozzdev/Desktop/daometer/client/src/features/dashboard/pages/daos.tsx)
- [client/src/features/dashboard/api/api.ts](/Users/chigozzdev/Desktop/daometer/client/src/features/dashboard/api/api.ts)

Key routes:

```ts
daoRouter.post('/onchain-create', requireAuth, validateRequest(createDaoOnchainSchema), daoController.createOnchain);
daoRouter.post('/prepare-community-mint', requireAuth, validateRequest(prepareCommunityMintSchema), daoController.prepareCommunityMint);
daoRouter.post('/:daoId/prepare-governance', requireAuth, validateRequest(prepareGovernanceCreateSchema), daoController.prepareGovernance);
```

### 3. Create governance + treasury primitives

After a Realm exists, the user prepares governance-specific transactions:

- create governance account
- create native treasury
- optionally distribute governance tokens
- optionally transfer mint authority

This gives the DAO the minimum primitives needed for proposal-based operations.

### 4. Manage governance token and voting power

Daometer exposes wallet-signed preparation endpoints for:

- deposit governance tokens
- withdraw deposited voting power
- delegate voting power to another wallet

These are the mechanics that make a wallet participate in Realms voting with actual governance power.

### 5. Author a flow

Flows are reusable proposal blueprints. Each flow contains:

- `blocks`: the logical actions
- `graph.nodes`: layout positions
- `graph.edges`: execution dependencies

The builder is powered by **React Flow**.

Relevant files:

- [client/src/features/dashboard/components/flow-editor.tsx](/Users/chigozzdev/Desktop/daometer/client/src/features/dashboard/components/flow-editor.tsx)
- [client/src/features/dashboard/pages/flows.tsx](/Users/chigozzdev/Desktop/daometer/client/src/features/dashboard/pages/flows.tsx)

Current block types:

- `transfer-sol`
- `transfer-spl`
- `set-governance-config`
- `program-upgrade`
- `create-token-account`
- `create-stream`
- `custom-instruction`

### 6. Compile the flow

A flow is compiled into ordered governance instructions before publish.

Compilation handles:

- dependency ordering
- cycle detection
- risk scoring
- warning generation
- conversion into proposal instruction payloads

Relevant files:

- [server/src/features/flow/flow.service.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/flow/flow.service.ts)
- [server/src/features/flow/flow.compiler.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/flow/flow.compiler.ts)
- [server/src/features/flow/flow.routes.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/flow/flow.routes.ts)

### 7. Publish the flow as a proposal

Publishing a flow does two things:

1. creates an internal proposal record
2. optionally prepares on-chain Realms-compatible proposal creation transactions

The publish path also attaches `sourceFlowId` so proposal lifecycle automation stays bound to the flow that created it.

Relevant files:

- [server/src/features/flow/flow.service.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/flow/flow.service.ts)
- [server/src/features/proposal/proposal.service.ts](/Users/chigozzdev/Desktop/daometer/server/src/features/proposal/proposal.service.ts)

### 8. Monitor and automate

The worker runs on an interval and orchestrates automation around proposal lifecycle.

It:

1. releases expired locks
2. syncs on-chain proposal state
3. evaluates workflow rules
4. synchronizes execution jobs
5. claims and processes queued execution jobs

Relevant file:

- [server/src/worker/index.ts](/Users/chigozzdev/Desktop/daometer/server/src/worker/index.ts)

## Realms / SPL Governance Integration

Daometer is explicitly designed to work with Realms-compatible governance, not against it.

Implemented integration points:

- `@realms-today/spl-governance`
- `@solana/web3.js`
- wallet-signed transaction preparation
- Realm creation
- governance account creation
- native treasury creation
- governing token mint setup assistance
- proposal publication with optional on-chain creation
- governance power deposit / withdraw / delegate transaction preparation

Backend dependency source:

- [server/package.json](/Users/chigozzdev/Desktop/daometer/server/package.json)

```json
{
  "@realms-today/spl-governance": "^0.3.33",
  "@solana/web3.js": "^1.98.4"
}
```

Client dependency source:

- [client/package.json](/Users/chigozzdev/Desktop/daometer/client/package.json)

```json
{
  "@solana/web3.js": "^1.98.4",
  "reactflow": "^11.11.4"
}
```

### What Daometer Uses Realms For

At a practical level, Daometer uses Realms for:

- DAO / Realm creation
- governance rule configuration
- treasury ownership and native treasury derivation
- proposal lifecycle and voting
- voting power mechanics (deposit, withdraw, delegate)

### What Daometer Adds On Top

Daometer adds the missing orchestration layer:

- flow authoring instead of manual instruction composition
- compile-time ordering and validation
- reusable proposal templates
- flow-scoped monitoring and automation
- a simpler UX for preparing wallet-signed governance actions

## Realms Extension Surface

### Current Status

Daometer currently ships a **generic extension path** for protocol-specific actions, rather than a dedicated adapter per protocol.

That means:

- there is no protocol-specific adapter layer beyond the built-in Realms-oriented blocks
- there is no dedicated block type for every downstream Solana protocol
- advanced integrations currently route through the generic `custom-instruction` path

This section is intentionally explicit so the README stays accurate.

### Where Custom Integrations Fit

The correct integration surface in the current architecture is the `custom-instruction` block plus workflow automation.

Why:

- Daometer already supports protocol-specific instruction payloads through `custom-instruction`
- the compiler can include custom program/account metadata in proposal instructions
- workflows can watch proposal state and trigger follow-up actions

That means a protocol-specific extension would likely be implemented by:

1. adding a dedicated block type in the client builder
2. mapping that block into a compiled instruction or worker action
3. optionally adding an integration client under [`server/src/shared/integrations`](/Users/chigozzdev/Desktop/daometer/server/src/shared/integrations)

### What Exists Today That Enables It

The current generic custom block shape:

```ts
return {
  id: makeBlockId(),
  type: 'custom-instruction',
  label: 'Custom instruction',
  programId: PLACEHOLDER_PUBKEY,
  dataBase64: PLACEHOLDER_BASE64,
  kind: 'custom',
  accounts: [],
  accountsCsv: '',
};
```

That is the extension point Daometer uses for custom protocol-specific governance automation.

### Shared Integrations Directory

Current shared integrations:

- [server/src/shared/integrations/resend.client.ts](/Users/chigozzdev/Desktop/daometer/server/src/shared/integrations/resend.client.ts)

Future protocol-specific adapters belong in this same integration layer.

## Key Snippets

### Wallet-signed DAO + governance preparation

```ts
daoRouter.post('/onchain-create', requireAuth, validateRequest(createDaoOnchainSchema), daoController.createOnchain);
daoRouter.post('/:daoId/prepare-governance', requireAuth, validateRequest(prepareGovernanceCreateSchema), daoController.prepareGovernance);
```

### Flow compilation entrypoint

```ts
export const compileInlineFlow = (blocks: FlowBlock[], context: FlowCompileContext = {}) =>
  compileFlowBlocks(blocks, context);
```

### Flow publish payload

```ts
const proposalInput: CreateProposalInput = {
  daoId: flow.daoId.toString(),
  sourceFlowId: flow.id,
  instructions: compilation.instructions.map((instruction) => ({
    index: instruction.index,
    kind: instruction.kind,
    label: instruction.label,
    programId: instruction.programId,
    accounts: instruction.accounts,
    dataBase64: instruction.dataBase64,
  })),
};
```

### React Flow builder

```tsx
<ReactFlow
  nodes={reactFlowNodes}
  edges={reactFlowEdges}
  nodeTypes={flowNodeTypes}
  onNodesChange={handleNodesChange}
  onEdgesChange={handleEdgesChange}
  onConnect={handleConnect}
  nodesDraggable
  nodesConnectable
  elementsSelectable
>
  <Background gap={20} size={2} color="#d9d9d9" />
  <Controls position="bottom-right" />
</ReactFlow>
```

### Worker tick loop

```ts
const releasedCount = await releaseExpiredJobLocks();
const onchainStateSync = await syncOnchainProposalStates();
const workflowEvaluation = await evaluateWorkflowRules(workerId);
const syncResult = await synchronizeExecutionQueue();
```

### Execution job processing

```ts
const processResults: Array<Awaited<ReturnType<typeof processNextExecutionJob>>> = [];

for (let index = 0; index < env.WORKER_MAX_JOBS_PER_TICK; index += 1) {
  const result = await processNextExecutionJob(workerId);

  if (!result.processed) {
    break;
  }

  processResults.push(result);
}
```

## Project Structure

```txt
.
├── client/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   └── landing/
│   │   └── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── automation/
│   │   │   ├── dao/
│   │   │   ├── execution-job/
│   │   │   ├── flow/
│   │   │   ├── proposal/
│   │   │   └── workflow/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── shared/
│   │   │   ├── integrations/
│   │   │   ├── middlewares/
│   │   │   ├── solana/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── worker/
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Setup

### Prerequisites

- Node.js 18+
- npm
- MongoDB
- a Solana wallet (Phantom is the easiest path for client-side signing)

### 1. Install client dependencies

```bash
cd client
npm install
```

Client env:

```bash
cp .env.example .env
```

Default client env:

```env
VITE_API_BASE_URL=http://localhost:4000/api/v1
```

Source:

- [client/.env.example](/Users/chigozzdev/Desktop/daometer/client/.env.example)

### 2. Install server dependencies

```bash
cd server
npm install
```

Server env:

```bash
cp .env.example .env
```

Important server env values:

```env
PORT=4000
API_PREFIX=/api/v1
MONGODB_URI=mongodb://127.0.0.1:27017/daometer
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_COMMITMENT=confirmed
JWT_ACCESS_SECRET=replace-with-access-secret-minimum-32-chars
JWT_REFRESH_SECRET=replace-with-refresh-secret-minimum-32-chars
WORKER_EXECUTOR_SECRET_KEY=
WORKER_SIMULATE_BEFORE_EXECUTE=true
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Source:

- [server/.env.example](/Users/chigozzdev/Desktop/daometer/server/.env.example)

### 3. Run the backend API

```bash
cd server
npm run dev
```

### 4. Run the worker

```bash
cd server
npm run worker:dev
```

### 5. Run the client

```bash
cd client
npm run dev
```

### 6. Open the app

Once both services are running:

- client: Vite dev server (usually `http://localhost:5173`)
- API: `http://localhost:4000/api/v1`

Recommended local flow:

1. connect wallet
2. create Realm / DAO
3. create governance + treasury
4. manage token / voting power if needed
5. create a flow
6. compile
7. publish
8. watch the worker process lifecycle updates

## Scripts

### Client

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run type-check`

### Server

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run worker:dev`
- `npm run worker:start`
- `npm run seed:dev`
- `npm run type-check`
- `npm run test`

## API Surface

Main backend prefixes are served under:

- `API_PREFIX` (default: `/api/v1`)

Core endpoint groups:

- `/auth/*`
- `/daos/*`
- `/flows/*`
- `/proposals/*`
- `/execution-jobs/*`
- `/automation/*`
- `/workflows/*`

Representative endpoints:

- `POST /api/v1/auth/challenge`
- `POST /api/v1/auth/verify`
- `POST /api/v1/daos`
- `POST /api/v1/daos/onchain-create`
- `POST /api/v1/daos/prepare-community-mint`
- `POST /api/v1/daos/:daoId/prepare-governance`
- `POST /api/v1/daos/:daoId/prepare-mint-distribution`
- `POST /api/v1/daos/:daoId/prepare-mint-authority`
- `POST /api/v1/daos/:daoId/prepare-voting-deposit`
- `POST /api/v1/daos/:daoId/prepare-voting-withdraw`
- `POST /api/v1/daos/:daoId/prepare-voting-delegate`
- `POST /api/v1/flows`
- `POST /api/v1/flows/compile-inline`
- `POST /api/v1/flows/:flowId/compile`
- `POST /api/v1/flows/:flowId/publish`

## Operational Notes

- DAO and proposal creation can be non-custodial when using prepared wallet-signed transactions.
- The worker handles polling, proposal state sync, workflow evaluation, and execution job processing.
- The builder is flow-scoped; workflows evaluate proposals created from their source flow.
- React Flow drives the canvas, so node movement, connection, and resizing are handled by a dedicated graph editor rather than a hand-rolled interaction layer.
- This repository is strongest as a devnet-first governance automation stack; production use still requires security review, runtime hardening, and operational controls.

## Known Limitations

- Not every Solana / Realms instruction is exposed as a dedicated block; unsupported workflows fall back to `custom-instruction`.
- The client bundle is currently large enough to trigger Vite chunk-size warnings.
- Production-grade guardrails around irreversible governance actions still need deeper review.

## Why This Repo Exists

Daometer exists to make Realms governance easier to author, safer to automate, and more reusable across DAO operations.

Instead of manually rebuilding proposal logic every time, teams can create structured flows, publish those flows into proposals, and let the worker coordinate the lifecycle after publication.
