type MetricCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent';
};

export const MetricCard = ({ label, value, tone = 'default' }: MetricCardProps): JSX.Element => (
  <article className={`metric-card${tone === 'accent' ? ' metric-card-accent' : ''}`}>
    <p>{label}</p>
    <h3>{value}</h3>
  </article>
);
