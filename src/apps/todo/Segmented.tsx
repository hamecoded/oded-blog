export interface SegOption<T> {
  value: T;
  label: string;
  /** Longer name, for the tooltip and screen readers. */
  title?: string;
}

/** A row of buttons, one of them chosen. Wraps on narrow screens. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  tone,
}: {
  label: string;
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  /** Colours the chosen button by its level (priority/urgency). */
  tone?: 'level';
}) {
  return (
    <div className={`todo-seg${tone ? ` tone-${tone}` : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : undefined}
          data-level={o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
