"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/ui/breadcrumb";
import { ADMIN_NAV_LABELS } from "@/components/admin/sidebar-08/nav-data";

type Crumb = { title: string; href: string };

const LABEL_BY_URL = new Map(ADMIN_NAV_LABELS.map((item) => [item.url, item.title]));

function labelFor(href: string, segment: string): string {
  const known = LABEL_BY_URL.get(href);
  if (known) return known;
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return "Detail";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ title: "Admin", href: "/admin" }];

  let href = "";
  for (const segment of segments) {
    href += `/${segment}`;
    if (href === "/admin") continue;
    crumbs.push({ title: labelFor(href, segment), href });
  }

  return crumbs;
}

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbItem className={index === 0 ? "hidden md:block" : undefined}>
                {isLast ? (
                  <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.title}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : (
                <BreadcrumbSeparator className={index === 0 ? "hidden md:block" : undefined} />
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
