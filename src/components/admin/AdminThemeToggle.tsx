"use client";

import { Moon, Sun } from "lucide-react";
import { useTransition } from "react";

import { setAdminTheme } from "@/app/(admin)/admin/theme-actions";
import { Button } from "@/components/admin/ui/button";

/** Tombol tema admin. Cookie disimpan di server supaya tidak flash saat load. */
export function AdminThemeToggle({ dark }: { dark: boolean }) {
  const [pending, startTransition] = useTransition();
  const label = dark ? "Aktifkan mode terang" : "Aktifkan mode gelap";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => startTransition(() => setAdminTheme(dark ? "light" : "dark"))}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
