"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/server/auth-actions";
import { updateBusinessProfileAction } from "@/server/business-actions";

const initial: FormState = {};

export type BusinessProfile = {
  name: string;
  whatsapp: string | null;
  owner_name: string | null;
  contact_email: string | null;
  address: string | null;
};

type Props = {
  profile: BusinessProfile;
  canWrite: boolean;
};

/**
 * BusinessProfileEditor — profil bisnis owner (0053): nama bisnis,
 * nomor WhatsApp, nama pemilik, email kontak, alamat. Whatsapp dinormalisasi
 * ke +62 di server (source of truth server-side).
 */
export function BusinessProfileEditor({ profile, canWrite }: Props) {
  const [state, formAction, pending] = useActionState(updateBusinessProfileAction, initial);
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState({
    name: profile.name,
    owner_name: profile.owner_name ?? "",
    whatsapp: profile.whatsapp ?? "",
    contact_email: profile.contact_email ?? "",
    address: profile.address ?? "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form action={formAction} onSubmit={() => setTouched(true)} noValidate className="contents">
      <section
        className="border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
        aria-labelledby="business-profile-heading"
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
          <h2
            id="business-profile-heading"
            className="font-display text-lg uppercase tracking-tight"
          >
            Profil Bisnis
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            01 / PROFIL
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="profile-name" className="font-mono text-xs uppercase tracking-[0.1em]">
              Nama Bisnis
            </label>
            <Input
              id="profile-name"
              name="name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              disabled={pending || !canWrite}
            />
            {state.fieldErrors?.["name"]?.[0] && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {state.fieldErrors["name"][0]}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="profile-owner" className="font-mono text-xs uppercase tracking-[0.1em]">
              Nama Pemilik (Owner)
            </label>
            <Input
              id="profile-owner"
              name="owner_name"
              value={form.owner_name}
              onChange={(e) => set("owner_name")(e.target.value)}
              disabled={pending || !canWrite}
            />
            {state.fieldErrors?.["owner_name"]?.[0] && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {state.fieldErrors["owner_name"][0]}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="profile-whatsapp"
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Nomor WhatsApp
            </label>
            <Input
              id="profile-whatsapp"
              name="whatsapp"
              inputMode="tel"
              placeholder="0812xxxxxxxx"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp")(e.target.value)}
              disabled={pending || !canWrite}
            />
            {state.fieldErrors?.["whatsapp"]?.[0] && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {state.fieldErrors["whatsapp"][0]}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="profile-email" className="font-mono text-xs uppercase tracking-[0.1em]">
              Email Kontak
            </label>
            <Input
              id="profile-email"
              name="contact_email"
              type="email"
              value={form.contact_email}
              onChange={(e) => set("contact_email")(e.target.value)}
              disabled={pending || !canWrite}
            />
            {state.fieldErrors?.["contact_email"]?.[0] && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {state.fieldErrors["contact_email"][0]}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label
              htmlFor="profile-address"
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Alamat
            </label>
            <textarea
              id="profile-address"
              name="address"
              rows={2}
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
              disabled={pending || !canWrite}
              className="w-full rounded-none border-2 border-ink bg-surface px-3 py-2 text-base text-ink shadow-[2px_2px_0_0_#111111] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            />
            {state.fieldErrors?.["address"]?.[0] && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {state.fieldErrors["address"][0]}
              </p>
            )}
          </div>
        </div>

        {state.error && (
          <p role="alert" className="mt-4 font-mono text-xs text-destructive">
            {state.error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-4">
          <Button type="submit" disabled={pending || !canWrite} className="bg-accent">
            {pending ? "Menyimpan..." : "Simpan Profil"}
          </Button>
          {touched && state.error === undefined && state.fieldErrors === undefined && (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"TERSIMPAN"}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
