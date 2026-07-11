"use client";

import { cn } from "@repo/ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { avatarClasses, initials } from "@shared/lib/avatar";
import { SourcePhoneNumbers } from "@sources/components/SourcePhoneNumbers";
import { useDisconnectSourceMutation, useSourceQuery } from "@sources/lib/api";
import { ArrowLeftIcon, Unlink2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/** Per-source settings screen: connection status plus a seam for the phone-numbers work to come. */
export function SourceDetail({ sourceId }: { sourceId: string }) {
	const { data: source, isLoading } = useSourceQuery(sourceId);
	const disconnectMutation = useDisconnectSourceMutation();
	const [confirmDisconnect, setConfirmDisconnect] = useState(false);

	if (isLoading) {
		return (
			<div className="gap-6 flex flex-col">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-48" />
			</div>
		);
	}

	if (!source) {
		return (
			<div className="gap-4 flex flex-col items-start">
				<BackLink />
				<p className="opacity-60">Source not found.</p>
			</div>
		);
	}

	const isConnected = source.status === "CONNECTED";

	async function handleDisconnect() {
		try {
			await disconnectMutation.mutateAsync(sourceId);
			toastSuccess("Source disconnected");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not disconnect source");
		} finally {
			setConfirmDisconnect(false);
		}
	}

	return (
		<div className="gap-6 flex flex-col">
			<div className="gap-3 flex items-center">
				<BackLink />
			</div>

			<div className="gap-4 flex items-center">
				<span
					className={cn(
						"size-12 font-medium text-lg flex shrink-0 items-center justify-center rounded-full",
						avatarClasses(source.name),
					)}
				>
					{initials(source.name)}
				</span>
				<div className="min-w-0">
					<h1 className="font-medium text-2xl truncate">{source.name}</h1>
					<div className="gap-2 mt-1 flex items-center">
						<span className="px-2 py-0.5 text-xs font-medium inline-flex items-center rounded-full border bg-muted text-muted-foreground">
							{source.providerType}
						</span>
						<StatusPill status={source.status} />
					</div>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Source details</CardTitle>
					<CardDescription>Basic information about this connected CRM sub-account.</CardDescription>
				</CardHeader>
				<CardContent className="gap-4 sm:grid-cols-2 grid grid-cols-1">
					{/* TODO: no update/rename procedure exists for sources yet — fields are read-only until one lands. */}
					<Field label="Source name" value={source.name} />
					<Field label="Provider" value={source.providerType} />
					<Field label="Subaccount / location" value={source.accountName ?? "—"} />
					<Field label="Address" value={source.address ?? "—"} />
					<Field label="Connected agents" value={String(source.connectedAgentsCount)} />
					<Field label="Connected on" value={new Date(source.createdAt).toLocaleDateString()} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						{isConnected
							? "This source is connected and syncing with its CRM."
							: "This source has been disconnected and is no longer syncing."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isConnected ? (
						<Button
							variant="destructive"
							onClick={() => setConfirmDisconnect(true)}
							disabled={disconnectMutation.isPending}
						>
							<Unlink2Icon className="size-4" /> Disconnect
						</Button>
					) : (
						// TODO: wire up a reconnect action once a per-source reconnect procedure exists
						// (today's oauthUrl/connect flow creates a new source rather than re-authing this one).
						<p className="text-sm opacity-60">
							Reconnecting isn't available yet — disconnect and add this source again from the
							Sources page.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Phone numbers</CardTitle>
					<CardDescription>Buy and manage numbers for this subaccount.</CardDescription>
				</CardHeader>
				<CardContent>
					<SourcePhoneNumbers sourceId={sourceId} />
				</CardContent>
			</Card>

			<AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect {source.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							Agents attached to {source.name} stop syncing and receiving calls from it. This cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDisconnect}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							Disconnect
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			href="/sources"
			className="gap-1.5 text-sm flex items-center text-muted-foreground hover:text-foreground"
		>
			<ArrowLeftIcon className="size-4" /> Back to Sources
		</Link>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="font-medium truncate">{value}</p>
		</div>
	);
}

function StatusPill({ status }: { status: "CONNECTED" | "DISCONNECTED" }) {
	const isConnected = status === "CONNECTED";
	return (
		<span
			className={cn(
				"gap-1 px-2 py-0.5 text-xs font-medium inline-flex items-center rounded-full",
				isConnected
					? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "bg-muted text-muted-foreground",
			)}
		>
			{isConnected ? "Connected" : "Disconnected"}
		</span>
	);
}
