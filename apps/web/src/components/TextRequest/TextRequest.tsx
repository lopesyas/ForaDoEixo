import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

interface Props {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  describedBy?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/** Campo que cresce com o texto: nada de frase cortada. Enter envia; Shift+Enter quebra linha. */
export function TextRequest({ id, label, value, placeholder, describedBy, onChange, onSubmit }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        className="field field--area"
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </>
  );
}
