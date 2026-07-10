"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { VOICE_GROUPS } from "../../AgentForm";
import type { FlowNodeData, TransferNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

const KEEP_VOICE = "__keep__";

export function TransferNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: TransferNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<TransferNodeData>(nodeId, data, onChange);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Transfer to booking"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Announcement</Label>
				<Textarea
					rows={2}
					value={data.say}
					onChange={(e) => patch({ say: e.target.value })}
					placeholder="One moment please — let me transfer you to the right person."
				/>
				<p className="text-xs opacity-50">
					Spoken in the current voice right before the hold music. Supports {"{{variables}}"}; leave
					empty to jump straight to the music.
				</p>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>Hold music (seconds)</Label>
				<Input
					type="number"
					min={0}
					max={30}
					step={1}
					value={data.holdSeconds}
					onChange={(e) =>
						patch({ holdSeconds: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })
					}
				/>
				<p className="text-xs opacity-50">
					How long the caller hears hold music before the next "person" picks up. 0 skips the music.
				</p>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>Voice after the transfer</Label>
				<Select
					value={data.voiceId ?? KEEP_VOICE}
					onValueChange={(value) => {
						if (value === KEEP_VOICE) {
							patch({ voiceId: undefined, voiceProvider: undefined });
							return;
						}
						const voice = VOICE_GROUPS.flatMap((group) => group.voices).find((v) => v.id === value);
						patch({ voiceId: value, voiceProvider: voice?.provider });
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={KEEP_VOICE}>Keep the current voice</SelectItem>
						{VOICE_GROUPS.map((group) => (
							<SelectGroup key={group.provider}>
								<SelectLabel>{group.label}</SelectLabel>
								{group.voices.map((voice) => (
									<SelectItem key={voice.id} value={voice.id}>
										{voice.label}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs opacity-50">
					The caller hears this voice from here on — pick a different one so the transfer feels like
					a real hand-off.
				</p>
			</div>
		</>
	);
}
