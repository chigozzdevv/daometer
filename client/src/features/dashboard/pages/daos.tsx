import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  createDao,
  getDaoGovernances,
  getAuthProfile,
  getDaos,
  prepareCommunityMint,
  prepareDaoGovernanceCreate,
  prepareDaoOnchainCreate,
  updateDao,
  type DaoGovernanceItem,
  type DaoItem,
} from '@/features/dashboard/api/api';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime, shortAddress } from '@/features/dashboard/lib/format';
import { getSolanaProvider, sendPreparedTransaction } from '@/shared/solana/wallet';
import { ApiRequestError } from '@/shared/lib/api-client';

type DaoNetwork = 'mainnet-beta' | 'devnet';

const governanceProgramIdByNetwork: Record<DaoNetwork, string> = {
  devnet: 'GTesTBiEWE32WHXXE2S4XbZvA5CrEc4xs6ZgRe895dP',
  'mainnet-beta': 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
};

const knownGovernanceProgramIds = new Set(Object.values(governanceProgramIdByNetwork));

const getDefaultGovernanceProgramId = (network: DaoNetwork): string => governanceProgramIdByNetwork[network];

const resolveGovernanceProgramIdForNetwork = (current: string, network: DaoNetwork): string => {
  const trimmed = current.trim();

  if (trimmed.length === 0 || knownGovernanceProgramIds.has(trimmed)) {
    return getDefaultGovernanceProgramId(network);
  }

  return current;
};

type OnchainFieldErrorKey = 'name' | 'governanceProgramId' | 'authorityWallet' | 'communityMint';
type MintFieldErrorKey = 'name' | 'decimals' | 'authorityWallet';

type FieldErrors<TField extends string> = Partial<Record<TField, string>>;

const toFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiRequestError)) {
    return {};
  }

  const details = error.details;

  if (!details || typeof details !== 'object') {
    return {};
  }

  const fieldErrors = (details as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return {};
  }

  const parsed: Record<string, string> = {};

  Object.entries(fieldErrors).forEach(([field, messages]) => {
    if (!Array.isArray(messages)) {
      return;
    }

    const message = messages.find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );

    if (message) {
      parsed[field] = message;
    }
  });

  return parsed;
};

const withInputErrorClass = (baseClass: string, hasError: boolean): string =>
  `${baseClass}${hasError ? ' input-invalid' : ''}`;

const getExplorerAddressUrl = (address: string, network: DaoNetwork): string =>
  `https://explorer.solana.com/address/${address}${network === 'devnet' ? '?cluster=devnet' : ''}`;

const getRealmDetailUrl = (realmAddress: string, network: DaoNetwork): string =>
  `https://app.realms.today/dao/${realmAddress}${network === 'devnet' ? '?cluster=devnet' : ''}`;

type GovernanceConfigPreset = 'balanced' | 'fast' | 'secure' | 'custom';
type GovernanceVoteTipping = 'strict' | 'early' | 'disabled';
type GovernanceConfigDraft = {
  voteScope: 'community' | 'council';
  preset: GovernanceConfigPreset;
  communityYesVoteThresholdPercent: number;
  councilYesVoteThresholdPercent: number;
  councilVetoVoteThresholdPercent: number;
  baseVotingTimeHours: number;
  instructionHoldUpTimeHours: number;
  voteTipping: GovernanceVoteTipping;
  councilVoteTipping: GovernanceVoteTipping;
};

const governancePresetConfig = (
  preset: GovernanceConfigPreset,
  voteScope: 'community' | 'council',
): GovernanceConfigDraft => {
  if (preset === 'fast') {
    return {
      voteScope,
      preset,
      communityYesVoteThresholdPercent: 51,
      councilYesVoteThresholdPercent: 51,
      councilVetoVoteThresholdPercent: 50,
      baseVotingTimeHours: 24,
      instructionHoldUpTimeHours: 0,
      voteTipping: 'early',
      councilVoteTipping: 'early',
    };
  }

  if (preset === 'secure') {
    return {
      voteScope,
      preset,
      communityYesVoteThresholdPercent: 70,
      councilYesVoteThresholdPercent: 70,
      councilVetoVoteThresholdPercent: 60,
      baseVotingTimeHours: 120,
      instructionHoldUpTimeHours: 24,
      voteTipping: 'strict',
      councilVoteTipping: 'strict',
    };
  }

  return {
    voteScope,
    preset,
    communityYesVoteThresholdPercent: 60,
    councilYesVoteThresholdPercent: 60,
    councilVetoVoteThresholdPercent: 50,
    baseVotingTimeHours: 72,
    instructionHoldUpTimeHours: 0,
    voteTipping: 'strict',
    councilVoteTipping: 'strict',
  };
};

export const DashboardDaosPage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingOnchain, setIsCreatingOnchain] = useState(false);
  const [isCreatingCommunityMint, setIsCreatingCommunityMint] = useState(false);
  const [isCommunityMintModalOpen, setIsCommunityMintModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainSuccess, setOnchainSuccess] = useState<string | null>(null);

  const [onchainName, setOnchainName] = useState('');
  const [onchainNetwork, setOnchainNetwork] = useState<DaoNetwork>('devnet');
  const [onchainDescription, setOnchainDescription] = useState('');
  const [onchainGovernanceProgramId, setOnchainGovernanceProgramId] = useState(getDefaultGovernanceProgramId('devnet'));
  const [onchainAuthorityWallet, setOnchainAuthorityWallet] = useState('');
  const [onchainCommunityMint, setOnchainCommunityMint] = useState('');
  const [onchainCouncilMint, setOnchainCouncilMint] = useState('');
  const [onchainFieldErrors, setOnchainFieldErrors] = useState<FieldErrors<OnchainFieldErrorKey>>({});
  const [onchainGovernanceConfig, setOnchainGovernanceConfig] = useState<GovernanceConfigDraft>(
    governancePresetConfig('balanced', 'community'),
  );
  const [mintTokenName, setMintTokenName] = useState('');
  const [mintDecimals, setMintDecimals] = useState('6');
  const [mintAuthorityWallet, setMintAuthorityWallet] = useState('');
  const [mintFieldErrors, setMintFieldErrors] = useState<FieldErrors<MintFieldErrorKey>>({});
  const [governancesByDao, setGovernancesByDao] = useState<Record<string, DaoGovernanceItem[]>>({});
  const [governanceLoadingByDao, setGovernanceLoadingByDao] = useState<Record<string, boolean>>({});
  const [governanceErrorByDao, setGovernanceErrorByDao] = useState<Record<string, string | null>>({});
  const [selectedDefaultGovernanceByDao, setSelectedDefaultGovernanceByDao] = useState<Record<string, string>>({});
  const [savingDefaultGovernanceByDao, setSavingDefaultGovernanceByDao] = useState<Record<string, boolean>>({});
  const [creatingGovernanceByDao, setCreatingGovernanceByDao] = useState<Record<string, boolean>>({});
  const [governanceCreateSuccessByDao, setGovernanceCreateSuccessByDao] = useState<Record<string, string | null>>({});
  const [governanceCreateErrorByDao, setGovernanceCreateErrorByDao] = useState<Record<string, string | null>>({});
  const [governanceConfigByDao, setGovernanceConfigByDao] = useState<Record<string, GovernanceConfigDraft>>({});

  const loadDaos = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const items = await getDaos({ limit: 100 });
      setDaos(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGovernancesForDao = async (daoId: string): Promise<void> => {
    setGovernanceLoadingByDao((current) => ({ ...current, [daoId]: true }));
    setGovernanceErrorByDao((current) => ({ ...current, [daoId]: null }));

    try {
      const response = await getDaoGovernances(daoId);
      setGovernancesByDao((current) => ({ ...current, [daoId]: response.items }));
      setSelectedDefaultGovernanceByDao((current) => {
        if (current[daoId]) {
          return current;
        }

        return {
          ...current,
          [daoId]: response.items[0]?.address ?? '',
        };
      });
    } catch (loadError) {
      setGovernanceErrorByDao((current) => ({
        ...current,
        [daoId]: loadError instanceof Error ? loadError.message : 'Unable to load governance accounts',
      }));
    } finally {
      setGovernanceLoadingByDao((current) => ({ ...current, [daoId]: false }));
    }
  };

  const handleSetDefaultGovernance = async (dao: DaoItem, nextAddress: string | null): Promise<void> => {
    if (!session?.accessToken) {
      setError('You must be authenticated to update DAO governance settings.');
      return;
    }

    setSavingDefaultGovernanceByDao((current) => ({ ...current, [dao.id]: true }));

    try {
      const updated = await updateDao(
        dao.id,
        {
          defaultGovernanceAddress: nextAddress,
        },
        session.accessToken,
      );

      setDaos((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedDefaultGovernanceByDao((current) => ({
        ...current,
        [dao.id]: updated.defaultGovernanceAddress ?? current[dao.id] ?? '',
      }));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update default governance');
    } finally {
      setSavingDefaultGovernanceByDao((current) => ({ ...current, [dao.id]: false }));
    }
  };

  const updateGovernanceConfigForDao = (
    dao: DaoItem,
    updater: (current: GovernanceConfigDraft) => GovernanceConfigDraft,
  ): void => {
    setGovernanceConfigByDao((current) => {
      const existing = current[dao.id] ?? governancePresetConfig('balanced', dao.councilMint ? 'council' : 'community');
      return {
        ...current,
        [dao.id]: updater(existing),
      };
    });
  };

  const handleCreateGovernanceForDao = async (dao: DaoItem): Promise<void> => {
    setGovernanceCreateErrorByDao((current) => ({ ...current, [dao.id]: null }));
    setGovernanceCreateSuccessByDao((current) => ({ ...current, [dao.id]: null }));

    if (!session?.accessToken) {
      setGovernanceCreateErrorByDao((current) => ({
        ...current,
        [dao.id]: 'You must be authenticated to create governance.',
      }));
      return;
    }

    setCreatingGovernanceByDao((current) => ({ ...current, [dao.id]: true }));
    const configDraft =
      governanceConfigByDao[dao.id] ??
      governancePresetConfig('balanced', dao.councilMint ? 'council' : 'community');
    const resolvedVoteScope =
      configDraft.voteScope === 'council' && !dao.councilMint ? 'community' : configDraft.voteScope;

    try {
      const provider = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
      }

      const connectResult = await provider.connect();
      const connectedWallet = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

      if (!connectedWallet) {
        throw new Error('Wallet connection failed. Try reconnecting your wallet.');
      }

      const prepared = await prepareDaoGovernanceCreate(
        dao.id,
        {
          voteScope: resolvedVoteScope,
          createAuthorityWallet: connectedWallet,
          governanceConfig: {
            communityYesVoteThresholdPercent: configDraft.communityYesVoteThresholdPercent,
            councilYesVoteThresholdPercent: configDraft.councilYesVoteThresholdPercent,
            councilVetoVoteThresholdPercent: configDraft.councilVetoVoteThresholdPercent,
            baseVotingTimeHours: configDraft.baseVotingTimeHours,
            instructionHoldUpTimeHours: configDraft.instructionHoldUpTimeHours,
            voteTipping: configDraft.voteTipping,
            councilVoteTipping: configDraft.councilVoteTipping,
          },
          programVersion: 3,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.authorityWallet) {
        throw new Error('Connected wallet must match DAO authority wallet for governance creation.');
      }

      const signature = await sendPreparedTransaction(
        provider,
        prepared.transactionMessage,
        prepared.transactionBase58,
        prepared.transactionBase64,
        {
          rpcUrl: prepared.rpcUrl,
          recentBlockhash: prepared.recentBlockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        },
      );

      setGovernanceCreateSuccessByDao((current) => ({
        ...current,
        [dao.id]: `Governance created ${prepared.governanceAddress.slice(0, 8)}... Tx: ${signature.slice(0, 12)}...`,
      }));

      if (!dao.defaultGovernanceAddress) {
        const updatedDao = await updateDao(
          dao.id,
          {
            defaultGovernanceAddress: prepared.governanceAddress,
          },
          session.accessToken,
        );

        setDaos((current) => current.map((item) => (item.id === updatedDao.id ? updatedDao : item)));
        setSelectedDefaultGovernanceByDao((current) => ({
          ...current,
          [dao.id]: prepared.governanceAddress,
        }));
      }

      await loadGovernancesForDao(dao.id);
    } catch (createError) {
      setGovernanceCreateErrorByDao((current) => ({
        ...current,
        [dao.id]: createError instanceof Error ? createError.message : 'Unable to create governance account',
      }));
    } finally {
      setCreatingGovernanceByDao((current) => ({ ...current, [dao.id]: false }));
    }
  };

  useEffect(() => {
    void loadDaos();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (): Promise<void> => {
      if (!session?.accessToken) {
        return;
      }

      try {
        const profile = await getAuthProfile(session.accessToken);

        if (!isMounted) {
          return;
        }

        setOnchainAuthorityWallet(profile.walletAddress);
        setMintAuthorityWallet(profile.walletAddress);
      } catch {
        // no-op: DAO form can still be filled manually
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    setSelectedDefaultGovernanceByDao((current) => {
      const next = { ...current };

      daos.forEach((dao) => {
        if (!next[dao.id] && dao.defaultGovernanceAddress) {
          next[dao.id] = dao.defaultGovernanceAddress;
        }
      });

      return next;
    });

    setGovernanceConfigByDao((current) => {
      const next = { ...current };

      daos.forEach((dao) => {
        if (!next[dao.id]) {
          next[dao.id] = governancePresetConfig('balanced', dao.councilMint ? 'council' : 'community');
        }
      });

      return next;
    });
  }, [daos]);

  useEffect(() => {
    if (!onchainCouncilMint.trim() && onchainGovernanceConfig.voteScope === 'council') {
      setOnchainGovernanceConfig((current) => ({
        ...current,
        voteScope: 'community',
      }));
    }
  }, [onchainCouncilMint, onchainGovernanceConfig.voteScope]);

  const handleCreateOnchainDao = async (): Promise<void> => {
    setOnchainError(null);
    setOnchainSuccess(null);
    setOnchainFieldErrors({});

    if (!session?.accessToken) {
      setOnchainError('You must be authenticated to create an on-chain DAO.');
      return;
    }

    const nextFieldErrors: FieldErrors<OnchainFieldErrorKey> = {};

    if (!onchainName.trim()) {
      nextFieldErrors.name = 'Name is required.';
    }

    if (!onchainGovernanceProgramId.trim()) {
      nextFieldErrors.governanceProgramId = 'Governance program ID is required.';
    }

    if (!onchainAuthorityWallet.trim()) {
      nextFieldErrors.authorityWallet = 'Authority wallet is required.';
    }

    if (!onchainCommunityMint.trim()) {
      nextFieldErrors.communityMint = 'Community mint is required.';
    }

    if (
      onchainNetwork === 'devnet' &&
      onchainGovernanceProgramId.trim() === governanceProgramIdByNetwork['mainnet-beta']
    ) {
      nextFieldErrors.governanceProgramId = `Use devnet governance program ID: ${governanceProgramIdByNetwork.devnet}`;
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setOnchainFieldErrors(nextFieldErrors);
      setOnchainError('Please fill all required fields.');
      return;
    }

    setIsCreatingOnchain(true);

    try {
      const provider = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
      }

      const connectResult = await provider.connect();
      const connectedWallet = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

      if (!connectedWallet) {
        throw new Error('Wallet connection failed. Try reconnecting your wallet.');
      }

      const prepared = await prepareDaoOnchainCreate(
        {
          name: onchainName.trim(),
          network: onchainNetwork,
          communityMint: onchainCommunityMint.trim(),
          councilMint: onchainCouncilMint.trim() || undefined,
          governanceProgramId: onchainGovernanceProgramId.trim() || undefined,
          authorityWallet: onchainAuthorityWallet.trim() || undefined,
          programVersion: 3,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.authorityWallet) {
        throw new Error('Connected wallet must match authority wallet for non-custodial DAO creation.');
      }

      const signature = await sendPreparedTransaction(
        provider,
        prepared.transactionMessage,
        prepared.transactionBase58,
        prepared.transactionBase64,
        {
          rpcUrl: prepared.rpcUrl,
          recentBlockhash: prepared.recentBlockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        },
      );
      const createdDao = await createDao(
        {
          name: onchainName.trim(),
          description: onchainDescription.trim() || undefined,
          network: prepared.network,
          realmAddress: prepared.realmAddress,
          governanceProgramId: prepared.governanceProgramId,
          authorityWallet: prepared.authorityWallet,
          communityMint: onchainCommunityMint.trim() || undefined,
          councilMint: onchainCouncilMint.trim() || undefined,
        },
        session.accessToken,
      );

      let finalDao = createdDao;
      let governanceResultSummary = '';

      try {
        const governanceScope =
          onchainGovernanceConfig.voteScope === 'council' && !onchainCouncilMint.trim()
            ? 'community'
            : onchainGovernanceConfig.voteScope;
        const governancePrepared = await prepareDaoGovernanceCreate(
          createdDao.id,
          {
            voteScope: governanceScope,
            createAuthorityWallet: connectedWallet,
            governanceConfig: {
              communityYesVoteThresholdPercent: onchainGovernanceConfig.communityYesVoteThresholdPercent,
              councilYesVoteThresholdPercent: onchainGovernanceConfig.councilYesVoteThresholdPercent,
              councilVetoVoteThresholdPercent: onchainGovernanceConfig.councilVetoVoteThresholdPercent,
              baseVotingTimeHours: onchainGovernanceConfig.baseVotingTimeHours,
              instructionHoldUpTimeHours: onchainGovernanceConfig.instructionHoldUpTimeHours,
              voteTipping: onchainGovernanceConfig.voteTipping,
              councilVoteTipping: onchainGovernanceConfig.councilVoteTipping,
            },
            programVersion: 3,
          },
          session.accessToken,
        );

        if (connectedWallet !== governancePrepared.authorityWallet) {
          throw new Error('Connected wallet must match DAO authority wallet for governance creation.');
        }

        const governanceSignature = await sendPreparedTransaction(
          provider,
          governancePrepared.transactionMessage,
          governancePrepared.transactionBase58,
          governancePrepared.transactionBase64,
          {
            rpcUrl: governancePrepared.rpcUrl,
            recentBlockhash: governancePrepared.recentBlockhash,
            lastValidBlockHeight: governancePrepared.lastValidBlockHeight,
          },
        );

        finalDao = await updateDao(
          createdDao.id,
          {
            defaultGovernanceAddress: governancePrepared.governanceAddress,
          },
          session.accessToken,
        );

        governanceResultSummary = ` Governance created (${governancePrepared.governanceAddress.slice(0, 8)}...) tx ${governanceSignature.slice(0, 12)}...`;
      } catch (governanceError) {
        setOnchainSuccess(
          `Realm + DAO created, but governance creation failed. You can create governance from the DAO card.`,
        );
        setOnchainError(
          governanceError instanceof Error ? governanceError.message : 'Governance creation step failed',
        );
        setDaos((prev) => [createdDao, ...prev.filter((item) => item.id !== createdDao.id)]);
        return;
      }

      setDaos((prev) => [finalDao, ...prev.filter((item) => item.id !== finalDao.id)]);
      setOnchainFieldErrors({});
      setOnchainName('');
      setOnchainDescription('');
      setOnchainCommunityMint('');
      setOnchainCouncilMint('');
      setOnchainSuccess(
        `On-chain Realm created (${prepared.realmAddress.slice(0, 8)}...) tx ${signature.slice(0, 12)}...${governanceResultSummary}`,
      );
    } catch (createDaoError) {
      const createDaoErrorMessage =
        createDaoError instanceof Error ? createDaoError.message : 'Unable to create on-chain DAO';
      const isRealmAlreadyExistsError =
        createDaoErrorMessage.includes('Realm with the given name and governing mints already exists') ||
        createDaoErrorMessage.includes('custom program error: 0x1f5');

      if (isRealmAlreadyExistsError) {
        setOnchainFieldErrors((current) => ({
          ...current,
          name: 'Realm name already exists on this governance program. Use a different DAO name.',
        }));
        setOnchainError('DAO name is already used on this governance program. Change the name and try again.');
        return;
      }

      const fieldErrors = toFieldErrors(createDaoError);
      const validationFieldErrors: FieldErrors<OnchainFieldErrorKey> = {};

      if (fieldErrors.name) {
        validationFieldErrors.name = fieldErrors.name;
      }

      if (fieldErrors.governanceProgramId) {
        validationFieldErrors.governanceProgramId = fieldErrors.governanceProgramId;
      }

      if (fieldErrors.authorityWallet) {
        validationFieldErrors.authorityWallet = fieldErrors.authorityWallet;
      }

      if (fieldErrors.communityMint) {
        validationFieldErrors.communityMint = fieldErrors.communityMint;
      }

      if (Object.keys(validationFieldErrors).length > 0) {
        setOnchainFieldErrors(validationFieldErrors);
      }

      setOnchainError(createDaoErrorMessage);
    } finally {
      setIsCreatingOnchain(false);
    }
  };

  const handleCreateCommunityMint = async (): Promise<void> => {
    setOnchainError(null);
    setOnchainSuccess(null);
    setMintFieldErrors({});

    if (!session?.accessToken) {
      setOnchainError('You must be authenticated to create a community mint.');
      return;
    }

    const parsedDecimals = Number(mintDecimals.trim());
    const nextFieldErrors: FieldErrors<MintFieldErrorKey> = {};

    if (!mintTokenName.trim()) {
      nextFieldErrors.name = 'Token name is required.';
    }

    if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 9) {
      nextFieldErrors.decimals = 'Decimals must be an integer between 0 and 9.';
    }

    if (!mintAuthorityWallet.trim()) {
      nextFieldErrors.authorityWallet = 'Mint authority wallet is required.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setMintFieldErrors(nextFieldErrors);
      setOnchainError('Please fill all required fields.');
      return;
    }

    setIsCreatingCommunityMint(true);

    try {
      const provider = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
      }

      const connectResult = await provider.connect();
      const connectedWallet = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

      if (!connectedWallet) {
        throw new Error('Wallet connection failed. Try reconnecting your wallet.');
      }

      const prepared = await prepareCommunityMint(
        {
          name: mintTokenName.trim(),
          network: onchainNetwork,
          authorityWallet: mintAuthorityWallet.trim() || undefined,
          decimals: parsedDecimals,
        },
        session.accessToken,
      );

      if (connectedWallet !== prepared.payerWallet) {
        throw new Error('Connected wallet must match the payer wallet to create community mint.');
      }

      const signature = await sendPreparedTransaction(
        provider,
        prepared.transactionMessage,
        prepared.transactionBase58,
        prepared.transactionBase64,
        {
          rpcUrl: prepared.rpcUrl,
          recentBlockhash: prepared.recentBlockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        },
      );

      setOnchainAuthorityWallet(prepared.authorityWallet);
      setMintAuthorityWallet(prepared.authorityWallet);
      setOnchainCommunityMint(prepared.mintAddress);
      setMintFieldErrors({});
      setOnchainSuccess(
        `Community mint created (${prepared.symbol}) ${prepared.mintAddress.slice(0, 8)}... Tx: ${signature.slice(0, 12)}...`,
      );
      setIsCommunityMintModalOpen(false);
    } catch (createMintError) {
      const fieldErrors = toFieldErrors(createMintError);
      const validationFieldErrors: FieldErrors<MintFieldErrorKey> = {};

      if (fieldErrors.name) {
        validationFieldErrors.name = fieldErrors.name;
      }

      if (fieldErrors.decimals) {
        validationFieldErrors.decimals = fieldErrors.decimals;
      }

      if (fieldErrors.authorityWallet) {
        validationFieldErrors.authorityWallet = fieldErrors.authorityWallet;
      }

      if (Object.keys(validationFieldErrors).length > 0) {
        setMintFieldErrors(validationFieldErrors);
      }

      setOnchainError(createMintError instanceof Error ? createMintError.message : 'Unable to create community mint');
    } finally {
      setIsCreatingCommunityMint(false);
    }
  };

  const openCommunityMintModal = (): void => {
    setOnchainError(null);
    setMintFieldErrors({});
    setMintTokenName((current) => current || onchainName.trim());
    setMintAuthorityWallet((current) => current || onchainAuthorityWallet.trim());
    setMintDecimals((current) => current || '6');
    setIsCommunityMintModalOpen(true);
  };

  return (
    <DashboardShell
      title="DAOs"
      description="Create a DAO end-to-end: Realm, DAO record, governance account, and native treasury."
    >
      <article className="data-card">
        <div className="data-card-header">
          <h3>DAO Setup</h3>
          {isSetupOpen ? <span className="status-chip">wallet-sign</span> : null}
        </div>
        {!isSetupOpen ? (
          <div className="auth-form">
            <p className="hint-text">Start by opening DAO setup and create end-to-end in one flow.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setIsSetupOpen(true);
              }}
            >
              Create DAO
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsSetupOpen(false)}
              disabled={isCreatingOnchain || isCreatingCommunityMint}
            >
              Close Setup
            </button>
            <label className="input-label">
              Name
              <input
                className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.name))}
                value={onchainName}
                onChange={(event) => {
                  setOnchainName(event.target.value);
                  setOnchainFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                minLength={2}
                aria-invalid={Boolean(onchainFieldErrors.name)}
                required
              />
              {onchainFieldErrors.name ? <span className="field-error">{onchainFieldErrors.name}</span> : null}
            </label>

            <label className="input-label">
              Network
              <select
                className="select-input"
                value={onchainNetwork}
                onChange={(event) => {
                  const nextNetwork = event.target.value as DaoNetwork;
                  setOnchainNetwork(nextNetwork);
                  setOnchainGovernanceProgramId((current) => resolveGovernanceProgramIdForNetwork(current, nextNetwork));
                }}
              >
                <option value="devnet">devnet</option>
                <option value="mainnet-beta">mainnet-beta</option>
              </select>
            </label>

            <label className="input-label">
              Governance Program ID
              <input
                className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.governanceProgramId))}
                value={onchainGovernanceProgramId}
                onChange={(event) => {
                  setOnchainGovernanceProgramId(event.target.value);
                  setOnchainFieldErrors((current) => ({ ...current, governanceProgramId: undefined }));
                }}
                aria-invalid={Boolean(onchainFieldErrors.governanceProgramId)}
                required
              />
              {onchainFieldErrors.governanceProgramId ? (
                <span className="field-error">{onchainFieldErrors.governanceProgramId}</span>
              ) : null}
            </label>

            <label className="input-label">
              Authority Wallet
              <input
                className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.authorityWallet))}
                value={onchainAuthorityWallet}
                onChange={(event) => {
                  setOnchainAuthorityWallet(event.target.value);
                  setOnchainFieldErrors((current) => ({ ...current, authorityWallet: undefined }));
                }}
                aria-invalid={Boolean(onchainFieldErrors.authorityWallet)}
                required
              />
              {onchainFieldErrors.authorityWallet ? (
                <span className="field-error">{onchainFieldErrors.authorityWallet}</span>
              ) : null}
            </label>

            <label className="input-label">
              Community Mint
              <div className="input-with-action">
                <input
                  className={withInputErrorClass('text-input', Boolean(onchainFieldErrors.communityMint))}
                  value={onchainCommunityMint}
                  onChange={(event) => {
                    setOnchainCommunityMint(event.target.value);
                    setOnchainFieldErrors((current) => ({ ...current, communityMint: undefined }));
                  }}
                  aria-invalid={Boolean(onchainFieldErrors.communityMint)}
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isCreatingOnchain || isCreatingCommunityMint}
                  onClick={() => {
                    openCommunityMintModal();
                  }}
                >
                  {isCreatingCommunityMint ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {onchainFieldErrors.communityMint ? <span className="field-error">{onchainFieldErrors.communityMint}</span> : null}
            </label>

            <label className="input-label">
              Council Mint (optional)
              <input className="text-input" value={onchainCouncilMint} onChange={(event) => setOnchainCouncilMint(event.target.value)} />
            </label>

            <label className="input-label">
              Description (optional)
              <textarea className="text-input" value={onchainDescription} onChange={(event) => setOnchainDescription(event.target.value)} />
            </label>

            <div className="dao-governance-config-form">
                <label className="input-label">
                  Preset
                  <select
                    className="select-input"
                    value={onchainGovernanceConfig.preset}
                    onChange={(event) => {
                      const nextPreset = event.target.value as GovernanceConfigPreset;
                      setOnchainGovernanceConfig((current) => {
                        if (nextPreset === 'custom') {
                          return { ...current, preset: 'custom' };
                        }

                        return governancePresetConfig(nextPreset, current.voteScope);
                      });
                    }}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="fast">Fast</option>
                    <option value="secure">Secure</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                <label className="input-label">
                  Vote scope
                  <select
                    className="select-input"
                    value={onchainGovernanceConfig.voteScope}
                    onChange={(event) => {
                      const nextScope = event.target.value as 'community' | 'council';
                      setOnchainGovernanceConfig((current) => {
                        if (current.preset === 'custom') {
                          return { ...current, voteScope: nextScope };
                        }

                        return governancePresetConfig(current.preset, nextScope);
                      });
                    }}
                  >
                    <option value="community">community</option>
                    <option value="council" disabled={!onchainCouncilMint.trim()}>
                      council{!onchainCouncilMint.trim() ? ' (requires council mint)' : ''}
                    </option>
                  </select>
                </label>

                <label className="input-label">
                  Community yes (%)
                  <input
                    className="text-input"
                    type="number"
                    min={1}
                    max={100}
                    value={onchainGovernanceConfig.communityYesVoteThresholdPercent}
                    onChange={(event) =>
                      setOnchainGovernanceConfig((current) => ({
                        ...current,
                        preset: 'custom',
                        communityYesVoteThresholdPercent: Math.max(
                          1,
                          Math.min(100, Number(event.target.value) || 1),
                        ),
                      }))
                    }
                  />
                </label>

                <label className="input-label">
                  Voting time (hours)
                  <input
                    className="text-input"
                    type="number"
                    min={1}
                    max={720}
                    value={onchainGovernanceConfig.baseVotingTimeHours}
                    onChange={(event) =>
                      setOnchainGovernanceConfig((current) => ({
                        ...current,
                        preset: 'custom',
                        baseVotingTimeHours: Math.max(1, Math.min(720, Number(event.target.value) || 1)),
                      }))
                    }
                  />
                </label>

                <label className="input-label">
                  Hold-up (hours)
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    max={720}
                    value={onchainGovernanceConfig.instructionHoldUpTimeHours}
                    onChange={(event) =>
                      setOnchainGovernanceConfig((current) => ({
                        ...current,
                        preset: 'custom',
                        instructionHoldUpTimeHours: Math.max(
                          0,
                          Math.min(720, Number(event.target.value) || 0),
                        ),
                      }))
                    }
                  />
                </label>

                <label className="input-label">
                  Vote tipping
                  <select
                    className="select-input"
                    value={onchainGovernanceConfig.voteTipping}
                    onChange={(event) =>
                      setOnchainGovernanceConfig((current) => ({
                        ...current,
                        preset: 'custom',
                        voteTipping: event.target.value as GovernanceVoteTipping,
                      }))
                    }
                  >
                    <option value="strict">strict</option>
                    <option value="early">early</option>
                    <option value="disabled">disabled</option>
                  </select>
                </label>
              </div>

            {onchainError ? <p className="error-text">{onchainError}</p> : null}
            {onchainSuccess ? <p className="success-text">{onchainSuccess}</p> : null}
            <button
              type="button"
              className="primary-button"
              disabled={isCreatingOnchain || isCreatingCommunityMint}
              onClick={() => {
                void handleCreateOnchainDao();
              }}
            >
              {isCreatingOnchain ? 'Creating DAO...' : 'Create DAO'}
            </button>
          </form>
        )}
      </article>

      {isCommunityMintModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Generate Community Mint">
          <form
            className="modal-card auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateCommunityMint();
            }}
          >
            <h3>Generate Community Mint</h3>
            <p>Create a governance token mint with your wallet signature. This mint address will auto-fill Community Mint.</p>

            <label className="input-label">
              Token Name
              <input
                className={withInputErrorClass('text-input', Boolean(mintFieldErrors.name))}
                value={mintTokenName}
                onChange={(event) => {
                  setMintTokenName(event.target.value);
                  setMintFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                minLength={2}
                maxLength={120}
                aria-invalid={Boolean(mintFieldErrors.name)}
                required
              />
              {mintFieldErrors.name ? <span className="field-error">{mintFieldErrors.name}</span> : null}
            </label>

            <label className="input-label">
              Decimals
              <input
                className={withInputErrorClass('text-input', Boolean(mintFieldErrors.decimals))}
                type="number"
                min={0}
                max={9}
                value={mintDecimals}
                onChange={(event) => {
                  setMintDecimals(event.target.value);
                  setMintFieldErrors((current) => ({ ...current, decimals: undefined }));
                }}
                aria-invalid={Boolean(mintFieldErrors.decimals)}
                required
              />
              {mintFieldErrors.decimals ? <span className="field-error">{mintFieldErrors.decimals}</span> : null}
            </label>

            <label className="input-label">
              Mint Authority Wallet
              <input
                className={withInputErrorClass('text-input', Boolean(mintFieldErrors.authorityWallet))}
                value={mintAuthorityWallet}
                onChange={(event) => {
                  setMintAuthorityWallet(event.target.value);
                  setMintFieldErrors((current) => ({ ...current, authorityWallet: undefined }));
                }}
                aria-invalid={Boolean(mintFieldErrors.authorityWallet)}
                required
              />
              {mintFieldErrors.authorityWallet ? (
                <span className="field-error">{mintFieldErrors.authorityWallet}</span>
              ) : null}
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isCreatingCommunityMint}
                onClick={() => setIsCommunityMintModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={isCreatingCommunityMint}>
                {isCreatingCommunityMint ? 'Generating...' : 'Create Mint'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isLoading ? <LoadingState message="Loading DAOs..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && daos.length === 0 ? <EmptyState message="No DAOs found yet." /> : null}

      {!isLoading && !error && daos.length > 0 ? (
        <div className="data-grid">
          {daos.map((dao) => {
            const governanceDraft =
              governanceConfigByDao[dao.id] ??
              governancePresetConfig('balanced', dao.councilMint ? 'council' : 'community');

            return (
              <article key={dao.id} className="data-card">
              <div className="data-card-header">
                <div>
                  <h3>{dao.name}</h3>
                  <p className="hint-text">Slug: {dao.slug}</p>
                </div>
                <span className="status-chip">{dao.network}</span>
              </div>
              {dao.description ? <p className="hint-text">{dao.description}</p> : null}

              <div className="dao-metric-grid">
                <div className="dao-metric-item">
                  <span>Auto execute</span>
                  <strong>{dao.automationConfig.autoExecuteEnabled ? 'Enabled' : 'Disabled'}</strong>
                </div>
                <div className="dao-metric-item">
                  <span>Max risk</span>
                  <strong>{dao.automationConfig.maxRiskScore}</strong>
                </div>
                <div className="dao-metric-item">
                  <span>Simulation</span>
                  <strong>{dao.automationConfig.requireSimulation ? 'Required' : 'Optional'}</strong>
                </div>
                <div className="dao-metric-item">
                  <span>Updated</span>
                  <strong>{formatDateTime(dao.updatedAt)}</strong>
                </div>
              </div>

              <div className="dao-address-grid">
                <div className="dao-address-item">
                  <span>Realm</span>
                  <a
                    href={getExplorerAddressUrl(dao.realmAddress, dao.network)}
                    target="_blank"
                    rel="noreferrer"
                    title={dao.realmAddress}
                  >
                    {shortAddress(dao.realmAddress, 6)}
                  </a>
                </div>
                <div className="dao-address-item">
                  <span>Governance Program</span>
                  <a
                    href={getExplorerAddressUrl(dao.governanceProgramId, dao.network)}
                    target="_blank"
                    rel="noreferrer"
                    title={dao.governanceProgramId}
                  >
                    {shortAddress(dao.governanceProgramId, 6)}
                  </a>
                </div>
                <div className="dao-address-item">
                  <span>Authority</span>
                  <a
                    href={getExplorerAddressUrl(dao.authorityWallet, dao.network)}
                    target="_blank"
                    rel="noreferrer"
                    title={dao.authorityWallet}
                  >
                    {shortAddress(dao.authorityWallet, 6)}
                  </a>
                </div>
              </div>

              <div className="dao-governance-config">
                <div className="dao-governance-config-head">
                  <span>Default governance account</span>
                  {dao.defaultGovernanceAddress ? (
                    <code title={dao.defaultGovernanceAddress}>{shortAddress(dao.defaultGovernanceAddress, 6)}</code>
                  ) : (
                    <span className="hint-text">Not set</span>
                  )}
                </div>

                {governanceErrorByDao[dao.id] ? <p className="error-text">{governanceErrorByDao[dao.id]}</p> : null}
                {governanceCreateErrorByDao[dao.id] ? (
                  <p className="error-text">{governanceCreateErrorByDao[dao.id]}</p>
                ) : null}
                {governanceCreateSuccessByDao[dao.id] ? (
                  <p className="success-text">{governanceCreateSuccessByDao[dao.id]}</p>
                ) : null}

                <div className="dao-governance-quick-actions">
                  <div className="dao-governance-config-form">
                    <label className="input-label">
                      Preset
                      <select
                        className="select-input"
                        value={governanceDraft.preset}
                        onChange={(event) => {
                          const nextPreset = event.target.value as GovernanceConfigPreset;
                          updateGovernanceConfigForDao(dao, (current) => {
                            if (nextPreset === 'custom') {
                              return { ...current, preset: 'custom' };
                            }

                            const nextScope = current.voteScope;
                            return governancePresetConfig(nextPreset, nextScope);
                          });
                        }}
                      >
                        <option value="balanced">Balanced</option>
                        <option value="fast">Fast</option>
                        <option value="secure">Secure</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label className="input-label">
                      Vote scope
                      <select
                        className="select-input"
                        value={governanceDraft.voteScope}
                        onChange={(event) => {
                          const nextScope = event.target.value as 'community' | 'council';
                          updateGovernanceConfigForDao(dao, (current) => {
                            if (current.preset === 'custom') {
                              return {
                                ...current,
                                voteScope: nextScope,
                              };
                            }

                            return governancePresetConfig(current.preset, nextScope);
                          });
                        }}
                      >
                        <option value="community">community</option>
                        <option value="council" disabled={!dao.councilMint}>
                          council{!dao.councilMint ? ' (no council mint)' : ''}
                        </option>
                      </select>
                    </label>
                    <label className="input-label">
                      Community yes (%)
                      <input
                        className="text-input"
                        type="number"
                        min={1}
                        max={100}
                        value={governanceDraft.communityYesVoteThresholdPercent}
                        onChange={(event) => {
                          updateGovernanceConfigForDao(dao, (current) => ({
                            ...current,
                            preset: 'custom',
                            communityYesVoteThresholdPercent: Math.max(
                              1,
                              Math.min(100, Number(event.target.value) || 1),
                            ),
                          }));
                        }}
                      />
                    </label>
                    <label className="input-label">
                      Voting time (hours)
                      <input
                        className="text-input"
                        type="number"
                        min={1}
                        max={720}
                        value={governanceDraft.baseVotingTimeHours}
                        onChange={(event) => {
                          updateGovernanceConfigForDao(dao, (current) => ({
                            ...current,
                            preset: 'custom',
                            baseVotingTimeHours: Math.max(1, Math.min(720, Number(event.target.value) || 1)),
                          }));
                        }}
                      />
                    </label>
                    <label className="input-label">
                      Hold-up (hours)
                      <input
                        className="text-input"
                        type="number"
                        min={0}
                        max={720}
                        value={governanceDraft.instructionHoldUpTimeHours}
                        onChange={(event) => {
                          updateGovernanceConfigForDao(dao, (current) => ({
                            ...current,
                            preset: 'custom',
                            instructionHoldUpTimeHours: Math.max(
                              0,
                              Math.min(720, Number(event.target.value) || 0),
                            ),
                          }));
                        }}
                      />
                    </label>
                    <label className="input-label">
                      Vote tipping
                      <select
                        className="select-input"
                        value={governanceDraft.voteTipping}
                        onChange={(event) => {
                          const next = event.target.value as GovernanceVoteTipping;
                          updateGovernanceConfigForDao(dao, (current) => ({
                            ...current,
                            preset: 'custom',
                            voteTipping: next,
                            councilVoteTipping: current.voteScope === 'council' ? next : current.councilVoteTipping,
                          }));
                        }}
                      >
                        <option value="strict">strict</option>
                        <option value="early">early</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </label>
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={Boolean(creatingGovernanceByDao[dao.id])}
                    onClick={() => {
                      void handleCreateGovernanceForDao(dao);
                    }}
                  >
                    {creatingGovernanceByDao[dao.id] ? 'Creating governance...' : 'Create governance + treasury'}
                  </button>
                  <span className="hint-text">Wallet-sign. Uses DAO authority wallet and the config above.</span>
                </div>

                {governancesByDao[dao.id] ? (
                  <div className="dao-governance-config-controls">
                    <select
                      className="select-input"
                      value={selectedDefaultGovernanceByDao[dao.id] ?? ''}
                      onChange={(event) =>
                        setSelectedDefaultGovernanceByDao((current) => ({
                          ...current,
                          [dao.id]: event.target.value,
                        }))
                      }
                      disabled={Boolean(savingDefaultGovernanceByDao[dao.id])}
                    >
                      {governancesByDao[dao.id].length === 0 ? (
                        <option value="">No governance accounts found</option>
                      ) : null}
                      {governancesByDao[dao.id].map((item) => (
                        <option key={item.address} value={item.address}>
                          {item.address}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(savingDefaultGovernanceByDao[dao.id]) || !selectedDefaultGovernanceByDao[dao.id]}
                      onClick={() => {
                        void handleSetDefaultGovernance(dao, selectedDefaultGovernanceByDao[dao.id] || null);
                      }}
                    >
                      {savingDefaultGovernanceByDao[dao.id] ? 'Saving...' : 'Set default'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(savingDefaultGovernanceByDao[dao.id])}
                      onClick={() => {
                        void handleSetDefaultGovernance(dao, null);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      void loadGovernancesForDao(dao.id);
                    }}
                    disabled={Boolean(governanceLoadingByDao[dao.id])}
                  >
                    {governanceLoadingByDao[dao.id] ? 'Loading...' : 'Load governance accounts'}
                  </button>
                )}
              </div>

              <div className="dao-card-actions">
                <a
                  className="secondary-button"
                  href={getRealmDetailUrl(dao.realmAddress, dao.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Realms
                </a>
                <a
                  className="secondary-button"
                  href={getExplorerAddressUrl(dao.realmAddress, dao.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Realm on Explorer
                </a>
              </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </DashboardShell>
  );
};
