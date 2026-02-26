import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProposalInstruction } from '@/features/proposal/proposal.model';
import { AppError } from '@/shared/errors/app-error';
import { assertInstructionsAreOnchainCreatable } from '@/shared/solana/onchain-instruction-support.util';

const encodePayload = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

const createInstruction = (input: Partial<ProposalInstruction>): ProposalInstruction =>
  ({
    index: 0,
    kind: 'custom',
    label: 'test',
    programId: '11111111111111111111111111111111',
    accounts: [],
    riskScore: 10,
    riskLevel: 'safe',
    dataBase64: null,
    ...input,
  }) as ProposalInstruction;

test('accepts all supported auto-onchain instruction variants', () => {
  const instructions: ProposalInstruction[] = [
    createInstruction({
      kind: 'transfer',
      dataBase64: encodePayload({
        operation: 'transfer-sol',
        fromGovernance: 'GqQ7WQwYf4wV7q3azkn8m7xDksWjbn8u6E5m3i2H9a1P',
        toWallet: '6YcVg6Qf8a1V6Jv7kB8Y8fYw3f3mM5J8yW2n9bQ8wT6z',
        lamports: 1_000_000,
      }),
    }),
    createInstruction({
      kind: 'transfer',
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      dataBase64: encodePayload({
        operation: 'transfer-spl',
        fromTokenAccount: '3nD3ykV1EFYzPe3jXf7D86ttFBrhpmjH8byN9t7VDaRr',
        toTokenAccount: 'BrTuJYQ5jDqjUGAsCN2xpW6xM1j93QYh9M6czs3ez2eG',
        amount: '42.5',
        decimals: 6,
      }),
    }),
    createInstruction({
      kind: 'config',
      dataBase64: encodePayload({
        operation: 'set-governance-config',
        governanceAddress: '3X3fAqP8zXkTsU2QY9MNd4y7C4eQby3H3mA4wDycmRkC',
        yesVoteThresholdPercent: 60,
        baseVotingTimeSeconds: 86_400,
        minInstructionHoldUpTimeSeconds: 3_600,
      }),
    }),
    createInstruction({
      kind: 'program-upgrade',
      dataBase64: encodePayload({
        operation: 'program-upgrade',
        programId: '2kHh4e2N8R5ZxL7o1M6h3mN9q1x3V6a4W8b5J3Q9sT2U',
        bufferAddress: '6YQnP8k3o6s2Q8v4N2m5S3x7B9j2w3v8c4x9Q2w8R6tN',
        spillAddress: '9xV8eP7b2c8m3Q4p6d7h2k8Q5w4f9Y8q2L4v6x1Z9aQK',
      }),
    }),
    createInstruction({
      kind: 'stream',
      dataBase64: encodePayload({
        operation: 'create-stream',
        instructionDataBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        accountMetas: [
          {
            pubkey: '8zQ9eP8b3c9m4Q5p7d8h3k9Q6w5f1Y9q3L5v7x2Z1aQL',
            isSigner: false,
            isWritable: true,
          },
        ],
      }),
    }),
    createInstruction({
      kind: 'custom',
      dataBase64: Buffer.from([9, 9, 9]).toString('base64'),
      accountMetas: [
        {
          pubkey: '5tN8xV9eP7b2c8m3Q4p6d7h2k8Q5w4f9Y8q2L4v6x1Z9',
          isSigner: false,
          isWritable: true,
        },
      ],
    }),
  ];

  assert.doesNotThrow(() => {
    assertInstructionsAreOnchainCreatable(instructions);
  });
});

test('rejects create-stream payloads that do not include compiled instruction bytes and metas', () => {
  const streamInstruction = createInstruction({
    kind: 'stream',
    dataBase64: encodePayload({
      operation: 'create-stream',
      tokenMint: '4QnP8k3o6s2Q8v4N2m5S3x7B9j2w3v8c4x9Q2w8R6tN',
    }),
  });

  let error: unknown;

  try {
    assertInstructionsAreOnchainCreatable([streamInstruction]);
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'ONCHAIN_INSTRUCTION_UNSUPPORTED');
  assert.match(error.message, /not supported for automatic onchain creation/i);
});
