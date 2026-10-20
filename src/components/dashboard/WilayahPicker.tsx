"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * WilayahPicker — kaskade Provinsi → Kabupaten/Kota.
 * Data self-hosted `/data/wilayah.json` (34 provinsi, 514 kab/kota) hasil dump
 * emsifa/api-wilayah-indonesia — same-origin, tak terganggu CORS/redirect
 * (host github.io-nya sudah pindah domain & blokir mixed-content).
 * Submit field: `province` + `city` (nama, bukan id — schema text).
 * Cache modul per sesi; fallback input manual bila file tak termuat.
 */

type Province = { id: string; name: string; regencies: { id: string; name: string }[] };
type Wilayah = { provinces: Province[] };

let wilayahCache: Wilayah | null = null;

async function fetchWilayah(): Promise<Wilayah> {
  if (wilayahCache) return wilayahCache;
  const res = await fetch("/data/wilayah.json");
  if (!res.ok) throw new Error("Gagal memuat data wilayah");
  wilayahCache = (await res.json()) as Wilayah;
  return wilayahCache;
}

type Props = {
  idPrefix: string;
  province?: string | null;
  city?: string | null;
  disabled?: boolean;
};

export function WilayahPicker({ idPrefix, province, city, disabled }: Props) {
  const [wilayah, setWilayah] = useState<Wilayah | null>(() => wilayahCache);
  const [failed, setFailed] = useState(false);

  // Pilihan user. `undefined` = belum disentuh (pakai nilai awal dari props);
  // `null` = sengaja dikosongkan, harus tetap kosong, bukan snap-back ke nilai awal.
  const [pickedProvinceId, setPickedProvinceId] = useState<string | null | undefined>(undefined);
  const [pickedProvinceName, setPickedProvinceName] = useState<string | null | undefined>(
    undefined
  );
  const [cityName, setCityName] = useState(city ?? "");

  // Muat data wilayah sekali (init lazy dari cache modul).
  useEffect(() => {
    if (wilayahCache) return;
    let cancelled = false;
    fetchWilayah()
      .then((data) => {
        if (!cancelled) setWilayah(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nilai efektif (derived, tanpa sinkronisasi state):
  const initialProvinceId =
    wilayah && province
      ? (wilayah.provinces.find((p) => p.name.toLowerCase() === province.toLowerCase())?.id ?? null)
      : null;
  const provinceId =
    pickedProvinceId === undefined ? (initialProvinceId ?? "") : (pickedProvinceId ?? "");
  const provinceName =
    pickedProvinceName === undefined ? (province ?? "") : (pickedProvinceName ?? "");

  const regencies = wilayah?.provinces.find((p) => p.id === provinceId)?.regencies ?? null;

  // Fallback manual bila data tidak termuat (tetap bisa simpan).
  if (failed) {
    return (
      <>
        <input type="hidden" name="province" value={provinceName} />
        <input type="hidden" name="city" value={cityName} />
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${idPrefix}-province`}
            className="font-mono text-xs uppercase tracking-[0.1em]"
          >
            Provinsi (manual: data wilayah tidak termuat)
          </label>
          <Input
            id={`${idPrefix}-province`}
            value={provinceName}
            onChange={(e) => setPickedProvinceName(e.target.value)}
            disabled={disabled}
            maxLength={80}
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${idPrefix}-city`}
            className="font-mono text-xs uppercase tracking-[0.1em]"
          >
            Kabupaten / Kota
          </label>
          <Input
            id={`${idPrefix}-city`}
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            disabled={disabled}
            maxLength={80}
            className="font-mono"
          />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Field tersubmit: nama, bukan id (schema: province/city text). */}
      <input type="hidden" name="province" value={provinceName} />
      <input type="hidden" name="city" value={cityName} />

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${idPrefix}-province-select`}
          className="font-mono text-xs uppercase tracking-[0.1em]"
        >
          Provinsi *
        </label>
        <Select
          id={`${idPrefix}-province-select`}
          value={provinceId}
          disabled={disabled || !wilayah}
          onChange={(e) => {
            const id = e.target.value;
            const match = wilayah?.provinces.find((p) => p.id === id);
            // Kosong = dikosongkan sengaja (`null`), bukan "belum disentuh".
            setPickedProvinceId(id || null);
            setPickedProvinceName(match?.name ?? null);
            setCityName("");
          }}
          aria-label="Pilih provinsi"
        >
          <option value="">{wilayah ? "-- PILIH PROVINSI --" : "MEMUAT…"}</option>
          {wilayah?.provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${idPrefix}-city-select`}
          className="font-mono text-xs uppercase tracking-[0.1em]"
        >
          Kabupaten / Kota *
        </label>
        <Select
          id={`${idPrefix}-city-select`}
          value={regencies?.some((r) => r.name === cityName) ? cityName : ""}
          disabled={disabled || !regencies}
          onChange={(e) => setCityName(e.target.value)}
          className={cn(!provinceId && "text-muted-foreground")}
          aria-label="Pilih kabupaten atau kota"
        >
          <option value="">
            {!provinceId
              ? "-- PILIH PROVINSI DAHULU --"
              : regencies
                ? "-- PILIH KABUPATEN/KOTA --"
                : "MEMUAT…"}
          </option>
          {regencies?.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}
