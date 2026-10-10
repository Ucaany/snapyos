import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { companyLinks, legalLinks, productLinks } from "@/components/nav-links";
import { LinkItem } from "@/components/sheard";
import Link from "next/link";

export function DesktopNav() {
	return (
		<NavigationMenu className="hidden md:flex">
			<NavigationMenuList>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="bg-transparent">
						Produk
					</NavigationMenuTrigger>
					<NavigationMenuContent className="p-1 pr-1.5">
						<div className="grid w-lg grid-cols-2 gap-2 rounded-none border-2 border-ink bg-surface p-2 shadow-[4px_4px_0_0_#111111]">
							{productLinks.map((item, i) => (
								<NavigationMenuLink
									key={`item-${item.label}-${i}`}
									render={<LinkItem {...item} />}
								/>
							))}
						</div>
						<div className="p-2">
							<p className="text-muted-foreground text-sm">
								Tertarik?{" "}
								<Link
									className="font-medium text-foreground hover:underline"
									href="/kontak"
								>
									Hubungi tim kami
								</Link>
							</p>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="bg-transparent">
						Perusahaan
					</NavigationMenuTrigger>
					<NavigationMenuContent className="p-1 pr-1.5 pb-1.5">
						<div className="grid w-lg grid-cols-2 gap-2">
							<div className="space-y-2 rounded-none border-2 border-ink bg-surface p-2 shadow-[4px_4px_0_0_#111111]">
								{companyLinks.map((item, i) => (
									<NavigationMenuLink
										className="rounded-sm"
										key={`item-${item.label}-${i}`}
										render={<LinkItem {...item} />}
									/>
								))}
							</div>
							<div className="space-y-2 p-3">
								{legalLinks.map((item, i) => (
									<NavigationMenuLink
										href={item.href}
										key={`item-${item.label}-${i}`}
									>
										{item.icon}
										{item.label}
									</NavigationMenuLink>
								))}
							</div>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuLink
					className="px-2.5 h-9 inline-flex items-center rounded-none text-sm font-medium hover:bg-muted"
					href="/docs"
				>
					Dokumentasi
				</NavigationMenuLink>
			</NavigationMenuList>
		</NavigationMenu>
	);
}
