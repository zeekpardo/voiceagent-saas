"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../lib";

const Slider = ({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) => (
	<SliderPrimitive.Root
		className={cn("relative flex w-full touch-none items-center select-none", className)}
		{...props}
	>
		<SliderPrimitive.Track className="h-2 relative w-full grow overflow-hidden rounded-full bg-secondary">
			<SliderPrimitive.Range className="absolute h-full bg-primary" />
		</SliderPrimitive.Track>
		<SliderPrimitive.Thumb className="h-4 w-4 block rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" />
	</SliderPrimitive.Root>
);

export { Slider };
