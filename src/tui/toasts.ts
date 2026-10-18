/**
 * Quota toasts (§4.4). OpenCode shows one toast at a time, so quota takes a turn only when
 * the display settings say so: after compaction and when every provider fails by default;
 * after each reply, after a question, and on a limit reset only when turned on. A quota toast
 * shows its rows in the grouped or detailed layout (`toast.layout`), with bars in the sidebar's
 * bar shape; the host colors them where OpenCode can draw that (`toast-colors.tsx`). It has no
 * title: its rows say what it is. Every quota toast is made here, the Settings Toast tab's
 * preview too.
 *
 * Reset notices that arrive together show as one toast. While a turn's toast is being made,
 * they wait and show after it, so the turn's toast does not replace them at once. When the TUI
 * leaves its server, waiting notices are dropped unshown, so a later snapshot can bring them.
 */
import type { QuotaSnapshot, ResetNotice, SessionTokens } from "../core/types.js";
import { WINDOWS } from "../core/windows.js";
import { levelOf } from "../view/format.js";
import { rowFacts } from "../view/row-facts.js";
import { type Group, visibleGroups, visibleRow } from "../view/select.js";
import { type Line, lineText, toastLines } from "../view/text.js";
import type { QuotaClient } from "./client.js";
import type { DisplaySettings } from "./display.js";

/** The title of quota's one-line toasts (a hint, a wrong range); quota toasts have none. */
export const TOAST_TITLE = "OpenCode Quota";

export type ToastOptions = {
  variant: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  duration: number;
};

export type TurnEnd = "reply" | "compaction" | "question";

export type ToastHost = {
  /** Shows a toast. A quota toast brings its `lines` too; its message is their plain text. */
  show: (toast: ToastOptions, lines?: Line[]) => void;
  display: () => DisplaySettings;
  /** The terminal's columns, which a toast's width follows. */
  terminalWidth: () => number;
  quota: QuotaClient;
  /** Subagent (child) sessions never show quota toasts. */
  isChildSession: (sessionID: string) => boolean;
  now?: () => number;
};

export type Toasts = {
  /**
   * A turn ended in `sessionID`: refresh quota, then show the toast the settings ask for,
   * then the reset notices that arrived meanwhile.
   */
  afterTurn(trigger: TurnEnd, sessionID: string): Promise<void>;
  /** Shows the reset notices of a snapshot that this TUI has not shown yet, in one toast. */
  showResetNotices(snapshot: QuotaSnapshot): void;
  /** The Settings Toast tab's "Show toast": the toast a turn would show in `sessionID` now. */
  preview(sessionID: string): void;
  /** The TUI left its server: drops the notices still waiting, as not shown. */
  cancel(): void;
};

/** What a toast without a title keeps right of its text: OpenCode's close "x", 2 columns in. */
const CLOSE_ROOM = 3;

/**
 * The columns of a quota toast's text: OpenCode's toast is at most 60 columns and 6 fewer than
 * the terminal, inside a border and 2 columns of padding on each side; a toast without a title
 * has its close "x" beside the text.
 */
export function toastRoom(terminalWidth: number): number {
  return Math.min(60, terminalWidth - 6) - 6 - CLOSE_ROOM;
}

/** The session tokens a quota toast shows, when its settings show them. */
function toastTokens(snapshot: QuotaSnapshot, display: DisplaySettings) {
  return display.toast.sessionTokens ? snapshot.sessionTokens : undefined;
}

function wantsTurnToast(display: DisplaySettings, trigger: TurnEnd, anyLow: boolean): boolean {
  if (trigger === "compaction") return display.toast.afterCompaction;
  if (trigger === "question") return display.toast.afterQuestion;
  return display.toast.afterReply === "always" || (display.toast.afterReply === "low" && anyLow);
}

/**
 * "Weekly quota reset: Claude (work) Weekly is available again (100% left).": the row under its
 * toast name, else its label, with the percent it had at the reset in the percent words.
 * Undefined when the provider no longer has the row.
 */
function resetMessage(
  notice: ResetNotice,
  snapshot: QuotaSnapshot,
  display: DisplaySettings,
  nowMs: number,
): string | undefined {
  const provider = snapshot.providers.find((item) => item.providerId === notice.providerId);
  const row = provider?.rows.find((item) => item.id === notice.rowId);
  if (!provider || !row) return undefined;
  const item = visibleRow(
    { ...row, percentRemaining: notice.percentRemaining },
    display.toast.names,
  );
  const place = { words: display.words, nowMs, names: "label", percent: "words" } as const;
  const facts = rowFacts(item, { rows: [item] }, place);
  const title = notice.account ? `${provider.label} (${notice.account})` : provider.label;
  return `${WINDOWS[notice.window].label} quota reset: ${title} ${facts.name} is available again (${facts.value}).`;
}

export function createToasts(host: ToastHost): Toasts {
  const now = host.now ?? Date.now;
  /** Notices from before this TUI started were news to the TUI that saw them then. */
  const startedAtMs = now();
  const shownNotices = new Set<string>();
  /** The "every provider fails" toast shows once until some provider answers again. */
  let allFailShown = false;
  /** Turns whose toast is being made; reset notices wait for them. */
  let turnsRunning = 0;
  let waitingNotices: Array<{ id: string; message: string }> = [];

  function showNotices(): void {
    if (turnsRunning > 0 || waitingNotices.length === 0) return;
    host.show({
      variant: "success",
      title: "Quota available",
      message: waitingNotices.map((notice) => notice.message).join("\n"),
      duration: host.display().toast.seconds * 1000,
    });
    waitingNotices = [];
  }

  /**
   * Shows `groups` as a quota toast in the toast layout the settings pick, as wide as the
   * toast's text, then the session tokens when given; nothing when it has no text.
   */
  function showQuota(
    variant: ToastOptions["variant"],
    groups: Group[],
    display: DisplaySettings,
    sessionTokens?: SessionTokens,
  ): void {
    const lines = toastLines({
      groups,
      words: display.words,
      nowMs: now(),
      layout: display.layout,
      toastLayout: display.toast.layout,
      room: toastRoom(host.terminalWidth()),
      runsOut: display.runsOut.toast,
      ...(sessionTokens ? { sessionTokens } : {}),
    });
    const message = lines.map(lineText).join("\n");
    if (message) host.show({ variant, message, duration: display.toast.seconds * 1000 }, lines);
  }

  async function turnToast(trigger: TurnEnd, sessionID: string): Promise<void> {
    const snapshot = await host.quota.refresh("turn", sessionID);
    const display = host.display();
    if (!snapshot || !display.surfaces.toast.enabled) return;
    const groups = visibleGroups(snapshot, display, "toast", display.words);
    const allFail =
      snapshot.providers.length > 0 && snapshot.providers.every((provider) => provider.error);
    if (!allFail) allFailShown = false;
    const anyLow = groups.some((group) =>
      group.rows.some(
        ({ row }) =>
          row.percentRemaining !== undefined &&
          levelOf(row.percentRemaining, display.thresholds) !== "good",
      ),
    );
    if (wantsTurnToast(display, trigger, anyLow)) {
      showQuota("info", groups, display, toastTokens(snapshot, display));
      return;
    }
    if (allFail && display.toast.whenAllFail && !allFailShown) {
      allFailShown = true;
      showQuota(
        "error",
        groups.filter((group) => group.error),
        display,
      );
    }
  }

  return {
    async afterTurn(trigger, sessionID) {
      if (host.isChildSession(sessionID)) return;
      turnsRunning += 1;
      try {
        await turnToast(trigger, sessionID);
      } finally {
        turnsRunning -= 1;
        showNotices();
      }
    },

    showResetNotices(snapshot) {
      const display = host.display();
      for (const notice of snapshot.resetNotices) {
        if (shownNotices.has(notice.id)) continue;
        shownNotices.add(notice.id);
        const wanted =
          display.toast.resetNotice === "all" ||
          (display.toast.resetNotice === "weekly" && notice.window === "week");
        if (!wanted || !display.surfaces.toast.enabled || notice.atMs < startedAtMs) continue;
        const message = resetMessage(notice, snapshot, display, now());
        if (message) waitingNotices.push({ id: notice.id, message });
      }
      showNotices();
    },

    preview(sessionID) {
      const snapshot = host.quota.snapshot(sessionID);
      const display = host.display();
      if (!snapshot || !display.surfaces.toast.enabled) return;
      const groups = visibleGroups(snapshot, display, "toast", display.words);
      showQuota("info", groups, display, toastTokens(snapshot, display));
    },

    cancel() {
      for (const notice of waitingNotices) shownNotices.delete(notice.id);
      waitingNotices = [];
    },
  };
}
