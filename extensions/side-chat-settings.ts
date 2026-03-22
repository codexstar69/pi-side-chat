/**
 * Side Chat Settings Panel — interactive TUI overlay with tab navigation.
 * LEFT/RIGHT switches tabs, UP/DOWN navigates rows, ENTER selects, ESC closes.
 * Fully responsive — adapts to any terminal width.
 *
 * Tabs: Chat · Model · Shortcuts · About
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

// ─── Config persistence ──────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), ".pi", "side-chat");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface SideChatConfig {
	enabled: boolean;
	model: string; // empty = use session model
	overlayWidth: string; // e.g., "92%"
	overlayMaxHeight: string; // e.g., "60%"
}

const DEFAULT_CONFIG: SideChatConfig = {
	enabled: true,
	model: "",
	overlayWidth: "92%",
	overlayMaxHeight: "60%",
};

export function loadSideChatConfig(): SideChatConfig {
	try {
		if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
		const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as Partial<SideChatConfig>;
		return {
			enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_CONFIG.enabled,
			model: typeof parsed.model === "string" ? parsed.model : DEFAULT_CONFIG.model,
			overlayWidth: typeof parsed.overlayWidth === "string" ? parsed.overlayWidth : DEFAULT_CONFIG.overlayWidth,
			overlayMaxHeight: typeof parsed.overlayMaxHeight === "string" ? parsed.overlayMaxHeight : DEFAULT_CONFIG.overlayMaxHeight,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function saveSideChatConfig(config: SideChatConfig): boolean {
	try {
		fs.mkdirSync(CONFIG_DIR, { recursive: true });
		const tmp = CONFIG_FILE + ".tmp." + process.pid;
		fs.writeFileSync(tmp, JSON.stringify(config, null, "\t"));
		fs.renameSync(tmp, CONFIG_FILE);
		return true;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[side-chat] saveSideChatConfig failed: ${msg}`);
		return false;
	}
}

// ─── Tab indices ─────────────────────────────────────────────────────────────

const TAB_CHAT = 0;
const TAB_MODEL = 1;
const TAB_SHORTCUTS = 2;
const TAB_ABOUT = 3;

const TABS = ["Chat", "Model", "Shortcuts", "About"];

// ─── Shortcut reference ──────────────────────────────────────────────────────

const SHORTCUT_GROUPS: { section: string; items: [string, string][] }[] = [
	{
		section: "Chat Overlay",
		items: [
			["Alt+/", "Toggle side chat (open/focus/unfocus)"],
			["Enter", "Send message"],
			["Esc", "Abort streaming / close chat"],
			["Alt+\u2191", "Scroll up"],
			["Alt+\u2193", "Scroll down"],
			["PageUp", "Scroll up (alt)"],
			["PageDown", "Scroll down (alt)"],
		],
	},
	{
		section: "Quick Commands",
		items: [
			["help", "Show available commands"],
			["analyze", "Detailed analysis of main agent work"],
			["stuck", "Check if main agent is stuck"],
			["recap", "Session summary"],
			["status", "Quick status check"],
		],
	},
	{
		section: "Slash Commands",
		items: [
			["/sidechat", "Open side chat overlay"],
			["/sidechat-settings", "This settings panel"],
		],
	},
];

// ─── Overlay size options ────────────────────────────────────────────────────

const WIDTH_OPTIONS = ["75%", "85%", "92%", "100%"];
const HEIGHT_OPTIONS = ["40%", "50%", "60%", "70%", "85%"];

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const DIM = "\x1b[38;5;240m";
const BRT = "\x1b[38;5;255m";
const ACC = "\x1b[38;5;117m";
const SEL = "\x1b[38;5;214m";
const GRN = "\x1b[38;5;114m";
const YEL = "\x1b[38;5;220m";
const RST = "\x1b[0m";

// ─── Settings panel ──────────────────────────────────────────────────────────

type SubMode = "main" | "model-picker";

class SideChatSettingsPanel {
	private tab = TAB_CHAT;
	private row = 0;
	private sub: SubMode = "main";
	private subRow = 0;
	private search = "";
	private filtered: { name: string; id: string }[] = [];
	public modelList: string[] = [];
	public config: SideChatConfig;
	private cw?: number;
	private cl?: string[];
	private lastIw = 60;
	private statusMsg = "";
	private statusTimer: ReturnType<typeof setTimeout> | null = null;
	public onClose?: () => void;

	constructor() {
		this.config = loadSideChatConfig();
	}

	private inv() { this.cw = undefined; this.cl = undefined; }

	private showStatus(msg: string, durationMs = 2000) {
		this.statusMsg = msg;
		if (this.statusTimer) clearTimeout(this.statusTimer);
		this.statusTimer = setTimeout(() => { this.statusMsg = ""; this.inv(); }, durationMs);
		this.inv();
	}

	handleInput(data: string): void {
		try {
			if (this.sub !== "main") return this.handleSub(data);
			if (matchesKey(data, Key.escape)) { this.cleanup(); this.onClose?.(); return; }
			if (matchesKey(data, Key.left)) { this.tab = (this.tab - 1 + TABS.length) % TABS.length; this.row = 0; this.inv(); return; }
			if (matchesKey(data, Key.right)) { this.tab = (this.tab + 1) % TABS.length; this.row = 0; this.inv(); return; }
			const max = this.rowCount();
			if (matchesKey(data, Key.up) && this.row > 0) { this.row--; this.inv(); return; }
			if (matchesKey(data, Key.down) && this.row < max - 1) { this.row++; this.inv(); return; }
			if (matchesKey(data, Key.enter)) { this.select(); this.inv(); return; }
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`[side-chat-settings] handleInput error: ${msg}`);
		}
	}

	private handleSub(data: string): void {
		if (matchesKey(data, Key.escape)) { this.sub = "main"; this.search = ""; this.inv(); return; }
		if (matchesKey(data, Key.up) && this.subRow > 0) { this.subRow--; this.inv(); return; }
		if (matchesKey(data, Key.down) && this.subRow < this.filtered.length - 1) { this.subRow++; this.inv(); return; }
		if (matchesKey(data, Key.enter)) {
			// Prefer selected item from filtered list; fall back to typed search only if it matches a known model
			const selected = this.filtered[this.subRow]?.id;
			const typed = this.search.trim();
			const modelId = selected || (typed && this.modelList.includes(typed) ? typed : "");
			if (modelId) {
				this.config.model = modelId;
				this.saveAndStatus(`Model: ${modelId}`);
			} else if (typed) {
				this.showStatus("Unknown model — pick from list", 3000);
				return; // stay in picker
			}
			this.sub = "main"; this.search = ""; this.inv(); return;
		}
		if (matchesKey(data, Key.backspace)) { this.search = this.search.slice(0, -1); this.filter(); this.inv(); return; }
		if (data.length === 1 && data >= " " && data <= "~") { this.search += data; this.filter(); this.inv(); }
	}

	private filter() {
		const q = this.search.toLowerCase();
		const all = this.modelList.map(m => ({ name: m, id: m }));
		this.filtered = q ? all.filter(v => v.name.toLowerCase().includes(q)) : all;
		this.subRow = Math.min(this.subRow, Math.max(0, this.filtered.length - 1));
	}

	private rowCount(): number {
		if (this.tab === TAB_CHAT) return 3; // enabled toggle, overlay width, overlay height
		if (this.tab === TAB_MODEL) return 2; // use main model / set custom
		if (this.tab === TAB_SHORTCUTS) return 0; // read-only
		return 0; // About — read-only
	}

	private saveAndStatus(successMsg: string) {
		if (saveSideChatConfig(this.config)) {
			this.showStatus(successMsg);
		} else {
			this.showStatus("Save failed — check permissions", 4000);
		}
	}

	private select() {
		if (this.tab === TAB_CHAT) {
			if (this.row === 0) {
				this.config.enabled = !this.config.enabled;
				this.saveAndStatus(this.config.enabled ? "Side Chat ON" : "Side Chat OFF");
			} else if (this.row === 1) {
				// Cycle overlay width
				const idx = WIDTH_OPTIONS.indexOf(this.config.overlayWidth);
				this.config.overlayWidth = WIDTH_OPTIONS[(idx + 1) % WIDTH_OPTIONS.length];
				this.saveAndStatus(`Width: ${this.config.overlayWidth}`);
			} else if (this.row === 2) {
				// Cycle overlay height
				const idx = HEIGHT_OPTIONS.indexOf(this.config.overlayMaxHeight);
				this.config.overlayMaxHeight = HEIGHT_OPTIONS[(idx + 1) % HEIGHT_OPTIONS.length];
				this.saveAndStatus(`Height: ${this.config.overlayMaxHeight}`);
			}
		} else if (this.tab === TAB_MODEL) {
			if (this.row === 0) {
				this.config.model = "";
				this.saveAndStatus("Using session model");
			} else if (this.row === 1) {
				this.sub = "model-picker";
				this.subRow = 0;
				this.search = this.config.model;
				this.filter();
			}
		}
	}

	cleanup() {
		if (this.statusTimer) { clearTimeout(this.statusTimer); this.statusTimer = null; }
	}

	render(width: number): string[] {
		const liveTab = this.tab === TAB_ABOUT;
		if (this.cl && this.cw === width && !liveTab) return this.cl;
		const w = Math.max(30, width - 2);
		const iw = w - 4;
		this.lastIw = iw;

		const pad = (content: string) => {
			const cw = visibleWidth(content);
			const gap = Math.max(0, iw - cw);
			return content + " ".repeat(gap);
		};
		const line = (content: string) => truncateToWidth(`${DIM}\u2502${RST} ${pad(content)} ${DIM}\u2502${RST}`, w);
		const border = (l: string, fill: string, r: string) => truncateToWidth(`${DIM}${l}${fill.repeat(Math.max(0, w - 2))}${r}${RST}`, w);

		const lines: string[] = [];

		// Header
		lines.push(border("\u256d", "\u2500", "\u256e"));
		const headerRight = this.statusMsg ? ` ${YEL}${this.statusMsg}${RST}` : "";
		lines.push(line(`${ACC}Side Chat Settings${RST}${headerRight}`));
		lines.push(border("\u251c", "\u2500", "\u2524"));

		// Tab bar
		const tabNames = iw < 35 ? TABS.map(t => t.slice(0, 3)) : TABS;
		const tabParts: string[] = [];
		for (let i = 0; i < tabNames.length; i++) {
			const name = tabNames[i];
			tabParts.push(i === this.tab ? `${ACC}[${name}]${RST}` : `${DIM}${name}${RST}`);
		}
		lines.push(line(tabParts.join(" ")));
		lines.push(border("\u251c", "\u2500", "\u2524"));

		// Content
		if (this.sub !== "main") {
			this.renderSubPicker(lines, line, iw, w);
		} else if (this.tab === TAB_CHAT) {
			this.renderChatTab(lines, line, iw);
		} else if (this.tab === TAB_MODEL) {
			this.renderModelTab(lines, line, iw);
		} else if (this.tab === TAB_SHORTCUTS) {
			this.renderShortcutsTab(lines, line, iw);
		} else {
			this.renderAboutTab(lines, line, iw);
		}

		// Footer
		lines.push(border("\u251c", "\u2500", "\u2524"));
		lines.push(line(`${DIM}${this.getFooterHint()}${RST}`));
		lines.push(border("\u2570", "\u2500", "\u256f"));

		this.cl = lines; this.cw = width;
		return lines;
	}

	// ─── Tab renderers ────────────────────────────────────────────────────────

	private renderChatTab(lines: string[], line: (s: string) => string, iw: number) {
		const lbl = iw >= 40 ? (s: string) => s.padEnd(16) : (s: string) => s.padEnd(10);

		// Row 0: enabled toggle
		const pre0 = this.row === 0 ? `${SEL}\u25b8 ` : `  `;
		const enabledLabel = this.config.enabled
			? `${GRN}ON${RST}` + (iw >= 40 ? `  ${DIM}side chat available${RST}` : "")
			: `${YEL}OFF${RST}` + (iw >= 40 ? ` ${DIM}disabled globally${RST}` : "");
		lines.push(line(`${pre0}${BRT}${lbl("Side Chat:")}${enabledLabel}`));

		lines.push(line(""));

		// Row 1: overlay width
		const pre1 = this.row === 1 ? `${SEL}\u25b8 ` : `  `;
		lines.push(line(`${pre1}${BRT}${lbl("Overlay Width:")}${ACC}${this.config.overlayWidth}${RST}` + (iw >= 45 ? `  ${DIM}[Enter] cycle${RST}` : "")));

		// Row 2: overlay height
		const pre2 = this.row === 2 ? `${SEL}\u25b8 ` : `  `;
		lines.push(line(`${pre2}${BRT}${lbl("Overlay Height:")}${ACC}${this.config.overlayMaxHeight}${RST}` + (iw >= 45 ? `  ${DIM}[Enter] cycle${RST}` : "")));

		lines.push(line(""));
		lines.push(line(`${DIM}Config: ~/.pi/side-chat/config.json${RST}`));
	}

	private renderModelTab(lines: string[], line: (s: string) => string, iw: number) {
		const currentModel = this.config.model || "(session model)";

		lines.push(line(`${BRT}Current:${RST} ${ACC}${truncateToWidth(currentModel, Math.max(10, iw - 12))}${RST}`));
		lines.push(line(""));

		// Row 0: use session model
		const pre0 = this.row === 0 ? `${SEL}\u25b8 ` : `  `;
		const check0 = !this.config.model ? ` ${GRN}\u2713${RST}` : "";
		lines.push(line(`${pre0}${BRT}Use session model${RST}${check0}` + (iw >= 45 ? `  ${DIM}same as main agent${RST}` : "")));

		// Row 1: set custom model
		const pre1 = this.row === 1 ? `${SEL}\u25b8 ` : `  `;
		const check1 = this.config.model ? ` ${GRN}\u2713${RST}` : "";
		lines.push(line(`${pre1}${BRT}Set custom model${RST}${check1}` + (iw >= 45 ? `  ${DIM}pick from registry${RST}` : "")));

		if (iw >= 40) {
			lines.push(line(""));
			lines.push(line(`${DIM}Custom model lets the side chat use a different${RST}`));
			lines.push(line(`${DIM}AI model than the main agent.${RST}`));
		}
	}

	private renderShortcutsTab(lines: string[], line: (s: string) => string, iw: number) {
		for (const group of SHORTCUT_GROUPS) {
			lines.push(line(`${ACC}${group.section}${RST}`));
			for (const [key, desc] of group.items) {
				const keyW = Math.max(12, Math.min(18, Math.floor(iw * 0.3)));
				const keyStr = `${BRT}${key.padEnd(keyW)}${RST}`;
				const descStr = truncateToWidth(desc, Math.max(8, iw - keyW - 2));
				lines.push(line(`  ${keyStr}${DIM}${descStr}${RST}`));
			}
			lines.push(line(""));
		}
	}

	private renderAboutTab(lines: string[], line: (s: string) => string, _iw: number) {
		lines.push(line(`${ACC}Pi Side Chat${RST}  ${DIM}v1.0.0${RST}`));
		lines.push(line(""));
		lines.push(line(`${BRT}Parallel AI agent with read-only tools.${RST}`));
		lines.push(line(`${DIM}Runs alongside the main coding agent.${RST}`));
		lines.push(line(""));
		lines.push(line(`${BRT}Features:${RST}`));
		lines.push(line(`${DIM}  \u2022 Read-only file tools (ls, read, search)${RST}`));
		lines.push(line(`${DIM}  \u2022 peek_main — monitor main agent activity${RST}`));
		lines.push(line(`${DIM}  \u2022 Shortcut intents (analyze, stuck, recap)${RST}`));
		lines.push(line(`${DIM}  \u2022 Streaming with live token display${RST}`));
		lines.push(line(`${DIM}  \u2022 Secret/token redaction in output${RST}`));
		lines.push(line(""));
		lines.push(line(`${BRT}Package:${RST} ${DIM}@codexstar/pi-side-chat${RST}`));
		lines.push(line(`${BRT}Author:${RST}  ${DIM}Abhishek Tiwari${RST}`));
		lines.push(line(`${BRT}License:${RST} ${DIM}MIT${RST}`));
	}

	private renderSubPicker(lines: string[], line: (s: string) => string, iw: number, _w: number) {
		lines.push(line(`${ACC}Select Model${RST}  ${DIM}(type to filter)${RST}`));
		if (this.search) {
			lines.push(line(`${BRT}Filter: ${this.search}${RST}`));
		}
		lines.push(line(""));

		const maxVisible = Math.max(5, Math.floor(iw / 2));
		const start = Math.max(0, this.subRow - Math.floor(maxVisible / 2));
		const visible = this.filtered.slice(start, start + maxVisible);

		for (let idx = 0; idx < visible.length; idx++) {
			const v = visible[idx];
			const i = start + idx;
			const isCurrent = v.id === this.config.model;
			const pre = i === this.subRow ? `${SEL}\u25b8 ` : `${DIM}  `;
			const mark = isCurrent ? ` ${GRN}\u2713${RST}` : "";
			const nameDisplay = truncateToWidth(v.name, Math.max(10, iw - 6));
			lines.push(line(`${pre}${nameDisplay}${RST}${mark}`));
		}
		if (this.filtered.length === 0) lines.push(line(`${DIM}No matches${RST}`));
		lines.push(line(""));
		lines.push(line(`${DIM}[Esc] Back  [Type] Filter  [Enter] Select${RST}`));
	}

	// ─── Footer hints ─────────────────────────────────────────────────────────

	private getFooterHint(): string {
		const iw = this.lastIw;
		if (this.sub !== "main") {
			return iw >= 40 ? "[Esc] Back  [Type] Filter  [\u2191\u2193] Nav" : "Esc:Back  \u2191\u2193:Nav";
		}
		if (iw < 35) {
			return "Esc:Close \u2190\u2192:Tabs \u2191\u2193:Nav";
		}
		if (this.tab === TAB_SHORTCUTS || this.tab === TAB_ABOUT) return "[Esc] Close  [\u2190\u2192] Tabs";
		return iw >= 50 ? "[Esc] Close  [\u2190\u2192] Tabs  [\u2191\u2193] Nav  [Enter] Select" : "[Esc] Close  [\u2190\u2192] Tabs  [Enter] Sel";
	}

	invalidate(): void { this.cw = undefined; this.cl = undefined; }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function openSideChatSettings(ctx: ExtensionContext): Promise<void> {
	if (!(ctx as any).hasUI) return;
	const panel = new SideChatSettingsPanel();

	// Populate available models from Pi's model registry
	try {
		const registry = ctx.modelRegistry;
		const models = (registry as any)?.getAvailable?.() || (registry as any)?.getAll?.() || [];
		panel.modelList = models.map((m: any) => {
			if (typeof m === "string") return m;
			if (m?.provider && m?.id) return `${m.provider}/${m.id}`;
			if (m?.id) return String(m.id);
			return "";
		}).filter(Boolean);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[side-chat-settings] Failed to load model list: ${msg}`);
		panel.modelList = [];
	}

	await ctx.ui.custom(
		(_tui: any, _theme: any, _kb: any, done: (v?: any) => void) => {
			panel.onClose = () => { panel.cleanup(); done(); };
			return panel;
		},
		{
			overlay: true,
			overlayOptions: {
				width: "75%" as any,
				minWidth: 36,
				maxHeight: "85%" as any,
				anchor: "center" as any,
			},
		},
	);
}
