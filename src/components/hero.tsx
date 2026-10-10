import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, PhoneCallIcon } from "lucide-react";

export function HeroSection() {
	return (
		<section className="relative mx-auto w-full max-w-5xl overflow-hidden border-b-2 border-ink bg-bg pt-16">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 size-full overflow-hidden"
			>
				<div
					className={cn(
						"absolute inset-0 isolate -z-10",
						"bg-[repeating-linear-gradient(0deg,transparent,transparent_31px,#11111111_31px,#11111111_32px)]"
					)}
				/>
			</div>
			<div className="relative z-10 flex max-w-2xl flex-col gap-5 px-4">
				<a
					className={cn(
						"group flex w-fit items-center gap-3 border-2 border-ink bg-accent p-1 shadow-[2px_2px_0_0_#111111]",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out"
					)}
					href="#pricing"
				>
					<div className="border-2 border-ink bg-surface px-1.5 py-0.5 shadow-[2px_2px_0_0_#111111]">
						<p className="font-mono text-xs uppercase tracking-wide">START</p>
					</div>

					<span className="font-mono text-xs uppercase tracking-wide">Mulai dari Rp99.000/bulan</span>
					<span className="block h-5 border-l-2 border-ink" />

					<div className="pr-1">
						<ArrowRightIcon className="size-3 -translate-x-0.5 duration-150 ease-out group-hover:translate-x-0.5" />
					</div>
				</a>

				<h1
					className={cn(
						"text-balance font-display text-4xl uppercase leading-[0.95] text-ink md:text-6xl",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out"
					)}
				>
					Photobox bisnis Anda, satu dashboard
				</h1>

				<p
					className={cn(
						"border-l-2 border-ink pl-4 font-sans text-sm text-muted-foreground sm:text-lg md:text-xl",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out"
					)}
				>
					Jalankan booth, terima QRIS pay-first, pantau pendapatan, dan
					kelola outlet. Tanpa software terpisah.
				</p>

				<div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
					<a href="#kiosk">
						<Button variant="outline">
							<PhoneCallIcon data-icon="inline-start" />{" "}
							Lihat Kiosk
						</Button>
					</a>
					<a href="/register">
						<Button>
							Buat Bisnis{" "}
							<ArrowRightIcon data-icon="inline-end" />
						</Button>
					</a>
				</div>
			</div>
			<div className="relative">
				<div
					className={cn(
						"mt-8 -mr-56 overflow-hidden px-2 sm:mt-12 sm:mr-0 md:mt-20",
						"fade-in slide-in-from-bottom-5 animate-in fill-mode-backwards delay-100 duration-1000 ease-out"
					)}
				>
					<div className="relative mx-auto max-w-5xl overflow-hidden border-2 border-ink bg-surface p-2 shadow-[4px_4px_0_0_#111111]">
						<img
							alt="Dashboard SnapyOS"
							className="z-2 aspect-video border-2 border-ink"
							height="1716"
							src="/dashboard-preview.png"
							width="3024"
							loading="eager"
							fetchPriority="high"
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
