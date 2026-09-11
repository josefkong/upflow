"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { CustomFieldDefinition, TaskAssignee } from "@/lib/types";
import { validateCustomFieldValue } from "@/lib/custom-field-validator";
import { useLanguage } from "@/components/language-provider";

interface Props {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  users?: TaskAssignee[];
  compact?: boolean;
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5";

const errorCls = "border-destructive focus:ring-destructive";

/**
 * Wrap an onChange so we run the shared validator first. If invalid, we keep
 * the user's raw input visible (via local state) and surface the error inline
 * instead of bubbling a bad value to the server.
 */
function useValidated(
  definition: CustomFieldDefinition,
  onChange: (value: unknown) => void,
) {
  const [error, setError] = useState<string | null>(null);
  const commit = (raw: unknown) => {
    const result = validateCustomFieldValue(definition, raw);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.value);
  };
  return { error, commit };
}

export default function CustomFieldInput({
  definition,
  value,
  onChange,
  users = [],
  compact = false,
}: Props) {
  const { error, commit } = useValidated(definition, onChange);

  if (definition.type === "text") {
    return (
      <FieldWrap error={error}>
        <input
          type="text"
          aria-label={definition.name}
          defaultValue={(value as string) ?? ""}
          onBlur={(e) => commit(e.target.value || null)}
          placeholder="—"
          className={cn(inputCls, error && errorCls)}
        />
      </FieldWrap>
    );
  }
  if (definition.type === "number") {
    return (
      <FieldWrap error={error}>
        <input
          type="number"
          aria-label={definition.name}
          defaultValue={value === null || value === undefined ? "" : String(value)}
          onBlur={(e) => commit(e.target.value === "" ? null : e.target.value)}
          placeholder="—"
          className={cn(inputCls, error && errorCls)}
        />
      </FieldWrap>
    );
  }
  if (definition.type === "date") {
    const dateVal = typeof value === "string" ? value.slice(0, 10) : "";
    return (
      <FieldWrap error={error}>
        <input
          type="date"
          aria-label={definition.name}
          defaultValue={dateVal}
          onBlur={(e) => commit(e.target.value || null)}
          className={cn(inputCls, error && errorCls)}
        />
      </FieldWrap>
    );
  }
  if (definition.type === "checkbox") {
    const checked = !!value;
    return (
      <button
        type="button"
        aria-label={definition.name}
        onClick={() => commit(!checked)}
        aria-pressed={checked}
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
          checked ? "bg-primary border-primary" : "border-border hover:border-primary",
        )}
      >
        {checked && <Check className="w-3 h-3 text-primary-foreground" />}
      </button>
    );
  }
  if (definition.type === "dropdown") {
    const options = definition.options ?? [];
    return (
      <FieldWrap error={error}>
        <div className="relative">
          <select
            aria-label={definition.name}
            value={(value as string) ?? ""}
            onChange={(e) => commit(e.target.value || null)}
            className={cn(inputCls, "appearance-none pr-8", error && errorCls)}
          >
            <option value="">—</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown className="upflow-select-chevron pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </FieldWrap>
    );
  }
  if (definition.type === "people") {
    return (
      <PeoplePicker
        label={definition.name}
        selected={Array.isArray(value) ? (value as string[]) : []}
        users={users}
        onChange={(ids) => commit(ids.length === 0 ? null : ids)}
        compact={compact}
      />
    );
  }
  return null;
}

function FieldWrap({
  error,
  children,
}: {
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      {error && (
        <p className="text-[11px] text-destructive mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PeoplePicker({
  label,
  selected,
  users,
  onChange,
  compact,
}: {
  label: string;
  selected: string[];
  users: TaskAssignee[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const selectedUsers = users.filter((u) => selected.includes(u.id));

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
          compact && "py-1",
        )}
      >
        {selectedUsers.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex -space-x-1">
            {selectedUsers.slice(0, 3).map((u) => (
              <div
                key={u.id}
                title={u.name}
                className="w-5 h-5 rounded-full bg-primary/[0.15] text-primary text-[10px] font-bold flex items-center justify-center ring-1 ring-card"
              >
                {getInitials(u.name)}
              </div>
            ))}
            {selectedUsers.length > 3 && (
              <span className="text-xs text-muted-foreground ml-2">
                +{selectedUsers.length - 3}
              </span>
            )}
          </div>
        )}
        <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 left-0 min-w-[220px] bg-popover border border-border rounded-lg shadow-xl p-1 max-h-64 overflow-y-auto">
            {users.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t("customFields.noTeammates")}</div>
            )}
            {users.map((u) => {
              const on = selected.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-foreground hover:bg-muted"
                >
                  <div className="w-5 h-5 rounded-full bg-primary/[0.15] text-primary text-[10px] font-bold flex items-center justify-center">
                    {getInitials(u.name)}
                  </div>
                  <span className="flex-1 text-left truncate">{u.name}</span>
                  {on && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              );
            })}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted border-t border-border mt-1"
              >
                <X className="w-3.5 h-3.5" /> {t("common.clear")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
