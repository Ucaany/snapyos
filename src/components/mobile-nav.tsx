"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { companyLinks, legalLinks, productLinks } from "@/components/nav-links";
import { LinkItem } from "@/components/sheard";
import { XIcon, MenuIcon } from "lucide-react";

/** Navigasi mobile marketing: mirror desktop (Produk, Perusahaan, Legal) + 2 CTA. */
export function MobileNav() {
	return (
		<div className="md:hidden">
			<DialogPrimitive.Root>
				<DialogPrimitive.Trigger
					aria-label="Buka menu"
					className="group/trigger relative inline-flex size-8 shrink-0 items-center justify-center border-2 border-ink bg-surface text-ink outline-none transition-all after:absolute after:-inset-x-1.5 after:-inset-y-1.5 focus-visible:ring-2 focus-visible:ring-ink data-[popup-open]:bg-accent"
				>
					<XIcon className="absolute size-4 scale-0 opacity-0 transition-all group-data-[popup-open]/trigger:scale-100 group-data-[popup-open]/trigger:opacity-100" />
					<MenuIcon className="size-4 scale-100 opacity-100 transition-all group-data-[popup-open]/trigger:scale-0 group-data-[popup-open]/trigger:opacity-0" />
				</DialogPrimitive.Trigger>
				<DialogPrimitive.Portal>
					<DialogPrimitive.Backdrop className="fixed inset-0 z-40 top-14 bg-bg" />
					<DialogPrimitive.Popup
						aria-label="Menu navigasi"
						className={cn(
							"fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto p-4",
							"border-t-2 border-ink bg-bg outline-none",
							"data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
							"data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0",
							"transition-[transform,opacity] duration-200 ease-out"
						)}
					>
						<div className="flex w-full flex-col gap-y-2">
							<span className="text-sm text-muted-foreground">Produk</span>
							{productLinks.map((link) => (
								<LinkItem
									className="rounded-lg p-2 active:bg-muted dark:active:bg-muted/50"
									key={`product-${link.label}`}
									{...link}
								/>
							))}
							<span className="mt-2 text-sm text-muted-foreground">Perusahaan</span>
							{companyLinks.map((link) => (
								<LinkItem
									className="rounded-lg p-2 active:bg-muted dark:active:bg-muted/50"
									key={`company-${link.label}`}
									{...link}
								/>
							))}
							<span className="mt-2 text-sm text-muted-foreground">Legal</span>
							{legalLinks.map((link) => (
								<LinkItem
									className="rounded-lg p-2 active:bg-muted dark:active:bg-muted/50"
									key={`legal-${link.label}`}
									{...link}
								/>
							))}
						</div>
						<div className="mt-5 flex flex-col gap-2">
							<DialogPrimitive.Close
								render={
									<Button className="w-full" variant="outline" nativeButton={false} render={<Link href="/login" />} />
								}
							/>
							<DialogPrimitive.Close
								render={
									<Button className="w-full" nativeButton={false} render={<Link href="/register" />} />
								}
							/>
						</div>
					</DialogPrimitive.Popup>
				</DialogPrimitive.Portal>
			</DialogPrimitive.Root>
		</div>
	);
}
