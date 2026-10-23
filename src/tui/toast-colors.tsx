/** @jsxImportSource @opentui/solid */
/**
 * Quota toasts in the sidebar's colors, through a trick OpenCode does not promise to keep.
 * OpenCode's plugin API types a toast's message as a string and draws a string in one color.
 * OpenCode's toast (checked on 2.0.26 to 2.0.28) passes the message on unchanged and puts it
 * inside its <text>, and plugins share OpenCode's @opentui/solid and solid-js, so a message of
 * <span>s draws each span in its own color.
 *
 * Quota sends the spans on every OpenCode version, once the TUI has drawn (the spans are made
 * under its renderer). Any error while making or showing the spans shows the plain message: the
 * same characters.
 *
 * The spans also tell whether their toast is still the one on screen: OpenCode's <text> holds
 * them, so they have a parent, until the toast closes or another toast replaces it. The plugin
 * API has no way to ask that or to close a toast; the Toast page's preview needs both
 * (`toasts.ts`).
 */
import type { JSX } from "@opentui/solid";
import { catchError, createRoot, type Owner, runWithOwner } from "solid-js";
import type { Line } from "../view/text.js";
import type { DisplaySettings } from "./display.js";
import { segmentColor, type Theme } from "./theme.js";
import type { ToastOptions } from "./toasts.js";

/** A toast shown with its spans. */
export type DrawnToast = {
  /** Whether OpenCode still draws its spans: false once it closed or another toast came. */
  onScreen: () => boolean;
};

export type ColoredToastHost = {
  /** OpenCode's own toast. */
  show: (toast: ToastOptions) => void;
  theme: () => Theme;
  display: () => DisplaySettings;
  /** A Solid owner inside OpenCode's renderer, where spans can be made; none before it draws. */
  owner: () => Owner | undefined;
};

/**
 * The children of OpenCode's toast <text>: each segment a <span> in its color, "\n" between
 * lines. A span reads bold from its style's `bold` key; it ignores an `attributes` key there.
 */
export function coloredMessage(lines: Line[], theme: Theme, display: DisplaySettings): JSX.Element {
  return lines.flatMap((line, index) => [
    ...(index > 0 ? ["\n"] : []),
    ...line.segments.map((segment) => (
      <span style={{ fg: segmentColor(theme, display, segment), bold: segment.bold === true }}>
        {segment.text}
      </span>
    )),
  ]);
}

/**
 * The spans of `lines`, made under `owner`; undefined when making them failed. Errors go to
 * this function, never to OpenCode's error screen. The root is gone once the spans have their
 * colors: nothing in them changes later.
 */
function spansOf(owner: Owner, lines: Line[], host: ColoredToastHost): JSX.Element | undefined {
  let failed = false;
  const spans = runWithOwner(owner, () =>
    createRoot((dispose) => {
      const made = catchError(
        () => coloredMessage(lines, host.theme(), host.display()),
        () => {
          failed = true;
        },
      );
      dispose();
      return made;
    }),
  );
  return failed ? undefined : spans;
}

/**
 * Whether OpenCode's <text> holds `spans`' first span. A span it holds has a parent; OpenCode
 * takes the spans out when their toast goes. Any error answers false.
 */
function spansOnScreen(spans: JSX.Element): boolean {
  try {
    const first = (spans as unknown[]).find((child) => child !== null && typeof child === "object");
    return (first as { parent?: unknown } | undefined)?.parent != null;
  } catch {
    return false;
  }
}

/**
 * Shows a toast. A quota toast's `lines` show in their colors once the TUI has drawn (see
 * above); before that, and when that fails, the toast's plain message shows. Returns the toast
 * when it went with its spans, else undefined: a plain message can't tell whether it is on screen.
 */
export function createToastShow(host: ColoredToastHost) {
  return (toast: ToastOptions, lines?: Line[]): DrawnToast | undefined => {
    if (lines !== undefined) {
      try {
        const owner = host.owner();
        const spans = owner === undefined ? undefined : spansOf(owner, lines, host);
        if (spans !== undefined) {
          // The API types the message as a string; OpenCode's toast draws the spans as they are.
          host.show({ ...toast, message: spans as unknown as string });
          return { onScreen: () => spansOnScreen(spans) };
        }
      } catch {
        // The plain message below.
      }
    }
    host.show(toast);
    return undefined;
  };
}
