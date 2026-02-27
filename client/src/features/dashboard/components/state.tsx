import type { PropsWithChildren } from 'react';

type InfoCardProps = PropsWithChildren<{
  title: string;
  tone?: 'neutral' | 'error';
}>;

const cardClassByTone: Record<NonNullable<InfoCardProps['tone']>, string> = {
  neutral: 'info-card',
  error: 'info-card info-card-error',
};

const InfoCard = ({ title, children, tone = 'neutral' }: InfoCardProps): JSX.Element => (
  <article className={cardClassByTone[tone]}>
    <h3>{title}</h3>
    {children ? <p>{children}</p> : null}
  </article>
);

export const LoadingState = ({ message = 'Loading data...' }: { message?: string }): JSX.Element => (
  <InfoCard title="Loading">{message}</InfoCard>
);

export const EmptyState = ({ message }: { message: string }): JSX.Element => <InfoCard title="No data">{message}</InfoCard>;

export const ErrorState = ({ message }: { message: string }): JSX.Element => (
  <InfoCard title="Request failed" tone="error">
    {message}
  </InfoCard>
);
