import { createFocusTrap, usePortal } from '$lib/internal/actions';
import {
	addEventListener,
	effect,
	generateId,
	hiddenAction,
	isBrowser,
	noop,
	sleep,
	styleToString,
} from '$lib/internal/helpers';
import { removeScroll } from '$lib/internal/helpers/scroll';
import type { Defaults } from '$lib/internal/types';
import { tick } from 'svelte';
import { derived, writable } from 'svelte/store';

export type CreateDialogArgs = {
	preventScroll?: boolean;
	closeOnEscape?: boolean;
	closeOnOutsideClick?: boolean;
	role?: 'dialog' | 'alertdialog';
};

const defaults = {
	preventScroll: true,
	closeOnEscape: true,
	closeOnOutsideClick: true,
	role: 'dialog',
} satisfies Defaults<CreateDialogArgs>;

export function createDialog(args: CreateDialogArgs = {}) {
	const withDefaults = { ...defaults, ...args };
	const options = writable({ ...withDefaults });
	const activeTrigger = writable<HTMLElement | null>(null);

	const ids = {
		content: generateId(),
		title: generateId(),
		description: generateId(),
	};

	const open = writable(false);

	const trigger = {
		...derived(open, ($open) => {
			return {
				'aria-haspopup': 'dialog',
				'aria-expanded': $open,
				'aria-controls': ids.content,
				type: 'button',
			} as const;
		}),
		action: (node: HTMLElement) => {
			const unsub = addEventListener(node, 'click', (e) => {
				const el = e.currentTarget as HTMLElement;
				open.set(true);
				activeTrigger.set(el);
			});

			return {
				destroy: unsub,
			};
		},
	};

	const overlay = derived([open], ([$open]) => {
		return {
			hidden: $open ? undefined : true,
			tabindex: -1,
			style: styleToString({
				display: $open ? undefined : 'none',
			}),
			'aria-hidden': true,
			'data-state': $open ? 'open' : 'closed',
		} as const;
	});

	const contentDerived = derived(open, ($open) => {
		return {
			id: ids.content,
			role: 'dialog',
			'aria-describedby': ids.description,
			'aria-labelledby': ids.title,
			'data-state': $open ? 'open' : 'closed',
			tabindex: -1,
			hidden: $open ? undefined : true,
		};
	});

	const content = {
		...contentDerived,
		action: (node: HTMLElement) => {
			let unsub = noop;

			effect([open, content, options], ([$open, $content, $options]) => {
				tick().then(() => {
					if (node.hidden) return;
					console.log('setFocusTrap');
					const { useFocusTrap } = createFocusTrap({
						immediate: true,
						escapeDeactivates: false,
						allowOutsideClick: (e) => {
							e.preventDefault();
							if ($options.closeOnOutsideClick) {
								open.set(false);
							}

							return false;
						},
						returnFocusOnDeactivate: false,
					});
					const ac = useFocusTrap(node);
					if (ac && ac.destroy) {
						const d = ac.destroy;

						unsub = () => {
							console.log('destroying focus trap');
							d();
						};
					}
				});

				return () => unsub();
			});

			return {
				destroy: unsub,
			};
		},
	};

	const title = {
		id: ids.title,
	};

	const description = {
		id: ids.description,
	};

	const close = hiddenAction({
		type: 'button',
		action: (node: HTMLElement) => {
			const unsub = addEventListener(node, 'click', () => {
				open.set(false);
			});

			return {
				destroy: unsub,
			};
		},
	} as const);

	effect([open, options], ([$open, $options]) => {
		const unsubs: Array<() => void> = [];
		if ($options.closeOnEscape && $open) {
			unsubs.push(
				addEventListener(document, 'keydown', (e) => {
					if (e.key === 'Escape') {
						open.set(false);
					}
				})
			);
		}

		if ($options.preventScroll && $open) unsubs.push(removeScroll());

		return () => {
			unsubs.forEach((unsub) => unsub());
		};
	});

	effect([open, activeTrigger], ([$open, $activeTrigger]) => {
		if (!isBrowser) return;

		if (!$open && $activeTrigger && isBrowser) {
			// Prevent the keydown event from triggering on the trigger
			sleep(1).then(() => $activeTrigger.focus());
		}
	});

	return {
		options,
		open,
		trigger,
		overlay,
		portal: usePortal,
		content,
		title,
		description,
		close,
	};
}
