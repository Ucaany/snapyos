"use client";

import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/admin/ui/alert";
import { Button } from "@/components/admin/ui/button";

export default function AdminBusinessDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Alert variant="destructive" className="max-w-lg">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>Gagal memuat detail bisnis</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>
            Data tenant tidak bisa diambil. Coba lagi; jika berlanjut, periksa koneksi Supabase.
          </span>
          {error.digest ? (
            <span className="text-xs text-muted-foreground">Digest: {error.digest}</span>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={reset}>
            Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
