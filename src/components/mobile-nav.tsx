"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { companyLinks, legalLinks, productLinks } from "@/components/nav-links";
import { LinkItem } from "@/components/sheard";
import { XIcon, MenuIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Navigasi mobile marketing: mirror desktop (Produk, Perusahaan, Legal) + 2 CTA. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger
          aria-label={open ? "Tutup menu" : "Buka menu"}
          className="group/trigger relative inline-flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-surface text-ink outline-none transition-all focus-visible:ring-2 focus-visible:ring-ink data-[popup-open]:bg-accent"
        >
          <XIcon className="absolute size-4 scale-0 opacity-0 transition-all group-data-[popup-open]/trigger:scale-100 group-data-[popup-open]/trigger:opacity-100" />
          <MenuIcon className="size-4 scale-100 opacity-100 transition-all group-data-[popup-open]/trigger:scale-0 group-data-[popup-open]/trigger:opacity-0" />
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 top-14 z-40 bg-bg" />
          <DialogPrimitive.Popup
            aria-label="Menu navigasi"
            className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto border-t-2 border-ink bg-bg p-4 outline-none transition-[transform,opacity] duration-200 ease-out data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0"
          >
            <div className="mb-3 flex items-center justify-between border-b-2 border-ink pb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]">
                Menu
              </span>
              <DialogPrimitive.Close
                aria-label="Tutup menu"
                className="inline-flex size-11 items-center justify-center border-2 border-ink bg-surface text-ink transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <XIcon className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex w-full flex-col gap-y-2">
              <span className="text-sm text-muted-foreground">Produk</span>
              {productLinks.map((link) => (
                <LinkItem
                  className="min-h-11 rounded-lg p-2 active:bg-muted dark:active:bg-muted/50"
                  key={`product-${link.label}`}
                  onClick={close}
                  {...link}
                />
              ))}
              <span className="mt-2 text-sm text-muted-foreground">Perusahaan</span>
              {companyLinks.map((link) => (
                <LinkItem
                  className="min-h-11 rounded-lg p-2 active:bg-muted dark:active:bg-muted/50"
                  key={`company-${link.label}`}
                  onClick={close}
                  {...link}
                />
              ))}
              <span className="mt-2 text-sm text-muted-foreground">Legal</span>
              {legalLinks.map((link) => (
                <LinkItem
                  className="min-h-11 rounded-lg p-2 active:bg-muted dark:active:bg-muted/50"
                  key={`legal-${link.label}`}
                  onClick={close}
                  {...link}
                />
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={close}
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full",
                })}
              >
                Masuk
              </Link>
              <Link
                href="/register"
                onClick={close}
                className={buttonVariants({ className: "w-full" })}
              >
                Konsultasi Bisnis
              </Link>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
