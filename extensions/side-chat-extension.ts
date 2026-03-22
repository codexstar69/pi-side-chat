/**
 * pi-side-chat — Standalone side chat extension for Pi CLI.
 *
 * Provides a parallel AI agent with read-only tools and peek_main
 * for monitoring the main agent's activity.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let chatOverlayHandle: { focus: () => void; unfocus: () => void; isFocused: () => boolean } | null = null;
	let chatOverlayRef: any = null;
	let chatOpenInProgress = false;

	const CHAT_SHORTCUT = "alt+/";
	const CHAT_SHORTCUT_DISPLAY = process.platform === "darwin" ? "\u2325/" : "Alt+/";

	function isModelLike(model: unknown): boolean {
		return (
			model !== null
			&& typeof model === "object"
			&& typeof (model as any).id === "string"
			&& typeof (model as any).provider === "string"
		);
	}

	async function openSideChat(commandContext: ExtensionContext) {
		if (chatOpenInProgress) return;
		if (!(commandContext as any).hasUI) return;
		if (chatOverlayHandle) {
			chatOverlayHandle.isFocused()
				? chatOverlayHandle.unfocus()
				: chatOverlayHandle.focus();
			return;
		}

		const chatModel = commandContext.model;
		if (!chatModel || !isModelLike(chatModel)) {
			commandContext.ui.notify("Cannot open side chat: no model configured.", "error");
			return;
		}

		chatOpenInProgress = true;
		try {
			const { SideChatOverlay } = await import("./side-chat-overlay");
			const thinkingLevel = pi.getThinkingLevel();

			await commandContext.ui.custom(
				(tui: any, theme: any, _kb: any, done: (v?: any) => void) => {
					const overlay = new SideChatOverlay({
						tui,
						theme,
						model: chatModel as any,
						cwd: commandContext.cwd,
						thinkingLevel: (thinkingLevel === "off" ? "off" : thinkingLevel) as any,
						modelRegistry: commandContext.modelRegistry,
						sessionManager: commandContext.sessionManager as any,
						shortcut: CHAT_SHORTCUT_DISPLAY,
						onUnfocus: () => { chatOverlayHandle?.unfocus(); },
						onClose: () => {
							chatOverlayRef = null;
							chatOverlayHandle = null;
							done();
						},
					});
					chatOverlayRef = overlay;
					return overlay;
				},
				{
					overlay: true,
					overlayOptions: {
						width: "92%" as any,
						maxHeight: "60%" as any,
						anchor: "center" as any,
						margin: { top: 0, left: 1, right: 1 } as any,
						nonCapturing: true,
					} as any,
					onHandle: (handle: any) => {
						chatOverlayHandle = handle;
						handle.focus();
					},
				},
			);
		} catch (error) {
			chatOverlayHandle = null;
			chatOverlayRef = null;
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`[side-chat] openSideChat failed: ${msg}`);
			try { commandContext.ui.notify(`Side chat failed to open: ${msg}`, "error"); } catch { /* ui may be unavailable */ }
		} finally {
			chatOpenInProgress = false;
		}
	}

	pi.registerCommand("sidechat", {
		description: "Open side chat \u2014 parallel agent with read-only tools",
		handler: async (_args: string | undefined, commandContext: ExtensionContext) => {
			await openSideChat(commandContext);
		},
	});

	try {
		pi.registerShortcut(CHAT_SHORTCUT as any, {
			description: "Toggle side chat",
			handler: async (shortcutCtx: any) => {
				await openSideChat(shortcutCtx);
			},
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[side-chat] registerShortcut failed: ${msg}`);
	}
}
