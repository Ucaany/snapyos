"use client";

import { useRef } from "react";

import { switchWorkspaceAction } from "@/server/business-actions";
import { Select } from "@/components/ui/select";

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

  return <WorkspaceForm businesses={businesses} activeId={activeId} />;
}

function WorkspaceForm({
  businesses,
  activeId,
}: {
  businesses: { id: string; name: string }[];
  activeId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={switchWorkspaceAction}
      className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none"
    >
      <label htmlFor="workspace" className="sr-only">
        Workspace aktif
      </label>
      <Select
        id="workspace"
        name="businessId"
        defaultValue={activeId ?? businesses[0]!.id}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-11 w-full min-w-0 max-w-44 font-mono text-xs uppercase tracking-[0.05em] sm:flex-none"
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </form>
  );
}
