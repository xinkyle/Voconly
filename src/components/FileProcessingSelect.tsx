import { useEffect, useRef, useState } from 'react';

/** Matches the ASR precision picker: gray trigger, blue selected row and radio indicator. */
export default function FileProcessingSelect({ value, options, disabled, label, title, onChange }: {
  value: string;
  options: { id: string; name: string }[];
  disabled: boolean;
  label: string;
  title: string;
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
    <div ref={root} className="relative min-w-0 max-w-full sm:ml-auto" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={trigger} type="button" disabled={disabled} aria-label={`${label}：${selected?.name || ''}`}
        aria-haspopup="listbox" aria-expanded={expanded} title={title}
        className="flex items-center gap-1.5 max-w-full px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => setOpen(!open)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }}>
        <span className="truncate">{selected?.name}</span>
        <span aria-hidden="true" className="text-gray-400 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div ref={list} role="listbox" aria-label={label}
        className="absolute left-0 sm:left-auto sm:right-0 z-30 mt-1 min-w-max max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto p-2 space-y-1 bg-white border border-gray-200 rounded-lg shadow-lg"
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
          className={`relative flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-500 ${option.id === value ? 'bg-gray-100 border border-gray-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}
          onClick={() => { onChange(option.id); setOpen(false); trigger.current?.focus(); }}>
          <span aria-hidden="true" className={`w-3 h-3 shrink-0 rounded-full border-2 flex items-center justify-center ${option.id === value ? 'border-gray-600 bg-gray-600' : 'border-gray-300'}`}>
            {option.id === value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
          </span>
          <span className="font-medium text-gray-700 break-words min-w-0">{option.name}</span>
        </button>)}
      </div>}
    </div>
  );
}
