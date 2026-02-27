import type { DaoItem } from '@/features/dashboard/api/api';

type DaoSelectProps = {
  daos: DaoItem[];
  selectedDaoId: string | null;
  onSelect: (daoId: string) => void;
  label?: string;
};

export const DaoSelect = ({
  daos,
  selectedDaoId,
  onSelect,
  label = 'DAO',
}: DaoSelectProps): JSX.Element | null => {
  if (daos.length === 0) {
    return null;
  }

  return (
    <label className="select-field">
      <span>{label}</span>
      <select
        value={selectedDaoId ?? daos[0].id}
        onChange={(event) => onSelect(event.target.value)}
        className="select-input"
      >
        {daos.map((dao) => (
          <option key={dao.id} value={dao.id}>
            {dao.name}
          </option>
        ))}
      </select>
    </label>
  );
};
