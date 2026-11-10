import { useEffect, useRef, useState } from 'react';

/**
 * A custom select component with rounded corners for both trigger and dropdown options.
 * Unlike native <select>, the dropdown options can be styled with rounded corners.
 */
export default function Select({ value, options, disabled, placeholder, onChange }: {
  value: string;
  options: { id: string; name: string }[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const expanded = open && !disabled;
  const selected = options.find(option => option.id === value);

  useEffect(() => {
    if (!expanded) return;
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [expanded]);

  return (
    <div ref={root} className="relative" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={trigger} type="button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => setOpen(!open)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }}>
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>{selected?.name || placeholder || '请选择'}</span>
        <span aria-hidden="true" className="text-gray-400 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div ref={list} role="listbox"
        className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto p-2 space-y-1 bg-white border border-gray-200 rounded-xl shadow-lg"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
          const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          let next: number | undefined;
          if (event.key === 'ArrowDown') next = (index + 1) % items.length;
          if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = items.length - 1;
          if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
        }}>
        {options.map(option => <button key={option.id} type="button" role="option" aria-selected={option.id === value}
          tabIndex={option.id === value ? 0 : -1}
          className={`relative flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-500 ${option.id === value ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-100'}`}
          onClick={() => { onChange(option.id); setOpen(false); trigger.current?.focus(); }}>
          {option.id === value && (
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="flex-1">{option.name}</span>
        </button>)}
      </div>}
    </div>
  );
}