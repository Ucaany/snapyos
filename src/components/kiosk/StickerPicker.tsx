"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { apiGet } from "@/components/kiosk/api";

type EmojiItem = { char: string; name: string; group: string };

type Props = {
  onPick: (char: string) => void;
};

const FALLBACK_EMOJIS: EmojiItem[] = [
  { char: "\u2665", name: "Heart", group: "" },
  { char: "\u2605", name: "Star", group: "" },
  { char: "\u2726", name: "Flower", group: "" },
  { char: "\u263a", name: "Smile", group: "" },
  { char: "\u266a", name: "Music", group: "" },
  { char: "\u270c", name: "Peace", group: "" },
  { char: "\u2600", name: "Sun", group: "" },
  { char: "\u273f", name: "Blossom", group: "" },
];

/**
 * Sticker/emoji picker — docs/05 §5.9 (Emoji API via server proxy).
 * Search + grid; loading/empty/error states; fallback glyphs when API unavailable.
 */
export function StickerPicker({ onPick }: Props) {
  const [emojis, setEmojis] = useState<EmojiItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function loadEmojis(search: string) {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(false);

    const url = search
      ? `/api/v1/emoji?search=${encodeURIComponent(search)}`
      : `/api/v1/emoji?limit=120`;

    apiGet<EmojiItem[]>(url, ac.signal)
      .then((data) => {
        setEmojis(data);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setError(true);
        setEmojis([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
  }

  useEffect(() => {
    const t = setTimeout(() => loadEmojis(""), 0);
    return () => {
      clearTimeout(t);
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onSearch(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadEmojis(v), 300);
  }

  const showFallback = error || (emojis.length === 0 && !loading);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">Stiker</p>
      <div className="flex items-center gap-2 border-2 border-ink bg-surface px-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Cari emoji…"
          className="h-9 w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="max-h-[180px] overflow-y-auto border-2 border-ink bg-surface p-1">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : showFallback ? (
          <div className="flex flex-col gap-1">
            <p className="px-1 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              Emoji dasar (API offline)
            </p>
            <div className="grid grid-cols-6 gap-0.5 sm:grid-cols-8">
              {FALLBACK_EMOJIS.map((e, i) => (
                <button
                  key={`${e.char}-${i}`}
                  type="button"
                  onClick={() => onPick(e.char)}
                  className="flex min-h-11 min-w-11 items-center justify-center border border-transparent text-xl hover:border-ink hover:bg-accent/30 active:scale-95"
                  title={e.name}
                  aria-label={e.name}
                >
                  {e.char}
                </button>
              ))}
            </div>
          </div>
        ) : emojis.length === 0 ? (
          <p className="px-2 py-4 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Tidak ada emoji ditemukan.
          </p>
        ) : (
          <div className="grid grid-cols-6 gap-0.5 sm:grid-cols-8">
            {emojis.map((e, i) => (
              <button
                key={`${e.char}-${i}`}
                type="button"
                onClick={() => onPick(e.char)}
                className="flex min-h-11 min-w-11 items-center justify-center border border-transparent text-xl hover:border-ink hover:bg-accent/30 active:scale-95"
                title={e.name}
                aria-label={e.name}
              >
                {e.char}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
