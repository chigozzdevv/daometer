type MetricCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'warning';
};

export const MetricCard = ({ label, value, tone = 'default' }: MetricCardProps): JSX.Element => (
  <article className={`metric-card${tone === 'accent' ? ' metric-card-accent' : tone === 'warning' ? ' metric-card--warning' : ''}`}>
    <p>{label}</p>
    <h3>{value}</h3>
  </article>
);
