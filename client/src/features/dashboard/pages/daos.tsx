import { useEffect, useState } from 'react';
import { getDaos, type DaoItem } from '@/features/dashboard/api/api';
import { DashboardShell } from '@/features/dashboard/components/shell';
import { EmptyState, ErrorState, LoadingState } from '@/features/dashboard/components/state';
import { formatDateTime, shortAddress } from '@/features/dashboard/lib/format';

export const DashboardDaosPage = (): JSX.Element => {
  const [daos, setDaos] = useState<DaoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const items = await getDaos({ limit: 100 });

        if (!isMounted) {
          return;
        }

        setDaos(items);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Unable to load DAOs');
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
  }, []);

  return (
    <DashboardShell title="DAOs" description="DAO registry, governance addresses, and automation policy settings.">
      {isLoading ? <LoadingState message="Loading DAOs..." /> : null}
      {!isLoading && error ? <ErrorState message={error} /> : null}
      {!isLoading && !error && daos.length === 0 ? <EmptyState message="No DAOs found yet." /> : null}

      {!isLoading && !error && daos.length > 0 ? (
        <div className="data-grid">
          {daos.map((dao) => (
            <article key={dao.id} className="data-card">
              <div className="data-card-header">
                <h3>{dao.name}</h3>
                <span className="status-chip">{dao.network}</span>
              </div>
              <dl>
                <div>
                  <dt>Slug</dt>
                  <dd>{dao.slug}</dd>
                </div>
                <div>
                  <dt>Realm</dt>
                  <dd title={dao.realmAddress}>{shortAddress(dao.realmAddress, 6)}</dd>
                </div>
                <div>
                  <dt>Governance Program</dt>
                  <dd title={dao.governanceProgramId}>{shortAddress(dao.governanceProgramId, 6)}</dd>
                </div>
                <div>
                  <dt>Authority</dt>
                  <dd title={dao.authorityWallet}>{shortAddress(dao.authorityWallet, 6)}</dd>
                </div>
                <div>
                  <dt>Auto execute</dt>
                  <dd>{dao.automationConfig.autoExecuteEnabled ? 'Enabled' : 'Disabled'}</dd>
                </div>
                <div>
                  <dt>Max risk score</dt>
                  <dd>{dao.automationConfig.maxRiskScore}</dd>
                </div>
                <div>
                  <dt>Require simulation</dt>
                  <dd>{dao.automationConfig.requireSimulation ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(dao.updatedAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
};
