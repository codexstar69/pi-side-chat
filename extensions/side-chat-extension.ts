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
import { loadSideChatConfig } from "./side-chat-settings";

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

	function resolveModel(commandContext: ExtensionContext, config: ReturnType<typeof loadSideChatConfig>): any | null {
		// If a custom model is configured, try to find it in the registry
		if (config.model) {
			try {
				const all = (commandContext.modelRegistry as any).getAll?.() || [];
				const found = all.find((m: any) =>
					m.id === config.model || `${m.provider}/${m.id}` === config.model
				);
				if (found && isModelLike(found)) return found;
			} catch { /* fall through to session model */ }
		}
		const model = commandContext.model;
		return model && isModelLike(model) ? model : null;
	}

	async function openSideChat(commandContext: ExtensionContext) {
		if (chatOpenInProgress) return;
		if (chatOverlayHandle) {
			chatOverlayHandle.isFocused()
				? chatOverlayHandle.unfocus()
				: chatOverlayHandle.focus();
			return;
		}
		if (!(commandContext as any).hasUI) return;

		const config = loadSideChatConfig();
		if (!config.enabled) {
			commandContext.ui.notify("Side chat is disabled. Enable it in /sidechat-settings", "info");
			return;
		}

		const chatModel = resolveModel(commandContext, config);
		if (!chatModel) {
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
						width: (config.overlayWidth || "92%") as any,
						maxHeight: (config.overlayMaxHeight || "60%") as any,
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

	pi.registerCommand("sidechat-settings", {
		description: "Side chat settings \u2014 model, overlay size, shortcuts",
		handler: async (_args: string | undefined, commandContext: ExtensionContext) => {
			try {
				const { openSideChatSettings } = await import("./side-chat-settings");
				await openSideChatSettings(commandContext);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				console.error(`[side-chat] settings failed: ${msg}`);
				try { commandContext.ui.notify(`Settings failed to open: ${msg}`, "error"); } catch { /* */ }
			}
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

	// Dispose the overlay before pi tears down the active session on /new, /fork,
	// /resume, /reload, or /quit. The overlay captured a sessionManager bound to
	// the outgoing session; touching it via peek_main after replacement throws
	// in pi >= 0.69.0 ("stale extension context") instead of silently misrouting.
	// dispose() is synchronous (stopSpinner/agentUnsub/onClose all sync), so no
	// await is needed and no other handler can interleave mid-call.
	pi.on("session_shutdown", () => {
		if (!chatOverlayRef) return;
		try {
			chatOverlayRef.dispose();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[side-chat] session_shutdown dispose failed: ${msg}`);
		} finally {
			chatOverlayRef = null;
			chatOverlayHandle = null;
		}
	});
}
