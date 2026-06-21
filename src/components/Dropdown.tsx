import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

type DropdownProps<TValue extends string = string> = {
  value: TValue;
  options: DropdownOption<TValue>[];
  onChange: (value: TValue) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

export default function Dropdown<TValue extends string = string>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  placeholder = "Select",
  ariaLabel,
}: DropdownProps<TValue>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectOption(nextValue: TValue) {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <div
      className={["app-dropdown", open ? "open" : "", className]
        .filter(Boolean)
        .join(" ")}
      ref={rootRef}
    >
      <button
        type="button"
        className="app-dropdown-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="app-dropdown-menu" role="listbox" id={listboxId}>
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                type="button"
                className={selected ? "selected" : ""}
                role="option"
                aria-selected={selected}
                key={option.value}
                onClick={() => selectOption(option.value)}
              >
                <span>{option.label}</span>
                {selected && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
