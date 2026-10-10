import { cn } from "@/lib/utils";
import { Phone, Mail, MapPin } from "lucide-react";

const data = [
	{
		title: "Telepon",
		value: "+62 898 3704 013",
		icon: (
			<Phone
			/>
		),
	},
	{
		title: "Email",
		value: "hi@snapyos.web.id",
		icon: (
			<Mail
			/>
		),
	},
	{
		title: "Alamat",
		value: "Cikoko, Jakarta Selatan",
		icon: (
			<MapPin
			/>
		),
	},
];

export function Contact() {
	return (
		<div className="mx-auto max-w-4xl">
			<div className="relative">
				<div className="grid gap-px overflow-hidden md:grid-cols-3">
					{data.map((item) => (
						<div
							className="flex items-center gap-3 bg-background p-2 shadow-xs"
							key={item.title}
						>
							<div
								className={cn(
									"flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted/50",
									"[&_svg]:size-4 [&_svg]:text-muted-foreground"
								)}
							>
								{item.icon}
							</div>
							<div className={cn("flex flex-col gap-y-0.5")}>
								<h2 className="text-sm">{item.title}</h2>
								<p className="text-muted-foreground text-xs">{item.value}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
