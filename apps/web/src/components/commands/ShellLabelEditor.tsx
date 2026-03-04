import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";

interface ShellLabelEditorProps {
  label: string;
  onChange: (label: string) => void;
}

export function ShellLabelEditor({ label, onChange }: ShellLabelEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) {
      onChange(trimmed);
    } else {
      setDraft(label);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(label);
            setEditing(false);
          }
        }}
        className="rounded border border-input bg-background px-1.5 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        style={{ width: `${Math.max(draft.length, 8)}ch` }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(label);
        setEditing(true);
      }}
      className="group flex items-center gap-1.5 text-sm font-medium hover:text-primary"
    >
      <span className="truncate max-w-[200px]">{label}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}
