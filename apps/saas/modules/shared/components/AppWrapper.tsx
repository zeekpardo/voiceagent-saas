"use client";

import { cn } from "@repo/ui";
import type { PropsWithChildren } from "react";

import { SidebarProvider, useSidebar } from "../lib/sidebar-context";
import { NavBar } from "./NavBar";

function AppContent({ children }: PropsWithChildren) {
	const { isCollapsed } = useSidebar();

	return (
		<div className="md:h-screen md:overflow-hidden bg-background">
			<NavBar />
			<div
				className={cn("md:py-2 md:pr-2 flex h-screen", {
					"md:ml-[280px]": !isCollapsed,
					"md:ml-[80px]": isCollapsed,
				})}
			>
				<main className="md:border md:rounded-2xl md:overflow-y-auto py-6 h-full w-full border-t bg-card">
					{/* Pages marked data-fullbleed (inbox, canvas workspace) escape the
					    centered max-width and use the whole main area. */}
					<div className="container [&:has([data-fullbleed])]:max-w-none">{children}</div>
				</main>
			</div>
		</div>
	);
}

export function AppWrapper({ children }: PropsWithChildren) {
	return (
		<SidebarProvider>
			<AppContent>{children}</AppContent>
		</SidebarProvider>
	);
}
