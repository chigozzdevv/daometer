import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/auth-provider';
import {
  getAuthProfile,
  getDaos,
  prepareMintAuthorityTx,
  prepareMintDistributionTx,
  prepareVotingDelegateTx,
  prepareVotingDepositTx,
  prepareVotingWithdrawTx,
  type DaoItem,
} from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { getSolanaProvider, sendPreparedTransaction } from '@/shared/solana/wallet';

const shortAddress = (value: string): string => `${value.slice(0, 6)}...${value.slice(-6)}`;

export const DashboardGovernancePage = (): JSX.Element => {
  const { session } = useAuth();
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [actorWallet, setActorWallet] = useState('');

  const [tokenMint, setTokenMint] = useState('');
  const [mintRecipientWallet, setMintRecipientWallet] = useState('');
  const [mintAmount, setMintAmount] = useState('100');
  const [mintDecimals, setMintDecimals] = useState('6');
  const [newMintAuthorityWallet, setNewMintAuthorityWallet] = useState('');

  const [voteScope, setVoteScope] = useState<'community' | 'council'>('community');
  const [governingMintOverride, setGoverningMintOverride] = useState('');
  const [depositAmount, setDepositAmount] = useState('10');
  const [depositDecimals, setDepositDecimals] = useState('6');
  const [delegateWallet, setDelegateWallet] = useState('');

  const selectedDao = useMemo(
    () => daos.find((dao) => dao.id === selectedDaoId) ?? null,
    [daos, selectedDaoId],
  );

  const effectiveGoverningMint = useMemo(() => {
    if (governingMintOverride.trim()) {
      return governingMintOverride.trim();
    }

    if (!selectedDao) {
      return '';
    }

    if (voteScope === 'council') {
      return selectedDao.councilMint ?? '';
    }

    return selectedDao.communityMint ?? '';
  }, [governingMintOverride, selectedDao, voteScope]);

  useEffect(() => {
    let isMounted = true;

    const load = async (): Promise<void> => {
      if (!session?.accessToken) {
        setError('Sign in to manage governance.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [profile, loadedDaos] = await Promise.all([
          getAuthProfile(session.accessToken),
          getDaos({ limit: 100 }),
        ]);

        if (!isMounted) {
          return;
        }

        setActorWallet(profile.walletAddress);
        setDaos(loadedDaos);
        setSelectedDaoId((current) => current ?? loadedDaos[0]?.id ?? null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load governance context');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!selectedDao) {
      return;
    }

    setTokenMint((current) => current || selectedDao.communityMint || '');
    setNewMintAuthorityWallet((current) => current || selectedDao.authorityWallet);
    setVoteScope(selectedDao.councilMint ? 'council' : 'community');
  }, [selectedDao]);

  const getConnectedWallet = async (): Promise<{
    walletAddress: string;
    send: (tx: {
      transactionMessage: string;
      transactionBase58: string;
      transactionBase64: string;
    }) => Promise<string>;
  }> => {
    const provider = getSolanaProvider();

    if (!provider) {
      throw new Error('No Solana wallet detected. Install Phantom or another wallet extension.');
    }

    const connectResult = await provider.connect();
    const walletAddress = connectResult.publicKey?.toBase58() ?? provider.publicKey?.toBase58();

    if (!walletAddress) {
      throw new Error('Wallet connection failed. Try reconnecting your wallet.');
    }

    return {
      walletAddress,
      send: async (tx) =>
        sendPreparedTransaction(provider, tx.transactionMessage, tx.transactionBase58, tx.transactionBase64),
    };
  };

  const withSubmit = async (runner: () => Promise<void>): Promise<void> => {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await runner();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardShell
      title="Governance"
      description="Mint/distribute governance tokens, manage mint authority, and control voting power (deposit, withdraw, delegate)."
    >
      <DaoSelect daos={daos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {isLoading ? <LoadingState message="Loading governance..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && daos.length === 0 ? <EmptyState message="No DAOs found yet." /> : null}
      {success ? <p className="success-text">{success}</p> : null}

      {!isLoading && !error && selectedDao ? (
        <>
          <article className="flow-step-card">
            <header className="flow-step-head">
              <span className="flow-step-index">Token</span>
              <div>
                <h2>Governance Token</h2>
                <p>Mint and distribute governance tokens, then manage mint authority.</p>
              </div>
            </header>

            <div className="form-grid two-col">
              <label className="input-label">
                Governance mint
                <input className="text-input" value={tokenMint} onChange={(event) => setTokenMint(event.target.value)} />
              </label>
              <label className="input-label">
                Recipient wallet
                <input
                  className="text-input"
                  value={mintRecipientWallet}
                  onChange={(event) => setMintRecipientWallet(event.target.value)}
                />
              </label>
              <label className="input-label">
                Amount
                <input className="text-input" value={mintAmount} onChange={(event) => setMintAmount(event.target.value)} />
              </label>
              <label className="input-label">
                Decimals
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  max={12}
                  value={mintDecimals}
                  onChange={(event) => setMintDecimals(event.target.value)}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={isSubmitting || !session?.accessToken}
                onClick={() => {
                  if (!session?.accessToken || !selectedDaoId) {
                    setError('Sign in and select a DAO first.');
                    return;
                  }

                  void withSubmit(async () => {
                    if (!tokenMint.trim() || !mintRecipientWallet.trim()) {
                      throw new Error('Governance mint and recipient wallet are required.');
                    }

                    const wallet = await getConnectedWallet();
                    const prepared = await prepareMintDistributionTx(
                      selectedDaoId,
                      {
                        mintAddress: tokenMint.trim(),
                        recipientWallet: mintRecipientWallet.trim(),
                        amount: mintAmount.trim(),
                        decimals: Number(mintDecimals),
                        authorityWallet: wallet.walletAddress,
                        payerWallet: wallet.walletAddress,
                        createAssociatedTokenAccount: true,
                      },
                      session.accessToken,
                    );
                    const signature = await wallet.send(prepared);

                    setSuccess(
                      `Minted ${prepared.amount} tokens to ${shortAddress(prepared.recipientWallet)}. Tx: ${shortAddress(signature)}`,
                    );
                  });
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Mint + Distribute'}
              </button>
            </div>

            <div className="form-grid two-col">
              <label className="input-label">
                New mint authority wallet
                <input
                  className="text-input"
                  value={newMintAuthorityWallet}
                  onChange={(event) => setNewMintAuthorityWallet(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSubmitting || !session?.accessToken}
                  onClick={() => {
                    if (!session?.accessToken || !selectedDaoId) {
                      setError('Sign in and select a DAO first.');
                      return;
                    }

                    void withSubmit(async () => {
                      if (!tokenMint.trim()) {
                        throw new Error('Governance mint is required.');
                      }

                      const wallet = await getConnectedWallet();
                      const prepared = await prepareMintAuthorityTx(
                        selectedDaoId,
                        {
                          mintAddress: tokenMint.trim(),
                          currentAuthorityWallet: wallet.walletAddress,
                          newAuthorityWallet: newMintAuthorityWallet.trim() || null,
                        },
                        session.accessToken,
                      );
                      const signature = await wallet.send(prepared);

                      setSuccess(`Mint authority updated. Tx: ${shortAddress(signature)}`);
                    });
                  }}
                >
                  {isSubmitting ? 'Submitting...' : 'Update Mint Authority'}
                </button>
              </div>
            </div>
          </article>

          <article className="flow-step-card">
            <header className="flow-step-head">
              <span className="flow-step-index">Voting</span>
              <div>
                <h2>Voting Power</h2>
                <p>Deposit governing tokens, withdraw when unlocked, and delegate voting authority.</p>
              </div>
            </header>

            <div className="form-grid two-col">
              <label className="input-label">
                Vote scope
                <select className="select-input" value={voteScope} onChange={(event) => setVoteScope(event.target.value as 'community' | 'council')}>
                  <option value="community">community</option>
                  <option value="council" disabled={!selectedDao.councilMint}>
                    council
                  </option>
                </select>
              </label>
              <label className="input-label">
                Governing mint override (optional)
                <input
                  className="text-input"
                  value={governingMintOverride}
                  onChange={(event) => setGoverningMintOverride(event.target.value)}
                  placeholder={effectiveGoverningMint || 'Auto from DAO'}
                />
              </label>
              <label className="input-label">
                Deposit amount
                <input className="text-input" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
              </label>
              <label className="input-label">
                Decimals
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  max={12}
                  value={depositDecimals}
                  onChange={(event) => setDepositDecimals(event.target.value)}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={isSubmitting || !session?.accessToken}
                onClick={() => {
                  if (!session?.accessToken || !selectedDaoId) {
                    setError('Sign in and select a DAO first.');
                    return;
                  }

                  void withSubmit(async () => {
                    if (!effectiveGoverningMint) {
                      throw new Error('No governing mint available for this scope.');
                    }

                    const wallet = await getConnectedWallet();
                    const prepared = await prepareVotingDepositTx(
                      selectedDaoId,
                      {
                        voteScope,
                        governingTokenMint: effectiveGoverningMint,
                        amount: depositAmount.trim(),
                        decimals: Number(depositDecimals),
                        governingTokenOwnerWallet: wallet.walletAddress,
                        payerWallet: wallet.walletAddress,
                        programVersion: 3,
                      },
                      session.accessToken,
                    );
                    const signature = await wallet.send(prepared);

                    setSuccess(`Voting power deposited. Tx: ${shortAddress(signature)}`);
                  });
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Deposit Governing Tokens'}
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={isSubmitting || !session?.accessToken}
                onClick={() => {
                  if (!session?.accessToken || !selectedDaoId) {
                    setError('Sign in and select a DAO first.');
                    return;
                  }

                  void withSubmit(async () => {
                    if (!effectiveGoverningMint) {
                      throw new Error('No governing mint available for this scope.');
                    }

                    const wallet = await getConnectedWallet();
                    const prepared = await prepareVotingWithdrawTx(
                      selectedDaoId,
                      {
                        voteScope,
                        governingTokenMint: effectiveGoverningMint,
                        governingTokenOwnerWallet: wallet.walletAddress,
                        payerWallet: wallet.walletAddress,
                        createDestinationAta: true,
                        programVersion: 3,
                      },
                      session.accessToken,
                    );
                    const signature = await wallet.send(prepared);

                    setSuccess(`Governing tokens withdrawn. Tx: ${shortAddress(signature)}`);
                  });
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Withdraw Governing Tokens'}
              </button>
            </div>

            <div className="form-grid two-col">
              <label className="input-label">
                Delegate wallet (leave empty to clear)
                <input className="text-input" value={delegateWallet} onChange={(event) => setDelegateWallet(event.target.value)} />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSubmitting || !session?.accessToken}
                  onClick={() => {
                    if (!session?.accessToken || !selectedDaoId) {
                      setError('Sign in and select a DAO first.');
                      return;
                    }

                    void withSubmit(async () => {
                      if (!effectiveGoverningMint) {
                        throw new Error('No governing mint available for this scope.');
                      }

                      const wallet = await getConnectedWallet();
                      const prepared = await prepareVotingDelegateTx(
                        selectedDaoId,
                        {
                          voteScope,
                          governingTokenMint: effectiveGoverningMint,
                          governingTokenOwnerWallet: wallet.walletAddress,
                          newDelegateWallet: delegateWallet.trim() || null,
                          programVersion: 3,
                        },
                        session.accessToken,
                      );
                      const signature = await wallet.send(prepared);

                      setSuccess(
                        delegateWallet.trim()
                          ? `Delegate set to ${shortAddress(delegateWallet.trim())}. Tx: ${shortAddress(signature)}`
                          : `Delegate cleared. Tx: ${shortAddress(signature)}`,
                      );
                    });
                  }}
                >
                  {isSubmitting ? 'Submitting...' : 'Update Delegate'}
                </button>
              </div>
            </div>
          </article>

          <p className="hint-text">Connected wallet: {actorWallet || 'Not connected'}</p>
        </>
      ) : null}
    </DashboardShell>
  );
};
