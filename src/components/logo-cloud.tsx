export function LogoCloud() {
	return (
		<div className="relative flex flex-wrap items-center justify-center gap-x-10 gap-y-8 py-6 sm:gap-x-12 sm:gap-y-12">
			{logos.map((logo) => (
				<img
					alt={logo.alt}
					className="pointer-events-none h-6 w-fit select-none object-contain"
					height="auto"
					key={logo.alt}
					loading="lazy"
					src={logo.src}
					width="auto"
				/>
			))}
		</div>
	);
}

const logos = [
	{ src: "/payment-logos/pakasir.png", alt: "Pakasir" },
	{ src: "/payment-logos/midtrans.svg", alt: "Midtrans" },
	{ src: "/payment-logos/tripay.png", alt: "Tripay" },
];
