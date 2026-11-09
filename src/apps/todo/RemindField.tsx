import { addDays, addMonths } from './model';
import { useTt } from './strings';

/** A reminder date: quick picks (tomorrow, next week, next month, none) and a date field for anything else. */
export function RemindField({
  label,
  value,
  onChange,
  today,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  today: string;
}) {
  const tt = useTt();
  const picks: { label: string; v: string | null }[] = [
    { label: tt('tomorrow'), v: addDays(today, 1) },
    { label: tt('nextWeek'), v: addDays(today, 7) },
    { label: tt('nextMonth'), v: addMonths(today, 1) },
    { label: tt('noReminder'), v: null },
  ];
  return (
    <div className="todo-remind">
      <label className="todo-field">
        <span>{label}</span>
        <input
          type="date"
          value={value ?? ''}
          min={addDays(today, 1)}
          onChange={(e) => onChange(e.target.value || null)}
          dir="ltr"
        />
      </label>
      <div className="todo-picks">
        {picks.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`chip sm${p.v === value ? ' on' : ''}`}
            onClick={() => onChange(p.v)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
