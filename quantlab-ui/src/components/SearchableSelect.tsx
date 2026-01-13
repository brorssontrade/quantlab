import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";

export type SearchableOption = {
  value: string;
  label?: string;
  description?: string;
};

export interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputPlaceholder?: string;
  emptyMessage?: string;
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
  onSelectOption?: (option: SearchableOption) => void;
  onSubmit?: (value: string) => void;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  inputPlaceholder,
  emptyMessage = "No matches",
  allowFreeText = true,
  disabled = false,
  className = "",
  onSelectOption,
  onSubmit,
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const filtered = useMemo(() => {
    if (!value) return options.slice(0, 50);
    const query = normalize(value);
    return options
      .filter((option) => {
        const haystack = `${option.value} ${option.label ?? ""} ${option.description ?? ""}`;
        return normalize(haystack).includes(query);
      })
      .slice(0, 50);
  }, [options, value]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setHighlighted(0);
    }
  }, [open, filtered.length]);

  const handleSelect = useCallback(
    (option: SearchableOption) => {
      if (disabled) return;
      onChange(option.value);
      if (onSelectOption) {
        onSelectOption(option);
      }
      setOpen(false);
      requestAnimationFrame(() => {
        inputRef.current?.blur();
      });
    },
    [disabled, onChange, onSelectOption],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      onChange(event.target.value);
      setOpen(true);
    },
    [disabled, onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          setOpen(true);
          event.preventDefault();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((prev) => {
          if (filtered.length === 0) return 0;
          return (prev + 1) % filtered.length;
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((prev) => {
          if (filtered.length === 0) return 0;
          return (prev - 1 + filtered.length) % filtered.length;
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (filtered.length > 0 && filtered[highlighted]) {
          handleSelect(filtered[highlighted]);
        } else if (allowFreeText) {
          const trimmed = value.trim();
          if (trimmed) {
            if (onSubmit) {
              onSubmit(trimmed);
            } else {
              onChange(trimmed);
            }
          }
          setOpen(false);
          requestAnimationFrame(() => {
            inputRef.current?.blur();
          });
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    },
    [allowFreeText, filtered, handleSelect, highlighted, onChange, onSubmit, open, value],
  );

  const handleClear = useCallback(() => {
    if (disabled) return;
    onChange("");
    setOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [disabled, onChange]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded border bg-white px-2 ${disabled ? "border-slate-200 text-slate-400" : "border-slate-300 text-slate-700"} focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400`}
      >
        <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          value={value}
          onChange={handleInputChange}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder ?? placeholder ?? "Search"}
          disabled={disabled}
          autoComplete="off"
        />
        {value && !disabled ? (
          <button
            type="button"
            className="text-slate-400 transition hover:text-slate-600"
            onClick={handleClear}
            aria-label="Clear value"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">{emptyMessage}</div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1 text-sm">
              {filtered.map((option, index) => {
                const active = index === highlighted;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${
                        active ? "bg-slate-100" : ""
                      }`}
                      onMouseEnter={() => setHighlighted(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelect(option);
                      }}
                    >
                      <span className="font-medium text-slate-700">{option.label ?? option.value}</span>
                      {option.description ? (
                        <span className="text-xs text-slate-500">{option.description}</span>
                      ) : null}
                      {option.label && option.label !== option.value ? (
                        <span className="text-[11px] uppercase tracking-wide text-slate-400">{option.value}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
