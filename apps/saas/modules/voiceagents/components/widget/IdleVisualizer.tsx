import { cn } from "@repo/ui";

/**
 * Non-audio voice visualizer variants (pulse / waveform / dots), shared by the
 * live WidgetApp and the static Studio preview so what a merchant picks matches
 * what ships. Kept free of LiveKit imports so the Studio bundle stays light;
 * `active` drives the animation intensity (idle vs. talking).
 */
export function IdleVisualizer({
	variant,
	active,
}: {
	variant: "pulse" | "waveform" | "dots";
	active: boolean;
}) {
	return (
		<div className="h-16 gap-2 py-3 flex shrink-0 items-center justify-center rounded-lg bg-muted/50">
			{variant === "pulse" && (
				<span className="size-6 relative flex items-center justify-center">
					{active && (
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40" />
					)}
					<span className="size-6 relative inline-flex rounded-full bg-primary" />
				</span>
			)}
			{variant === "waveform" &&
				[0, 1, 2, 3, 4, 5, 6].map((i) => (
					<span
						key={i}
						className={cn("w-1.5 rounded-full bg-primary", active && "animate-pulse")}
						style={{
							height: `${active ? 12 + ((i * 7) % 24) : 8}px`,
							animationDelay: `${i * 90}ms`,
						}}
					/>
				))}
			{variant === "dots" &&
				[0, 1, 2].map((i) => (
					<span
						key={i}
						className={cn("size-2.5 rounded-full bg-primary", active && "animate-bounce")}
						style={{ animationDelay: `${i * 150}ms` }}
					/>
				))}
		</div>
	);
}
