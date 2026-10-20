"use client";

import { ChevronsUpDown } from "lucide-react";

import { switchWorkspaceAction } from "@/server/business-actions";

/**
 * Workspace switcher — docs/04 §4.16: activeBusinessId di cookie,
 * switch hanya ke business tempat user member (divalidasi server-side).
 */
export function WorkspaceSwitcher({
  businesses,
  activeId,
}: {
  businesses: { id: string; name: string }[];
  activeId: string | null;
}) {
  if (businesses.length === 0) {
    return (
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground sm:inline">
        [ NO WORKSPACE ]
      </span>
    );
  }

  return (
    <form
      action={switchWorkspaceAction}
      className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none"
    >
      <label htmlFor="workspace" className="sr-only">
        Workspace aktif
      </label>
      <div className="relative flex min-w-0 flex-1 items-center sm:flex-none">
        <select
          id="workspace"
          name="businessId"
          defaultValue={activeId ?? businesses[0]!.id}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-11 w-full min-w-0 max-w-44 appearance-none truncate border-2 border-ink bg-surface pl-3 pr-8 font-mono text-xs uppercase tracking-[0.05em] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-11 sm:flex-none"
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2 size-4" />
      </div>
    </form>
  );
}
