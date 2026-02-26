import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFlowBlocks } from '@/features/flow/flow.compiler';
import type { CreateStreamBlock, FlowBlock } from '@/features/flow/flow.types';

const baseBlock = {
  id: 'block-1',
  label: 'test block',
} as const;

test('set-governance-config compiles with governance program context', () => {
  const blocks: FlowBlock[] = [
    {
      ...baseBlock,
      type: 'set-governance-config',
      governanceAddress: '5f4A3qN2wX8vJ6kL2mN4pQ9rS3tV7xY1zA2bC3dE4fG',
      yesVoteThresholdPercent: 65,
      baseVotingTimeSeconds: 172_800,
      minInstructionHoldUpTimeSeconds: 7_200,
      communityVetoThresholdPercent: 10,
    },
  ];

  const result = compileFlowBlocks(blocks, {
    governanceProgramId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
  });

  assert.equal(result.instructions.length, 1);
  const [instruction] = result.instructions;
  assert.equal(instruction.kind, 'config');
  assert.equal(instruction.programId, 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

  const payload = JSON.parse(Buffer.from(instruction.dataBase64, 'base64').toString('utf8')) as {
    operation: string;
    yesVoteThresholdPercent: number;
    baseVotingTimeSeconds: number;
  };

  assert.equal(payload.operation, 'set-governance-config');
  assert.equal(payload.yesVoteThresholdPercent, 65);
  assert.equal(payload.baseVotingTimeSeconds, 172_800);
});

test('create-stream warns when compiled instruction bytes are missing', () => {
  const blocks: FlowBlock[] = [
    {
      ...baseBlock,
      type: 'create-stream',
      streamProgramId: '5Q4rN3m2p1t9x8w7v6u5s4r3q2p1o9n8m7l6k5j4h3g',
      treasuryTokenAccount: '7m6n5b4v3c2x1z9a8s7d6f5g4h3j2k1l9p8o7i6u5y',
      recipientWallet: '2w3e4r5t6y7u8i9o1p2a3s4d5f6g7h8j9k1l2z3x4c',
      tokenMint: '9a8s7d6f5g4h3j2k1l9p8o7i6u5y4t3r2e1w9q8m7n',
      totalAmount: '2500',
      startAt: new Date(Date.now() + 60_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
      canCancel: true,
    },
  ];

  const result = compileFlowBlocks(blocks);
  const [instruction] = result.instructions;

  assert.equal(instruction.kind, 'stream');
  assert.equal(instruction.accountMetas, undefined);
  assert.equal(instruction.accounts.length, 2);
  assert.ok(result.warnings.some((warning) => warning.includes('instructionDataBase64 + accountMetas')));
});

test('create-stream uses compiled account metas when provided', () => {
  const streamBlock: CreateStreamBlock = {
    ...baseBlock,
    type: 'create-stream',
    streamProgramId: '8h7g6f5d4s3a2p1o9i8u7y6t5r4e3w2q1z9x8c7v6b',
    treasuryTokenAccount: '5t4r3e2w1q9m8n7b6v5c4x3z2a1s9d8f7g6h5j4k3l',
    recipientWallet: '3m4n5b6v7c8x9z1a2s3d4f5g6h7j8k9l1p2o3i4u5y',
    tokenMint: '6u5y4t3r2e1w9q8m7n6b5v4c3x2z1a9s8d7f6g5h4j',
    totalAmount: '100',
    startAt: new Date(Date.now() + 120_000).toISOString(),
    endAt: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
    canCancel: false,
    instructionDataBase64: Buffer.from([10, 20, 30]).toString('base64'),
    accountMetas: [
      { pubkey: '2k3l4m5n6b7v8c9x1z2a3s4d5f6g7h8j9k1l2p3o4i', isSigner: false, isWritable: true },
      { pubkey: '7h8j9k1l2p3o4i5u6y7t8r9e1w2q3a4s5d6f7g8h9j', isSigner: true, isWritable: false },
    ],
  };
  const blocks: FlowBlock[] = [streamBlock];

  const result = compileFlowBlocks(blocks);
  const [instruction] = result.instructions;

  assert.equal(instruction.kind, 'stream');
  assert.equal(instruction.accountMetas?.length, 2);
  assert.deepEqual(
    instruction.accounts,
    streamBlock.accountMetas?.map((meta) => meta.pubkey),
  );

  const payload = JSON.parse(Buffer.from(instruction.dataBase64, 'base64').toString('utf8')) as {
    operation: string;
    instructionDataBase64?: string;
  };

  assert.equal(payload.operation, 'create-stream');
  assert.equal(payload.instructionDataBase64, Buffer.from([10, 20, 30]).toString('base64'));
});
