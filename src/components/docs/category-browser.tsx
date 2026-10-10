"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Camera,
  LayoutGrid,
  LifeBuoy,
  List,
  Rocket,
  Store,
  Wallet,
  Wrench,
} from "lucide-react";

export type BrowserDoc = { slug: string; title: string; summary: string };
export type BrowserGroup = {
  slug: string;
  title: string;
  desc: string;
  docs: BrowserDoc[];
};

const GROUP_ICON: Record<string, typeof Rocket> = {
  mulai: Rocket,
  customer: Camera,
  owner: Store,
  pembayaran: Wallet,
  perangkat: Wrench,
  bantuan: LifeBuoy,
};

export function CategoryBrowser({ groups }: { groups: BrowserGroup[] }) {
  const [activeSlug, setActiveSlug] = useState(groups[0]?.slug ?? "mulai");
  const [view, setView] = useState<"grid" | "list">("grid");
  const active = groups.find((g) => g.slug === activeSlug) ?? groups[0];

  if (!active) return null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
      <aside aria-label="Sidebar kategori" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {groups.map((g, i) => {
            const Icon = GROUP_ICON[g.slug] ?? Rocket;
            const isActive = g.slug === active.slug;
            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => setActiveSlug(g.slug)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "flex shrink-0 items-center gap-3 rounded-none border-2 border-ink bg-accent py-2 pr-5 pl-2 text-left shadow-[4px_4px_0_0_#111111] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none lg:w-full lg:py-3 lg:pr-4 lg:pl-3"
                    : "flex shrink-0 items-center gap-3 rounded-none border-2 border-ink bg-surface py-2 pr-5 pl-2 text-left shadow-[2px_2px_0_0_#111111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none lg:w-full lg:py-3 lg:pr-4 lg:pl-3"
                }
              >
                <span
                  className="grid size-9 shrink-0 place-items-center border-2 border-ink bg-surface"
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap lg:whitespace-normal">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold">{g.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.docs.length}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink">
              {active.docs.length} panduan
            </p>
            <h3 className="mt-1 font-display text-xl uppercase tracking-tight md:text-2xl">{active.title}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">{active.desc}</p>
          </div>
          <div
            role="group"
            aria-label="Mode tampilan"
            className="flex w-fit shrink-0 items-center gap-1 border-2 border-ink bg-surface p-1 shadow-[2px_2px_0_0_#111111]"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              className={
                view === "grid"
                  ? "inline-flex items-center gap-1.5 border-2 border-ink bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink"
                  : "inline-flex items-center gap-1.5 border-2 border-transparent px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-ink"
              }
            >
              <LayoutGrid className="size-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={
                view === "list"
                  ? "inline-flex items-center gap-1.5 border-2 border-ink bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink"
                  : "inline-flex items-center gap-1.5 border-2 border-transparent px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-ink"
              }
            >
              <List className="size-3.5" />
              List
            </button>
          </div>
        </div>

        {view === "grid" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {active.docs.map((doc, i) => (
              <Link
                key={doc.slug}
                href={`/docs/${active.slug}#${doc.slug}`}
                className="group flex flex-col gap-2 rounded-none border-2 border-ink bg-surface p-5 shadow-[2px_2px_0_0_#111111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-ink" />
                </div>
                <span className="text-sm font-semibold tracking-tight">{doc.title}</span>
                <span className="text-xs leading-5 text-muted-foreground">{doc.summary}</span>
              </Link>
            ))}
          </div>
        ) : (
          <ul className="mt-5 divide-y-2 divide-ink border-2 border-ink bg-surface shadow-[2px_2px_0_0_#111111]">
            {active.docs.map((doc, i) => (
              <li key={doc.slug}>
                <Link
                  href={`/docs/${active.slug}#${doc.slug}`}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{doc.title}</span>
                    <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                      {doc.summary}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={`/docs/${active.slug}`}
          className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:no-underline"
        >
          Buka halaman penuh {active.title}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
