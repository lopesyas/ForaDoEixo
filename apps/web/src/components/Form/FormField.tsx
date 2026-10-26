import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

/** Rótulo sempre visível (nada de placeholder como rótulo), dica antes de errar e erro dito em palavras. */
export function FormField({ id, label, hint, error, ...input }: Props) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      )}
      <input
        id={id}
        className="field"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        {...input}
      />
      <p id={errorId} className="form-field__error" aria-live="polite">
        {error ? `⚠ ${error}` : ''}
      </p>
    </div>
  );
}
