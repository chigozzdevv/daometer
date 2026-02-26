const actions = [
    {
        color: 'action-card--yellow',
        title: 'Monitor →',
        description: 'Track proposal states in real time. Get notified on state transitions across your Realms DAOs.',
    },
    {
        color: 'action-card--pink',
        title: 'Automate →',
        description: 'Compose automation blocks with risk checks, timing windows, and execution conditions.',
    },
    {
        color: 'action-card--green',
        title: 'Execute →',
        description: 'Publish and execute governance actions reliably. Retries, holds, and audit logs included.',
    },
];

export const ActionCardsSection = (): JSX.Element => (
    <div className="action-cards">
        {actions.map((action) => (
            <div key={action.title} className={`action-card ${action.color}`}>
                <p className="action-card-title">{action.title}</p>
                <p>{action.description}</p>
            </div>
        ))}
    </div>
);
