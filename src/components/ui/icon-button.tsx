"use client";

import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type Side = "top" | "bottom" | "left" | "right";

type CommonProps = {
  label: string;
  icon: LucideIcon;
  variant?: Variant;
  compact?: boolean;
  side?: Side;
  className?: string;
  /** Teks tooltip tambahan saat label aksesibel perlu konteks (mis. alasan disabled). */
  hint?: string;
};

function TooltipShell({
  label,
  side,
  trigger,
  children,
}: {
  label: string;
  side: Side;
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delay={350}>
      <Tooltip>
        <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Tombol ikon dengan nama aksesibel, tooltip brutalist, dan hit area 44px. */
export function IconButton({
  label,
  icon: Icon,
  variant = "outline",
  compact = false,
  side = "top",
  className,
  hint,
  type = "button",
  ...props
}: CommonProps & {
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}) {
  const trigger = (
    <Button
      type={type}
      variant={variant}
      size={compact ? "icon-compact" : "icon-sm"}
      aria-label={label}
      title={hint ?? label}
      className={className}
      {...props}
    />
  );

  return (
    <TooltipShell label={hint ?? label} side={side} trigger={trigger}>
      <Icon className="size-4" aria-hidden="true" />
    </TooltipShell>
  );
}

/** Tautan ikon dengan kontrak aksesibilitas yang sama seperti IconButton. */
export function IconLink({
  href,
  label,
  icon: Icon,
  variant = "outline",
  compact = false,
  side = "top",
  className,
  target,
  rel,
  download,
}: CommonProps & {
  href: string;
  target?: string;
  rel?: string;
  download?: string | boolean;
}) {
  const trigger = (
    <Link
      href={href}
      target={target}
      rel={rel}
      download={download}
      aria-label={label}
      title={label}
      className={cn(
        buttonVariants({ variant, size: compact ? "icon-compact" : "icon-sm" }),
        className
      )}
    />
  );

  return (
    <TooltipShell label={label} side={side} trigger={trigger}>
      <Icon className="size-4" aria-hidden="true" />
    </TooltipShell>
  );
}