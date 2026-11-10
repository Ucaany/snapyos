"use client";

import { useCallback, useState } from "react";

/** Batas riwayat undo — 100 langkah sesuai spesifikasi builder. */
export const HISTORY_LIMIT = 100;

type HistoryState<T> = { past: T[]; present: T; future: T[] };

export type TemplateHistory<T> = {
  present: T;
  /** Ganti present TANPA menambah riwayat (drag in-flight). */
  replace: (next: T) => void;
  /** Catat present sekarang sebagai langkah undo (awal drag / aksi diskret). */
  checkpoint: () => void;
  /** Checkpoint + ganti present dalam satu update. */
  commit: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Buang riwayat (mis. layout baru dari server). */
  reset: (next: T) => void;
};

function trim<T>(list: T[]): T[] {
  return list.length > HISTORY_LIMIT ? list.slice(list.length - HISTORY_LIMIT) : list;
}

/**
 * Riwayat undo/redo untuk layout builder.
 *
 * Hanya `commit`/`checkpoint` yang mencatat langkah: drag memanggil
 * `checkpoint()` sekali lalu `replace()` per pointermove, jadi satu drag =
 * satu langkah undo (bukan 60).
 */
export function useTemplateHistory<T>(initial: T): TemplateHistory<T> {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });

  const replace = useCallback((next: T) => {
    setState((prev) => ({ ...prev, present: next }));
  }, []);

  const checkpoint = useCallback(() => {
    setState((prev) => ({
      past: trim([...prev.past, prev.present]),
      present: prev.present,
      future: [],
    }));
  }, []);

  const commit = useCallback((next: T) => {
    setState((prev) => ({
      past: trim([...prev.past, prev.present]),
      present: next,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      const previous = prev.past[prev.past.length - 1];
      if (previous === undefined) return prev;
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const next = prev.future[0];
      if (next === undefined) return prev;
      return {
        past: trim([...prev.past, prev.present]),
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  return {
    present: state.present,
    replace,
    checkpoint,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  };
}
