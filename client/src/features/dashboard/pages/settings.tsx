import { useEffect, useMemo, useState } from 'react';
import { getDaos, type DaoItem } from '@/features/dashboard/api/api';
import { DaoSelect } from '@/features/dashboard/components/dao-select';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';

export const DashboardSettingsPage = (): JSX.Element => {
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDaos = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const items = await getDaos({ limit: 100 });

        if (!isMounted) {
          return;
        }

        setDaos(items);
        setSelectedDaoId((current) => current ?? items[0]?.id ?? null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load DAO settings');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadDaos();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedDao = useMemo(
    () => (selectedDaoId ? daos.find((dao) => dao.id === selectedDaoId) ?? null : null),
    [daos, selectedDaoId],
  );

  return (
    <DashboardShell
      title="Settings"
      description="Live automation policy pulled from DAO-level backend configuration."
    >
      <DaoSelect daos={daos} selectedDaoId={selectedDaoId} onSelect={setSelectedDaoId} />

      {isLoading ? <LoadingState message="Loading DAO settings..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && !selectedDao ? <EmptyState message="No DAO configuration found." /> : null}

      {!isLoading && !error && selectedDao ? (
        <div className="data-grid">
          <article className="data-card">
            <div className="data-card-header">
              <h3>{selectedDao.name}</h3>
              <span className="status-chip">{selectedDao.network}</span>
            </div>
            <dl>
              <div>
                <dt>Auto execute enabled</dt>
                <dd>{selectedDao.automationConfig.autoExecuteEnabled ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Max risk score</dt>
                <dd>{selectedDao.automationConfig.maxRiskScore}</dd>
              </div>
              <div>
                <dt>Require simulation</dt>
                <dd>{selectedDao.automationConfig.requireSimulation ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Governance program</dt>
                <dd>{selectedDao.governanceProgramId}</dd>
              </div>
              <div>
                <dt>Authority wallet</dt>
                <dd>{selectedDao.authorityWallet}</dd>
              </div>
            </dl>
          </article>
        </div>
      ) : null}
    </DashboardShell>
  );
};
