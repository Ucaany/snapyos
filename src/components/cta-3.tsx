import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DecorIcon } from "@/components/decor-icon";
import { waLink } from "@/lib/consult";
import { getConsultWhatsApp } from "@/server/consult";

export async function CallToAction() {
	const consultNumber = await getConsultWhatsApp();
	return (
		<div className="relative mx-auto flex w-full max-w-3xl flex-col justify-between gap-y-4 border-y px-4 py-8">
			<DecorIcon className="size-4" position="top-left" />
			<DecorIcon className="size-4" position="top-right" />
			<DecorIcon className="size-4" position="bottom-left" />
			<DecorIcon className="size-4" position="bottom-right" />

			<div className="pointer-events-none absolute -inset-y-6 -left-px w-px border-l" />
			<div className="pointer-events-none absolute -inset-y-6 -right-px w-px border-r" />

			<div className="absolute top-0 left-1/2 -z-10 h-full border-l border-dashed" />

			<h2 className="text-center text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
				Mulai gratis hari ini
			</h2>
			<p className="mx-auto max-w-2xl text-balance text-center text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
				Jalankan photobox pertama Anda, terima pembayaran QRIS, dan pantau
				pendapatan dari satu dashboard.
			</p>

			<div className="flex flex-wrap items-center justify-center gap-3">
				<Button
					variant="outline"
					nativeButton={false}
					render={<a href={waLink(consultNumber)} target="_blank" rel="noreferrer" />}
				>
					Hubungi sales
				</Button>
				<Button nativeButton={false} render={<Link href="/register" />}>
					Mulai sekarang <ArrowRight data-icon="inline-end" />
				</Button>
			</div>
		</div>
	);
}
