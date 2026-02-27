import type { ProposalInstruction } from '@/features/proposal/proposal.model';
import { AppError } from '@/shared/errors/app-error';

type SupportedInstructionCheck = {
  supported: boolean;
  reason?: string;
};

const parsePayload = (instruction: ProposalInstruction): Record<string, unknown> => {
  if (!instruction.dataBase64) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(instruction.dataBase64, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const checkInstruction = (instruction: ProposalInstruction): SupportedInstructionCheck => {
  if (instruction.kind === 'custom') {
    if (instruction.dataBase64 === null || instruction.dataBase64 === undefined) {
      return {
        supported: false,
        reason: 'Custom instruction requires dataBase64',
      };
    }

    if (!instruction.accountMetas || instruction.accountMetas.length === 0) {
      return {
        supported: false,
        reason: 'Custom instruction requires accountMetas',
      };
    }

    return { supported: true };
  }

  if (instruction.kind === 'transfer') {
    const payload = parsePayload(instruction);

    if (payload.operation === 'transfer-sol') {
      if (!payload.fromGovernance || !payload.toWallet || typeof payload.lamports !== 'number') {
        return {
          supported: false,
          reason: 'transfer-sol payload is incomplete',
        };
      }

      return { supported: true };
    }

    if (payload.operation === 'transfer-spl') {
      if (
        !payload.fromTokenAccount ||
        !payload.toTokenAccount ||
        typeof payload.amount !== 'string' ||
        typeof payload.decimals !== 'number'
      ) {
        return {
          supported: false,
          reason: 'transfer-spl payload is incomplete',
        };
      }

      return { supported: true };
    }

    return {
      supported: false,
      reason: 'Only transfer-sol or transfer-spl can be auto-created onchain',
    };
  }

  if (instruction.kind === 'config') {
    const payload = parsePayload(instruction);

    if (payload.operation !== 'set-governance-config') {
      return {
        supported: false,
        reason: 'Only set-governance-config config payloads are supported',
      };
    }

    if (
      !payload.governanceAddress ||
      typeof payload.yesVoteThresholdPercent !== 'number' ||
      typeof payload.baseVotingTimeSeconds !== 'number' ||
      typeof payload.minInstructionHoldUpTimeSeconds !== 'number'
    ) {
      return {
        supported: false,
        reason: 'set-governance-config payload is incomplete',
      };
    }

    if (
      !Number.isInteger(payload.yesVoteThresholdPercent) ||
      payload.yesVoteThresholdPercent < 1 ||
      payload.yesVoteThresholdPercent > 100
    ) {
      return {
        supported: false,
        reason: 'set-governance-config yesVoteThresholdPercent must be within 1..100',
      };
    }

    if (!Number.isInteger(payload.baseVotingTimeSeconds) || payload.baseVotingTimeSeconds < 3600) {
      return {
        supported: false,
        reason: 'set-governance-config baseVotingTimeSeconds must be at least 3600',
      };
    }

    if (!Number.isInteger(payload.minInstructionHoldUpTimeSeconds) || payload.minInstructionHoldUpTimeSeconds < 0) {
      return {
        supported: false,
        reason: 'set-governance-config minInstructionHoldUpTimeSeconds must be non-negative',
      };
    }

    const communityVetoThresholdPercent = payload.communityVetoThresholdPercent;

    if (
      communityVetoThresholdPercent !== undefined &&
      (typeof communityVetoThresholdPercent !== 'number' ||
        !Number.isInteger(communityVetoThresholdPercent) ||
        communityVetoThresholdPercent < 0 ||
        communityVetoThresholdPercent > 100)
    ) {
      return {
        supported: false,
        reason: 'set-governance-config communityVetoThresholdPercent must be within 0..100 when provided',
      };
    }

    return { supported: true };
  }

  if (instruction.kind === 'program-upgrade') {
    const payload = parsePayload(instruction);

    if (payload.operation !== 'program-upgrade') {
      return {
        supported: false,
        reason: 'Only program-upgrade payloads are supported',
      };
    }

    if (!payload.programId || !payload.bufferAddress || !payload.spillAddress) {
      return {
        supported: false,
        reason: 'program-upgrade payload is incomplete',
      };
    }

    return { supported: true };
  }

  if (instruction.kind === 'stream') {
    const payload = parsePayload(instruction);

    if (
      payload.operation === undefined &&
      Boolean(instruction.dataBase64) &&
      Array.isArray(instruction.accountMetas) &&
      instruction.accountMetas.length > 0
    ) {
      return { supported: true };
    }

    if (payload.operation !== 'create-stream') {
      return {
        supported: false,
        reason: 'Only create-stream payloads are supported',
      };
    }

    if (
      typeof payload.instructionDataBase64 !== 'string' ||
      !Array.isArray(payload.accountMetas) ||
      payload.accountMetas.length === 0
    ) {
      return {
        supported: false,
        reason: 'create-stream requires instructionDataBase64 and accountMetas',
      };
    }

    const hasInvalidAccountMeta = payload.accountMetas.some(
      (accountMeta) =>
        !accountMeta ||
        typeof accountMeta !== 'object' ||
        typeof (accountMeta as Record<string, unknown>).pubkey !== 'string' ||
        typeof (accountMeta as Record<string, unknown>).isSigner !== 'boolean' ||
        typeof (accountMeta as Record<string, unknown>).isWritable !== 'boolean',
    );

    if (hasInvalidAccountMeta) {
      return {
        supported: false,
        reason: 'create-stream accountMetas are invalid',
      };
    }

    return { supported: true };
  }

  return {
    supported: false,
    reason: `Instruction kind "${instruction.kind}" is not supported for auto onchain creation`,
  };
};

export const assertInstructionsAreOnchainCreatable = (instructions: ProposalInstruction[]): void => {
  const unsupported = instructions
    .map((instruction) => {
      const result = checkInstruction(instruction);
      return result.supported
        ? null
        : {
            index: instruction.index,
            kind: instruction.kind,
            label: instruction.label,
            reason: result.reason ?? 'Unsupported instruction',
          };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (unsupported.length > 0) {
    throw new AppError(
      'One or more instructions are not supported for automatic onchain creation/execution',
      400,
      'ONCHAIN_INSTRUCTION_UNSUPPORTED',
      { unsupported },
    );
  }
};
