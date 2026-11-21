import { Badge } from "@/components/ui/badge";
import {
  articleHref,
  sectionBullets,
  sectionParagraphs,
  sectionSteps,
  type HelpArticle,
  type HelpSection,
} from "@/server/help";

function parseStep(text: string, fallback: number): { no: string; body: string } {
  const m = text.trim().match(/^Langkah\s+(\d+)\s*:\s*([\s\S]+)$/);
  if (m) return { no: m[1] ?? String(fallback), body: (m[2] ?? text).trim() };
  return { no: String(fallback), body: text.trim() };
}

function Steps({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="mt-4 space-y-3 border-t border-border pt-4">
      {steps.map((raw, i) => {
        const s = parseStep(raw, i + 1);
        return (
          <li key={`${s.no}-${i}`} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-none border-2 border-ink bg-surface text-xs font-mono uppercase tracking-[0.08em]">
              {s.no}
            </span>
            <p className="text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              {s.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function DocTable({ head, rows, caption }: { head: string[]; rows: string[][]; caption?: string }) {
  return (
    <figure className="mt-4 overflow-x-auto border-y border-border">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-widest"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-border/60 px-4 py-3 align-top leading-6 text-muted-foreground last:border-b-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <figcaption className="px-4 py-2 text-xs text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}

export function DocSectionBlock({
  section,
  index,
  total,
}: {
  section: HelpSection;
  index: number;
  total: number;
}) {
  const paragraphs = sectionParagraphs(section);
  const steps = sectionSteps(section);
  const bullets = sectionBullets(section);
  return (
    <div
      id={section.anchor}
      className="scroll-mt-24 border-t border-border/70 pt-8 first:border-t-0 first:pt-0"
    >
      <div className="flex items-baseline gap-3">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
        <h4 className="font-display text-xl font-black uppercase tracking-tight md:text-2xl">
          {section.heading}
        </h4>
      </div>
      {paragraphs.length > 0 && (
        <div className="mt-3 space-y-3">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7"
            >
              {p}
            </p>
          ))}
        </div>
      )}
      {bullets.length > 0 && (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      <Steps steps={steps} />
      {section.table && (
        <DocTable
          head={section.table.head}
          rows={section.table.rows}
          caption={section.table.caption}
        />
      )}
      {section.code && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-transparent">
          {section.code.label && (
            <p className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
              {section.code.label}
            </p>
          )}
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-6">
            <code>{section.code.code}</code>
          </pre>
        </div>
      )}
      {section.note && (
        <p className="mt-4 border-l-2 border-foreground/30 pl-4 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
          {section.note}
        </p>
      )}
    </div>
  );
}

export function DocArticleBlock({ article }: { article: HelpArticle }) {
  const totalSteps = article.sections.reduce((n, s) => n + sectionSteps(s).length, 0);
  return (
    <article
      id={article.slug}
      className="scroll-mt-24 border-t border-border pt-10 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{article.category}</Badge>
        {article.audience && <Badge variant="neutral">{article.audience}</Badge>}
      </div>
      <h3 className="mt-3 text-balance font-display text-3xl font-black uppercase leading-[0.95] tracking-tight sm:text-4xl">
        {article.title}
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
        {article.summary}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        {article.estimate ? `${article.estimate} · ` : ""}
        {article.sections.length} bagian{totalSteps > 0 ? ` · ${totalSteps} langkah` : ""}
      </p>
      {article.prerequisites && article.prerequisites.length > 0 && (
        <div className="mt-5 border-l-2 border-foreground/30 pl-4">
          <p className="text-sm font-semibold">Perlu disiapkan</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
            {article.prerequisites.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8 space-y-10">
        {article.sections.map((s, i) => (
          <DocSectionBlock key={s.heading} section={s} index={i} total={article.sections.length} />
        ))}
      </div>
      {article.troubleshooting && article.troubleshooting.length > 0 && (
        <div className="mt-10 border-t border-border/70 pt-8">
          <h4 className="font-display text-xl font-black uppercase tracking-tight md:text-2xl">
            Troubleshooting
          </h4>
          <div className="mt-3 overflow-x-auto border-y border-border">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-widest">
                    Gejala
                  </th>
                  <th className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-widest">
                    Penyebab
                  </th>
                  <th className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-widest">
                    Solusi
                  </th>
                </tr>
              </thead>
              <tbody>
                {article.troubleshooting.map((t, i) => (
                  <tr key={i}>
                    <td className="border-b border-border/60 px-4 py-3 align-top leading-6">
                      {t.gejala}
                    </td>
                    <td className="border-b border-border/60 px-4 py-3 align-top leading-6 text-muted-foreground">
                      {t.penyebab}
                    </td>
                    <td className="border-b border-border/60 px-4 py-3 align-top leading-6 text-muted-foreground">
                      {t.solusi}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {article.nextSteps && article.nextSteps.length > 0 && (
        <div className="mt-8 border-t border-border/70 pt-5">
          <p className="text-sm font-semibold">Langkah berikutnya</p>
          <ul className="mt-3 space-y-2">
            {article.nextSteps.map((n) => (
              <li key={n.slug} className="text-sm leading-6 [@media(pointer:coarse)]:py-1">
                <a
                  href={articleHref(n.slug)}
                  className="font-medium underline underline-offset-4 hover:no-underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center"
                >
                  {n.title}
                </a>
                {n.desc && <span className="text-muted-foreground">: {n.desc}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
