"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <IconButton type="submit" label={pending ? "Keluar..." : "Keluar"} variant="neutral" disabled={pending}>
      <LogOut className="size-4" aria-hidden="true" />
    </IconButton>
  );
}
