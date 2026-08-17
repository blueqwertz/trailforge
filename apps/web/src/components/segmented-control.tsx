'use client';

import { useId } from 'react';

/**
 * Auswahl aus wenigen gleichrangigen Möglichkeiten.
 *
 * Umgesetzt als Radiogruppe statt als Knopfreihe: damit funktionieren
 * Pfeiltasten, Screenreader kennen die Anzahl der Optionen, und die Auswahl
 * lässt sich in einem Formular abschicken.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Wird als Titel und für Hilfstechnik ergänzt. */
  description?: string;
  icon?: React.ReactNode;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 4;
}) {
  const name = useId();

  return (
    <fieldset>
      <legend className="text-ink-faint mb-2 text-[11px] font-medium uppercase tracking-[0.08em]">
        {label}
      </legend>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const checked = option.value === value;

          return (
            <label
              key={option.value}
              title={option.description}
              data-checked={checked || undefined}
              className="hover:bg-hover data-checked:border-[var(--accent)] data-checked:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] data-checked:text-[var(--accent)] data-checked:font-medium has-[:focus-visible]:outline-ink group flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-[13px] leading-none transition-colors duration-150 ease-[var(--ease-ui)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                // Das umschließende Label genügt der Spezifikation, aber
                // Werkzeuge lasen stattdessen den technischen Wert vor.
                aria-label={option.label}
                {...(option.description ? { 'aria-description': option.description } : {})}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.icon ? (
                <span className="text-ink-muted group-data-checked:text-[var(--accent)] shrink-0">
                  {option.icon}
                </span>
              ) : null}
              <span className="truncate">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
