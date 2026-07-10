"use client";

import { Button } from "@repo/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { openOAuthPopup } from "@voiceagents/lib/oauth-popup";
import { useState } from "react";

import {
	useConnectSourceMutation,
	useSourceOauthUrlMutation,
	useSourceProvidersQuery,
} from "../lib/api";

/**
 * "Add New Source" dialog: one card per registered CRM provider
 * (wabridge pattern) — new providers registered on the server appear here
 * automatically, no UI changes needed.
 */
export function ConnectSourceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data, isLoading } = useSourceProvidersQuery();
	const connectMutation = useConnectSourceMutation();
	const oauthUrlMutation = useSourceOauthUrlMutation();
	const [connectingType, setConnectingType] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [config, setConfig] = useState<Record<string, string>>({});
	const [oauthPending, setOauthPending] = useState<string | null>(null);

	const reset = () => {
		setConnectingType(null);
		setName("");
		setConfig({});
	};

	const connecting = data?.providers.find((p) => p.type === connectingType) ?? null;

	const connectViaOauth = async (providerType: string, label: string) => {
		setOauthPending(providerType);
		try {
			const { url } = await oauthUrlMutation.mutateAsync(providerType);
			const result = await openOAuthPopup(url);
			if (result.success) {
				toastSuccess(`${label} connected`);
				onOpenChange(false);
			} else if (result.error) {
				toastError(result.error);
			}
		} catch (err) {
			toastError(err instanceof Error ? err.message : `Could not start ${label} connect`);
		} finally {
			setOauthPending(null);
		}
	};

	const connect = async () => {
		if (!connecting) return;
		try {
			const res = await connectMutation.mutateAsync({
				name: name.trim() || undefined,
				providerType: connecting.type,
				config,
			});
			toastSuccess(`Connected ${res.name}`);
			reset();
			onOpenChange(false);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Connection failed");
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{connecting ? `Connect ${connecting.label}` : "Add New Source"}</DialogTitle>
				</DialogHeader>

				{!connecting ? (
					<div className="gap-2 flex flex-col">
						{isLoading && <p className="text-sm opacity-60">Loading providers…</p>}
						{data?.providers.map((provider) => (
							<button
								key={provider.type}
								type="button"
								disabled={oauthPending === provider.type}
								onClick={() => {
									if (provider.authType === "oauth") {
										void connectViaOauth(provider.type, provider.label);
									} else {
										setConnectingType(provider.type);
									}
								}}
								className="gap-0.5 p-3 flex flex-col rounded-lg border text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
							>
								<span className="font-medium text-sm">{provider.label}</span>
								<span className="text-xs opacity-60">{provider.description}</span>
							</button>
						))}
					</div>
				) : (
					<div className="gap-3 flex flex-col">
						<div>
							<Label>Source name</Label>
							<Input
								placeholder={connecting.label}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						{connecting.connectFields.map((field) => (
							<div key={field.name}>
								<Label>{field.label}</Label>
								{field.help && <p className="text-xs mb-1 opacity-60">{field.help}</p>}
								<Input
									type={field.secret ? "password" : "text"}
									placeholder={field.placeholder}
									value={config[field.name] ?? ""}
									onChange={(e) => setConfig((prev) => ({ ...prev, [field.name]: e.target.value }))}
								/>
							</div>
						))}
						<div className="gap-2 flex justify-end">
							<Button variant="outline" onClick={() => setConnectingType(null)}>
								Back
							</Button>
							<Button
								loading={connectMutation.isPending}
								disabled={connecting.connectFields.some((f) => !config[f.name]?.trim())}
								onClick={connect}
							>
								Connect
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
