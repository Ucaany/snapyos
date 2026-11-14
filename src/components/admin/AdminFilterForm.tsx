"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";

/**
 * Form filter admin. Submit lewat router klien dengan `scroll: false`, jadi
 * data diperbarui tanpa reload penuh dan tanpa melompat ke atas halaman.
 */
export function AdminFilterForm({
  action,
  children,
  className,
  autoSubmit = true,
}: {
  action: string;
  children: ReactNode;
  className?: string;
  autoSubmit?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      const text = String(value).trim();
      if (text) params.set(key, text);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${action}?${query}` : action, { scroll: false });
    });
  }

  return (
    <form
      action={action}
      className={className}
      role="search"
      aria-busy={pending}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      onChange={(event) => {
        if (!autoSubmit) return;
        const target = event.target as HTMLElement;
        if (target.tagName === "SELECT") submit(event.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
