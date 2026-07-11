"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";

/**
 * Tracks "which text field was last focused" inside one node editor sheet, so
 * the "Fields & variables" rail panel can insert a `{{token}}` into whichever
 * field the caller was just typing in — mirroring how a floating "+" popover
 * used to insert into the one field it was attached to, just retargeted at
 * the last-focused field across the whole editor.
 *
 * Scope: one provider per NodeEditorPanel render. FieldPickerTextarea /
 * FieldPickerInput register/unregister as they mount/unmount (list rows come
 * and go), and call `focus(id)` on focus. The rail panel calls
 * `insertIntoLastFocused(token)`, which falls back to the first-registered
 * field (the editor's primary field) when nothing has been focused yet.
 */

interface FieldFocusApi {
	/** Insert `token` at the field's current cursor position. */
	insert: (token: string) => void;
}

interface FieldFocusContextValue {
	register: (id: string, api: FieldFocusApi) => () => void;
	focus: (id: string) => void;
	insertIntoLastFocused: (token: string) => void;
	/** Open the rail's "Fields & variables" panel (e.g. from a field's "+" button). */
	openPanel: () => void;
}

const FieldFocusContext = createContext<FieldFocusContextValue | null>(null);

export function FieldFocusProvider({
	openPanel,
	children,
}: {
	openPanel: () => void;
	children: React.ReactNode;
}) {
	const fieldsRef = useRef<Map<string, FieldFocusApi>>(new Map());
	const orderRef = useRef<string[]>([]);
	const lastFocusedRef = useRef<string | null>(null);

	const register = useCallback((id: string, api: FieldFocusApi) => {
		fieldsRef.current.set(id, api);
		if (!orderRef.current.includes(id)) {
			orderRef.current.push(id);
		}
		return () => {
			fieldsRef.current.delete(id);
			orderRef.current = orderRef.current.filter((existing) => existing !== id);
			if (lastFocusedRef.current === id) {
				lastFocusedRef.current = null;
			}
		};
	}, []);

	const focus = useCallback((id: string) => {
		lastFocusedRef.current = id;
	}, []);

	const insertIntoLastFocused = useCallback((token: string) => {
		const id = lastFocusedRef.current ?? orderRef.current[0];
		if (!id) {
			return;
		}
		fieldsRef.current.get(id)?.insert(token);
	}, []);

	const value = useMemo<FieldFocusContextValue>(
		() => ({ register, focus, insertIntoLastFocused, openPanel }),
		[register, focus, insertIntoLastFocused, openPanel],
	);

	return <FieldFocusContext.Provider value={value}>{children}</FieldFocusContext.Provider>;
}

/** Nullable — fields render fine (just without insert-tracking) outside a provider. */
export function useFieldFocus() {
	return useContext(FieldFocusContext);
}
