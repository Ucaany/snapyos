import type { LinkItemType } from "@/components/sheard";
import {
  CameraIcon,
  UsersIcon,
  WalletIcon,
  FileTextIcon,
  ShieldIcon,
  RotateCcwIcon,
  HelpCircleIcon,
} from "lucide-react";

export const productLinks: LinkItemType[] = [
  {
    label: "Harga",
    href: "/#pricing",
    description: "Lihat paket dan add-on SnapyOS",
    icon: <WalletIcon />,
  },
  {
    label: "Kiosk Photobox",
    href: "/#kiosk",
    description: "Simulasi alur customer di kiosk",
    icon: <CameraIcon />,
  },
  {
    label: "Dokumentasi",
    href: "/docs",
    description: "Panduan dan referensi teknis",
    icon: <FileTextIcon />,
  },
];

export const companyLinks: LinkItemType[] = [
  {
    label: "Tentang Kami",
    href: "/tentang-kami",
    description: "Tentang SnapyOS dan tim kami",
    icon: <UsersIcon />,
  },
  {
    label: "Kontak",
    href: "/kontak",
    description: "Hubungi tim SnapyOS",
    icon: <HelpCircleIcon />,
  },
];

export const legalLinks: LinkItemType[] = [
  {
    label: "Ketentuan Layanan",
    href: "/ketentuan-layanan",
    icon: <FileTextIcon />,
  },
  {
    label: "Kebijakan Privasi",
    href: "/kebijakan-privasi",
    icon: <ShieldIcon />,
  },
  {
    label: "Kebijakan Refund",
    href: "/kebijakan-refund",
    icon: <RotateCcwIcon />,
  },
];
