import { describe, expect, it, vi } from "vite-plus/test";
import type { QuotaSnapshot } from "../src/core/types.js";
import type { QuotaRpcSettingsOutput } from "../src/rpc.js";
import { createFileDisplay, type SettingsTab } from "../src/tui/display.js";
import { createServerSettings, PROVIDERS_KEY } from "../src/tui/server-settings.js";
import { resetPage, settingsPage, SWITCH_ID } from "../src/tui/window/settings-page.js";
import { providerSnapshot, quotaRow } from "./helpers/fake-answers.js";
import { THEME } from "./helpers/jsx-tree.js";

const NOW = Date.UTC(2026, 9, 18, 12);
const SAVED: QuotaRpcSettingsOutput = {
  values: { "providers.off": ["copilot"] },
  fromFile: ["providers.off"],
  providers: [
    { id: "copilot", label: "Copilot" },
    { id: "cursor", label: "Cursor" },
  ],
  custom: [{ id: "gw", label: "Gateway", enabled: false, request: null, fingerprint: "fp-a" }],
};
const SNAPSHOT: QuotaSnapshot = {
  version: 6,
  generatedAtMs: NOW,
  resetNotices: [],
  providers: [
    providerSnapshot("openai", "OpenAI", [
      quotaRow("openai.five_hour", { label: "5h", window: "five_hour", percentRemaining: 60 }),
      quotaRow("openai.weekly", { label: "Weekly", window: "week", percentRemaining: 30 }),
    ]),
    providerSnapshot("cursor", "Cursor", []),
  ],
};

/** A page over a draft whose server answers `saved`; no TUI and no server plugin. */
async function pageOn(tab: SettingsTab, saved: QuotaRpcSettingsOutput = SAVED) {
  const saveSettings = vi.fn(async () => ({ ok: true, issues: [] }));
  const server = createServerSettings({
    settings: async () => structuredClone(saved),
    saveSettings,
  });
  await server.load();
  const draft = createFileDisplay(server);
  const dispatch = vi.fn();
  const page = () =>
    settingsPage({
      tab,
      draft,
      snapshot: SNAPSHOT,
      host: { theme: THEME, themeMode: "dark", keymap: { dispatch } } as never,
      refocus: () => {},
    });
  return { server, draft, page, dispatch };
}

const titles = (page: ReturnType<typeof settingsPage>) =>
  page.options.map((line) => [line.title, line.value()]);

describe("a Settings page without the window", () => {
  it("lists Providers: custom switches, ticks (found first) with their nested lines, then the rest", async () => {
    const { page } = await pageOn("providers");
    expect(titles(page())).toEqual([
      ["Gateway", "off"],
      ["[x] Cursor", ""],
      ["Plan", "not set"],
      ["Included API budget", "from the plan"],
      ["Billing day", "calendar month"],
      ["[ ] Copilot", ""],
      ["Check for new numbers", "every 5 min"],
      ["Slow provider: give up", "each provider's own"],
      ["A model hits its limit", "wait for the reset"],
      ["Prices from", "newest list"],
      ["Download new prices", "every 7 days"],
    ]);
  });

  it("steps, ticks, switches and asks for typing through ids", async () => {
    const { server, page } = await pageOn("providers");

    page().step("providers.checking.requestTimeoutMs", 1);
    expect(server.value("providers.checking.requestTimeoutMs")).toBe(5_000);
    expect(page().activate("provider.copilot")).toBeUndefined();
    expect(server.value(PROVIDERS_KEY)).toEqual([]);
    page().activate("custom.gw");
    expect(server.customOn("gw")).toBe(true);
    // A number line without values takes typing.
    expect(page().activate("providers.cursor.includedApiUsd")).toBe("type");
    expect(server.dirty()).toBe(true);
  });

  it("selects the switch, the options, then the tree, and edits the surface through them", async () => {
    const { draft, page } = await pageOn("collapsed");
    const tree = page().tree(NOW);
    expect(page().ids(tree)).toEqual([
      SWITCH_ID,
      "collapsed.runsOut",
      "collapsed.window.*",
      "line:openai",
      "line:cursor",
    ]);
    expect(tree[0]?.detail).toBe("30% left");

    page().step("line:openai", 1);
    expect(draft.shown().collapsed.window).toEqual({ openai: "five_hour" });
    page().activate("line:cursor");
    expect(draft.shown().collapsed.hidden).toEqual(["cursor"]);
    page().activate(SWITCH_ID);
    expect(draft.shown().collapsed.show).toBe(false);
  });

  it("puts a preset above the line it names, and steps all its lines at once", async () => {
    const { draft, page } = await pageOn("layout");
    const ids = page().options.map((line) => line.id);
    expect(ids.indexOf("preset.words")).toBe(ids.indexOf("words.percent") - 1);

    page().step("preset.words", 1);
    expect(draft.shown().words).toMatchObject({ percent: "bare", reset: "compact" });
  });

  it("runs OpenCode's theme list from Colors", async () => {
    const { page, dispatch } = await pageOn("colors");
    page().activate("theme");
    expect(dispatch).toHaveBeenCalledWith("theme.switch");
  });
});

describe("Reset tab and Reset page (resetPage)", () => {
  it("puts back Providers' ticks and lines, and only the keys the file sets are removed on Save", async () => {
    const { server, page } = await pageOn("providers", {
      ...SAVED,
      values: { ...SAVED.values, "providers.checking.requestTimeoutMs": 12_000 },
      fromFile: ["providers.off", "providers.checking.requestTimeoutMs"],
    });
    server.set("providers.checking.minIntervalMs", 60_000);

    page().reset();

    expect(server.value(PROVIDERS_KEY)).toEqual([]);
    expect(server.unset("providers.checking.requestTimeoutMs")).toBe(true);
    expect(server.value("providers.checking.minIntervalMs")).toBe(300_000);
    expect(titles(page())).toContainEqual(["Slow provider: give up", "each provider's own"]);
  });

  it("resets only the page's own lines on a Layout page", async () => {
    const { server, draft } = await pageOn("collapsed");
    draft.edit((settings) => ({
      ...settings,
      collapsed: { ...settings.collapsed, hidden: ["openai"] },
      sidebar: { ...settings.sidebar, hidden: ["openai"] },
    }));

    resetPage(server, "collapsed");

    expect([draft.shown().collapsed.hidden, draft.shown().sidebar.hidden]).toEqual([
      [],
      ["openai"],
    ]);
  });
});
