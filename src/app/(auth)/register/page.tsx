import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";

import { waDisplay, waLink } from "@/lib/consult";
import { destinationForUser } from "@/lib/destination";
import { getUserMemberships, requireUser } from "@/lib/tenant";
import { getConsultWhatsApp } from "@/server/consult";
import { isAdminUser } from "@/server/admin";
import { buttonVariants } from "@/components/ui/button";
import { DecorIcon } from "@/components/decor-icon";

export const metadata: Metadata = { title: "Konsultasi Pendaftaran | SnapyOS" };

export default async function RegisterConsultPage() {
  const user = await requireUser();
  if (user) {
    // Resolver tujuan kanonis (sama dengan /login + guard) supaya staff-only
    // dan admin tidak dipaksa mendarat di /dashboard.
    const memberships = await getUserMemberships(user.id);
    redirect(destinationForUser(memberships, { isAdmin: isAdminUser(user) }));
  }
  const number = await getConsultWhatsApp();

  return (
    <div>
      <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-6 md:px-8">
        <div className="relative flex w-full max-w-sm flex-col justify-between p-6 md:p-8">
          <div className="absolute -inset-y-6 -left-px w-px bg-ink" />
          <div className="absolute -inset-y-6 -right-px w-px bg-ink" />
          <div className="absolute -inset-x-6 -top-px h-px bg-ink" />
          <div className="absolute -inset-x-6 -bottom-px h-px bg-ink" />
          <DecorIcon position="top-left" />
          <DecorIcon position="bottom-right" />

          <div className="w-full max-w-sm animate-in space-y-8">
            <div className="flex flex-col items-center space-y-4 text-center">
              <Image
                src="/avatar-snappy/4.svg"
                alt="SnapyOS"
                width={48}
                height={48}
                className="size-12"
              />
              <div className="flex flex-col space-y-1">
                <h1 className="font-bold text-2xl tracking-wide">Pendaftaran SnapyOS</h1>
                <p className="text-base text-muted-foreground">
                  Setup bisnis photobox Anda bersama tim kami.
                </p>
              </div>
            </div>

            <div className="rounded-none border-2 border-ink p-4">
              <p className="text-sm font-medium text-ink">Konsultasi WhatsApp</p>
              <p className="mt-2 text-lg font-bold text-ink">{waDisplay(number)}</p>
            </div>

            <a
              href={waLink(number)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "sm", className: "min-h-11 w-full" })}
            >
              <MessageCircleIcon />
              Mulai chat WhatsApp
            </a>

            <p className="text-muted-foreground text-sm">
              Sudah memiliki akun?{" "}
              <Link className="underline underline-offset-4 hover:text-ink" href="/login">
                Masuk ke SnapyOS
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
