/** Pastel avatar palettes that hold up in both light and dark mode. */
const AVATAR_PALETTES = [
	"bg-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
	"bg-orange-200 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
	"bg-amber-200 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
	"bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
	"bg-teal-200 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
	"bg-sky-200 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
	"bg-indigo-200 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
	"bg-fuchsia-200 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200",
] as const;

/** Deterministic pastel classes from a hash of the identity string. */
export function avatarClasses(identity: string): string {
	let hash = 0;
	for (let i = 0; i < identity.length; i++) {
		hash = (hash * 31 + identity.charCodeAt(i)) | 0;
	}
	return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

/** "Jane Doe" → "JD", "+15551234567" → "+1", "Web test" → "WT". */
export function initials(name: string): string {
	const words = name.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return `${words[0][0]}${words[1][0]}`.toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}
