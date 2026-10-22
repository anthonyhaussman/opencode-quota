[← Back to README](../../README.md)

# Configuration

Most people need no settings. To change one, open `/quota_settings` in the TUI: every setting is a line there, with its values.

## Where settings live

One global file, `settings.jsonc`:

- `~/.config/opencode/opencode-quota/settings.jsonc` on every OS (`$XDG_CONFIG_HOME/opencode/...` when `XDG_CONFIG_HOME` is set)
- `$OPENCODE_CONFIG_DIR/opencode-quota/settings.jsonc` when `OPENCODE_CONFIG_DIR` is set (it replaces the global folder, like OpenCode 2)

There are no project settings. Comments and trailing commas are allowed. Every key is optional; a missing or invalid value uses its default. `/quota_status` shows the file it reads and any problems in it.

The file holds only the settings you change, so the rest follow their defaults, also when a newer version changes one. Without the file nothing is written; the first Save, Plugin tab switch or agent change creates it. Settings from 4.x or 5.x convert on the first start: see [Updating](updating.md#moving-from-5x).

The TUI quota window's tabs are Usage, Limits, Plugin, then the Settings tabs **Layout** (**All places**, then a page each for Sidebar, Collapsed, Status line and Toast), **Colors** and **Providers**. `/quota_usage`, `/quota`, `/quota_status` and `/quota_settings` open it on Usage, Limits, Plugin and Layout. While you edit, the sidebar, status line, toasts and quota window show your unsaved changes. **Save** writes them and keeps the file's comments, **Discard** drops them, and **Reset page** (**Reset tab** on Colors and Providers) puts that page back to its defaults on Save, except row names. The **Plugin** tab (`/quota_status`) has the **Old command names**, **Quota file (JSON)** and **OpenTelemetry metrics** switches, which save as soon as you change them. A file edit or a Save reaches every open TUI within a few seconds.

Three settings are file only: `providers.custom`, `providers.anthropic.binaryPath` and `system.exportPath`. Credentials never go in this file: see [API keys](providers.md#api-keys).

Nest the keys in the file:

```jsonc
{
  "sidebar": { "sessionTokens": false },
  "collapsed": { "window": { "anthropic": "five_hour" } },
  "statusLine": { "window": { "anthropic": "week" } },
  "toast": { "afterReply": "off" },
  "colors": { "good": "green" },
  "layout": { "barWidth": 10 },
  "words": { "percent": "used", "reset": "compact" },
  "providers": { "off": ["openai"], "checking": { "requestTimeoutMs": 12000 } },
  "system": { "exportFile": true },
}
```

## TUI surfaces

- **Sidebar:** the `Quota` panel in a session's sidebar. Click its title to collapse it to one line per provider (**Collapsed**).
- **Status line:** under the message box when no sidebar panel with quota is on screen. **Next to the sidebar** on its page shows it there too.
- **Toasts:** after compaction, when every provider fails, and after a reply once a shown limit is getting low.

Web and Desktop have none of these; there `/quota`, `/quota_usage` and `/quota_status` post a report in the chat.

## Custom providers

Ask your agent to add a custom provider: [Custom providers](providers.md#custom-providers) has a copy-paste prompt. To edit one yourself, add it to `providers.custom` in `settings.jsonc`; `/quota_status` checks it with the plugin's own validator.

- `"enabled": false` switches a definition off: it is never fetched, its key is never sent, and `/quota_status` shows it as off. Without `enabled` (or with `true`) it is on. Providers an agent adds start switched off; switch one on by setting `"enabled": true` in `opencode-quota/settings.jsonc`, or tick it in `/quota_settings` → **Providers**, which shows its web address and the key it sends.
- `custom` in `providers.off` skips every definition.
- `id` is the stable identity; add `providerId` only when it differs. Definitions keep file order.
- `modelIds` only limits `words.onlyCurrentModel` and which requests a local estimate counts. Use exact, case-sensitive model ids without the provider prefix, or leave it out to cover every model of that provider.
- Credentials come from `apiKeyEnv`, then `provider.<providerId>.options.apiKey` in the [OpenCode config files](troubleshooting.md#opencode-config-files), then an API-key login saved in OpenCode 2 (`opencode.db`).
- A local estimate has 1–16 UTC-day or rolling request windows. Each check counts the completed requests in OpenCode's own messages; nothing else is stored.
- Prices come from the automatic match first (models.dev, and Cursor's own prices for Auto, Composer and Grok); add `pricingModelMap` only when it finds none. `pricingModelMap` cannot override a successful automatic match. If any request cannot be priced, the request counts stay and the budget percentage is reported unavailable.
- A remote API gets a fixed authenticated `GET` in one of three formats: `quota-v1`, `json-v1` or `openrouter-key-v1`. See the [response rules](providers.md#custom-providers).
- To tune the built-in Alibaba Coding Plan estimate, use the reserved `alibaba-coding-plan` id and its window shape.
- Not accepted: scripts, methods, custom headers, templates, executable mappings, regular expressions, JSONPath, and automatic endpoint discovery.
- A custom model provider still needs its normal `provider` block in `opencode.json`: that tells OpenCode how to use the model, `providers.custom` tells OpenCode Quota how to measure it.

<details>
<summary><strong>Example</strong></summary>

```jsonc
{
  "providers": {
    "custom": [
      {
        "id": "openrouter-primary",
        "providerId": "openrouter",
        "label": "OpenRouter Primary",
        "mode": "remote-api",
        "url": "https://openrouter.ai/api/v1/key",
        "format": "openrouter-key-v1",
        "apiKeyEnv": "OPENROUTER_API_KEY",
      },
      {
        "id": "private-gateway",
        "label": "Private Gateway Estimate",
        "mode": "local-estimate",
        "modelIds": ["model-a"],
        "windows": [
          { "id": "daily", "label": "Daily", "type": "utc-day", "requestLimit": 1000, "usdBudget": 25 },
        ],
      },
    ],
  },
}
```

</details>

## All settings

<details>
<summary>Settings by section</summary>

### Sidebar, Collapsed, Status line and Toast

Each section has `show: true`, `runsOut` (`true` for `sidebar` and `toast`, `false` for `collapsed` and `statusLine`), `hidden: []`, `providerOrder: []`, and `rowOrder: {}`. `hidden` lists provider or row ids. `providerOrder` lists provider ids; `rowOrder` maps a provider id to a list of row ids. Unlisted ids follow their normal order.

| Setting | Default | Values |
| --- | --- | --- |
| `sidebar.sessionTokens`, `toast.sessionTokens` | `true` | Show the session tokens line. |
| `sidebar.names`, `toast.names` | `{}` | Row ids mapped to names. The collapsed sidebar, status line and Limits tab use the sidebar's. |
| `collapsed.window`, `statusLine.window` | `{}` | Provider ids, and `"*"` for all providers, mapped to `lowest`, `rpm`, `hour`, `five_hour`, `session`, `day`, `week`, `month`, `year`, `mcp`, or `code_review`. A provider's own entry wins over `"*"`. Missing means lowest left. |
| `statusLine.withSidebar` | `false` | Also show the status line while a sidebar panel shows quota. |
| `statusLine.detail` | `"auto"` | `auto`, `one`, `full`, `bar`, `reset`, `numbers`. |
| `statusLine.width` | `0` | Whole number 0–1000. 0 uses all free room. |
| `statusLine.autoScrollSeconds` | `0` | Whole number 0–600. 0 switches scrolling off. |
| `statusLine.home` | `false` | Show the status line at the bottom of Home. |
| `toast.afterReply` | `"low"` | `off`, `always`, or `low` (only while a shown limit is below `colors.warningBelow`). |
| `toast.afterQuestion` | `false` | Show quota after a question. |
| `toast.afterCompaction` | `true` | Show quota after compaction. |
| `toast.whenAllFail` | `true` | Show quota when every provider fails. |
| `toast.resetNotice` | `"off"` | `off`, `weekly`, or `all`. |
| `toast.layout` | `"grouped"` | `grouped` (a line per row under its provider) or `detailed` (two lines per row, the 5.x look). |
| `toast.seconds` | `9` | Whole number 1–120. |

### Colors

Roles are `good`, `warning`, `low`, `empty`, `title`, `provider`, `account`, `label`, `percent`, `reset`, `value`, `error`, `statusName`, `separator`, and `arrows`. Each `colors.<role>` follows the theme when unset. Set a role to `text`, `muted`, `accent`, `green`, `yellow`, `red`, `blue`, `bar` (the row's level color), or a `#rrggbb` color.

| Setting | Default | Values |
| --- | --- | --- |
| `colors.warningBelow` | `50` | Whole number 0–100, percent left below which quota is getting low. |
| `colors.lowBelow` | `20` | Whole number 0–100, percent left below which quota is almost out. |

### Layout

| Setting | Default | Values |
| --- | --- | --- |
| `layout.bar` | `"blocks"` | `blocks`, `shades`, `line`, `squares`, `dots`, `none`. |
| `layout.barWidth` | `"fill"` | `fill` takes the room the other columns leave, at most 20 cells on the sidebar and 10 on the collapsed panel; or a whole number 1–30. |
| `layout.evenUse` | `true` | The `┃` mark where even use would be, in the bars of every place. |
| `layout.indent` | `1` | Whole number 0–4. |
| `layout.labelWidth` | `8` | Whole number 3–20: the most columns a row name takes. |
| `layout.providerGap` | `1` | Whole number 0–2. |
| `layout.separator` | `" · "` | Up to 5 characters. |

### Words

Every place follows these, so in the TUI they are on **Layout → All places**. JSON output never changes with them.

| Setting | Default | Values |
| --- | --- | --- |
| `words.percent` | `"left"` | `left`, `remaining`, `bare`, `used`. |
| `words.reset` | `"smart"` | `smart`, `exact`, `compact`, `short`, `decimal`. |
| `words.resetDecimals` | `1` | Whole number 0–4. |
| `words.rowNames` | `"short"` | `short` (`5h`, `7d`) or `full` (`Weekly`), on the sidebar, collapsed panel, status line and toasts. |
| `words.detail` | `"summary"` | `detailed` includes supplementary rows. |
| `words.onlyCurrentModel` | `false` | Show only providers serving the current model. |
| `words.sessionTokens` | `"current"` | `current` counts this chat; `tree` adds its subagent sessions. |

### Providers

| Setting | Default | Values |
| --- | --- | --- |
| `providers.off` | `[]` | Provider ids switched off. `custom` means every custom definition. |
| `providers.custom` | `[]` | Custom provider definitions, file only. |
| `providers.anthropic.binaryPath` | `"claude"` | CLI command or absolute or `~/` path without `..`, file only. |
| `providers.cursor.plan` | `"none"` | `none`, `pro` ($20 of API use a month), `pro-plus` ($70), `ultra` ($400). |
| `providers.cursor.includedApiUsd` | `null` | Positive monthly USD amount, used instead of the plan's. |
| `providers.cursor.billingCycleStartDay` | `null` | The day of the month your Cursor bill renews, 1–28. Unset uses the calendar month. |
| `providers.opencode.monthlyLimitUsd` | `null` | Positive monthly USD amount, used instead of the Console's budget or credit limit. |
| `providers.checking.minIntervalMs` | `300000` | Positive milliseconds between provider checks. |
| `providers.checking.requestTimeoutMs` | unset | Positive milliseconds, for every provider. Unset, each uses its own: `5000`, except OpenCode Zen and Xiaomi MiMo `10000`, and Google AGY and Gemini CLI `8000` to sign in and `6000` for the quota. xAI's plan-label lookup waits at most `2000`. |
| `providers.checking.waitForQuotaReset` | `true` | On a model limit error, wait until 1 minute after the earliest used-up window resets, at most 5 hours. `false` keeps normal retry timing. |
| `providers.pricing.source` | `"auto"` | `auto`, `bundled`, `runtime`. |
| `providers.pricing.autoRefreshDays` | `7` | Whole number of days, at least 1. |

### System

| Setting | Default | Values |
| --- | --- | --- |
| `system.exportFile` | `false` | Write quota JSON when the snapshot changes. See [External integration](external-integration.md). |
| `system.exportPath` | `""` | Empty uses `$XDG_CACHE_HOME/opencode/quota-export.json`; otherwise an absolute or `~/` path without `..`. File only. |
| `system.telemetry` | `false` | Publish quota and cache-age metrics through OpenCode's global OpenTelemetry MeterProvider. |
| `system.oldCommands` | `true` | List the 4.x and 5.x `/tokens_*` commands, each `/quota_usage` on its range. |

</details>
