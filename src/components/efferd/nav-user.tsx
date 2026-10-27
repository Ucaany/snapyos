"use client";

import Link from "next/link";
import { LogOutIcon, SettingsIcon, ShieldIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/auth-actions";

/**
 * User menu header tema modern. Isi asli: nama/email user login, tautan
 * pengaturan + panel admin, dan logout lewat server action yang sama
 * dengan Topbar brutalis.
 */
export function NavUser({
  user,
  isAdmin = false,
  settingsHref = "/dashboard/settings",
}: {
  user: { name: string | null | undefined; email: string | null | undefined };
  isAdmin?: boolean;
  settingsHref?: string;
}) {
  const name = user.name || user.email || "Pengguna";
  const initial = name.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Menu pengguna"
            className="size-8 rounded-full p-0"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Avatar className="size-8">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="pointer-events-none flex items-center gap-2">
            <Avatar className="isolate size-8">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <span className="block truncate font-medium text-foreground">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href={settingsHref} />}>
            <SettingsIcon />
            Pengaturan
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <ShieldIcon />
              Panel Admin
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem
            render={<button className="w-full" type="submit" />}
            variant="destructive"
          >
            <LogOutIcon />
            Keluar
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
