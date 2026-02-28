# Daometer

Daometer is a non-custodial governance automation layer for **Realms / SPL Governance** on Solana.

It helps DAO operators move from idea to executable governance action without manually assembling proposal transactions every time.

With Daometer, a user can:

- connect a wallet
- create a DAO (Realm)
- create governance + treasury primitives
- manage governance token and voting power flows
- build a proposal visually
- compile it into ordered governance instructions
- publish it for Realms-compatible governance
- monitor the proposal lifecycle with a background worker

## What Daometer Is

Daometer is an orchestration layer on top of Realms.

It does not replace Realms voting. It improves the parts around it:

- proposal authoring
- instruction ordering
- reusable governance workflows
- wallet-signed action preparation
- post-publish monitoring and automation

In practice, it gives teams a cleaner path from:

`governance intent -> flow -> compiled instructions -> proposal -> execution lifecycle`

## How It Works

### 1. Connect wallet

Authentication is wallet-based. The client requests a challenge, the user signs it, and the backend issues session tokens.

### 2. Create a DAO

The user can create a Realms-compatible DAO setup from the app:

- create an internal DAO record
- prepare wallet-signed on-chain Realm creation
- prepare community mint creation when needed

### 3. Create governance + treasury

After the Realm exists, the user prepares:

- governance account creation
- native treasury creation
- governance token distribution / authority actions

This gives the DAO the primitives required for proposal-based operations.

### 4. Build a flow

A flow is a reusable proposal blueprint.

The builder uses **React Flow** and supports connected action blocks. A flow stores:

- blocks
- graph layout
- dependencies between actions

### 5. Compile the flow

Before publishing, Daometer compiles the flow into ordered instructions.

Compilation handles:

- dependency ordering
- cycle detection
- instruction shaping
- risk metadata

### 6. Publish the proposal

Publishing a flow creates:

- an internal proposal record in Daometer
- optional wallet-prepared on-chain proposal creation for Realms-compatible governance

This is the point where the authored workflow becomes a real governance proposal.

### 7. Monitor lifecycle

The background worker monitors proposal state and automation rules, then coordinates follow-up actions around the proposal lifecycle.

## Realms Integration

Daometer is built directly around **Realms / SPL Governance**.

Current integration includes:

- Realm creation
- governance account creation
- native treasury creation
- governance token mint preparation
- governance token distribution
- governance token authority changes
- voting power deposit
- voting power withdraw
- voting power delegation
- Realms-compatible proposal publication

Realms remains the governance layer for:

- proposal state
- voting
- treasury authority
- governance configuration

Daometer adds the authoring and orchestration layer on top.

## Flow Builder

Flows are the core authoring primitive in Daometer.

Each flow is a reusable governance template composed of connected blocks. The current built-in block set includes:

- `transfer-sol`
- `transfer-spl`
- `set-governance-config`
- `program-upgrade`
- `create-token-account`
- `create-stream`
- `custom-instruction`

This lets users model common governance actions visually, then publish them as structured proposals.

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

## Architecture

This repository contains three main parts:

- **Client**: React + TypeScript app for wallet auth, DAO setup, flow authoring, compile, and publish
- **Server**: Express + MongoDB API for auth, DAO/flow/proposal persistence, and prepared transaction generation
- **Worker**: background process for proposal sync, workflow evaluation, and execution job processing

## Project Structure

```txt
.
├── client/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   └── shared/
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── features/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── shared/
│   │   └── worker/
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- MongoDB
- a Solana wallet (Phantom is the simplest path for local testing)

### 1. Install dependencies

```bash
cd client && npm install
cd ../server && npm install
```

### 2. Configure environment files

Client:

```bash
cd client
cp .env.example .env
```

Server:

```bash
cd server
cp .env.example .env
```

Important defaults:

- client API base: `http://localhost:4000/api/v1`
- server API port: `4000`
- default Solana RPC: devnet

### 3. Run the app

API:

```bash
cd server
npm run dev
```

Worker:

```bash
cd server
npm run worker:dev
```

Client:

```bash
cd client
npm run dev
```

## Main Scripts

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

Core backend groups:

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
- `POST /api/v1/daos/onchain-create`
- `POST /api/v1/daos/:daoId/prepare-governance`
- `POST /api/v1/daos/:daoId/prepare-voting-deposit`
- `POST /api/v1/daos/:daoId/prepare-voting-withdraw`
- `POST /api/v1/daos/:daoId/prepare-voting-delegate`
- `POST /api/v1/flows`
- `POST /api/v1/flows/compile-inline`
- `POST /api/v1/flows/:flowId/compile`
- `POST /api/v1/flows/:flowId/publish`

## Why This Exists

Realms is a powerful governance layer, but proposal authoring and lifecycle coordination are still manual for many teams.

Daometer exists to make that process:

- faster
- clearer
- reusable
- safer to operate at the application layer

It turns repeated DAO operations into structured flows that can be authored once, published cleanly, and monitored consistently.
