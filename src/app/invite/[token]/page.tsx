import type { Metadata } from "next";
import Link from "next/link";

import { InviteAcceptForm } from "@/components/auth/InviteAcceptForm";
import { isWellFormedAuthToken, invitationEmailMatches } from "@/lib/auth-tokens";
import { requireUser } from "@/lib/tenant";
import { lookupStaffInvitation } from "@/server/auth-tokens";

export const metadata: Metadata = { title: "Undangan Staff | SnapyOS" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();

  if (!isWellFormedAuthToken(token)) {
    return <InviteShell title="Undangan tidak valid" body="Tautan undangan tidak dikenali." />;
  }
  const lookup = await lookupStaffInvitation(token);
  if (!lookup.ok) {
    const body =
      lookup.reason === "expired"
        ? "Undangan sudah kedaluwarsa. Minta owner mengirim ulang."
        : lookup.reason === "used"
          ? "Undangan ini sudah dipakai."
          : lookup.reason === "revoked"
            ? "Undangan ini sudah dibatalkan oleh owner."
            : lookup.reason === "business"
              ? "Bisnis pengundang sedang tidak aktif."
              : "Tautan undangan tidak dikenali.";
    return <InviteShell title="Undangan tidak dapat dipakai" body={body} />;
  }
  const invitation = lookup.invitation;

  if (!user) {
    return (
      <InviteShell
        title="Masuk untuk menerima undangan"
        body={`Undangan untuk ${invitation.email} di ${invitation.businessName}. Masuk dengan akun email tersebut, lalu buka kembali tautan dari email.`}
      >
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center border-2 border-ink bg-ink px-6 font-mono text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-hard"
        >
          Ke halaman masuk
        </Link>
      </InviteShell>
    );
  }

  if (!invitationEmailMatches(invitation.email, user.email ?? "")) {
    return (
      <InviteShell
        title="Email tidak cocok"
        body={`Undangan ini ditujukan untuk ${invitation.email}, bukan akun yang sedang masuk.`}
      />
    );
  }

  return (
    <InviteShell
      title={`Gabung ${invitation.businessName}`}
      body={`Anda diundang sebagai ${invitation.role === "manager" ? "manager" : "staff"}. Dengan menerima, akun Anda mendapat akses sesuai role tersebut.`}
    >
      <InviteAcceptForm token={token} />
    </InviteShell>
  );
}

function InviteShell({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md border-2 border-ink bg-surface p-6 shadow-hard">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Undangan staff
        </p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">{title}</h1>
        <p className="mt-3 font-mono text-sm leading-relaxed">{body}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </main>
  );
}
