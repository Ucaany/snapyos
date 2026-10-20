import { DitheredFooter, type DitheredFooterProps } from "@/components/footer";

/**
 * SiteFooter — wrapper server agar tahun copyright dihitung di server,
 * bukan saat render client (mencegah hydration mismatch New Year boundary).
 */
export function SiteFooter(props: DitheredFooterProps) {
  return (
    <DitheredFooter
      {...props}
      copyright={props.copyright ?? `© ${new Date().getFullYear()} SnapyOS.`}
    />
  );
}
