import type { DebugDetail } from "../core/types.js";
import {
  type ApiKeySpec,
  getApiKeyCheckedPaths,
  hasVendorKey,
  type VendorKeys,
} from "../lib/api-key-resolver.js";
import { sanitizeDisplayText } from "../lib/display-sanitize.js";
import { getCredentialDatabasePaths } from "../lib/opencode-auth.js";

export function statusDetailsFromRecord(
  values: Readonly<Record<string, string | undefined>>,
): DebugDetail[] {
  return Object.entries(values).flatMap(([key, value]) =>
    value === undefined ? [] : [{ key, value }],
  );
}

export function configStatusDetails(diagnostics: {
  state: string;
  source: string | null;
  checkedPaths: readonly string[];
  missing?: string | null;
  error?: string | null;
}): DebugDetail[] {
  return statusDetailsFromRecord({
    config_state: diagnostics.state,
    config_source: diagnostics.source ?? "(none)",
    config_missing: diagnostics.missing ?? undefined,
    config_error: diagnostics.error ?? undefined,
    config_checked_paths: diagnostics.checkedPaths.join(" | ") || "(none)",
  });
}

export function simpleApiKeyStatusDetails(diagnostics: {
  configured: boolean;
  source: string | null;
  checkedPaths: readonly string[];
  credentialDatabasePaths: readonly string[];
}): DebugDetail[] {
  return statusDetailsFromRecord({
    api_key_configured: diagnostics.configured ? "true" : "false",
    api_key_source: diagnostics.source ?? "(none)",
    api_key_checked_paths: diagnostics.checkedPaths.join(" | ") || "(none)",
    api_key_credential_database_paths: diagnostics.credentialDatabasePaths.join(" | ") || "(none)",
  });
}

/** Where a vendor's API key was looked for, and whether one was found. */
export function vendorKeyDetails(spec: ApiKeySpec, keys: VendorKeys): DebugDetail[] {
  return simpleApiKeyStatusDetails({
    configured: hasVendorKey(keys),
    source: keys.envOrConfig?.source ?? (keys.logins.length > 0 ? "opencode.db" : null),
    checkedPaths: getApiKeyCheckedPaths(spec),
    credentialDatabasePaths: getCredentialDatabasePaths(),
  });
}

export function apiKeyStatusDetails(diagnostics: {
  state: string;
  source: string | null;
  checkedPaths: readonly string[];
  credentialDatabasePaths: readonly string[];
  error?: string;
}): DebugDetail[] {
  return statusDetailsFromRecord({
    auth_state: diagnostics.state,
    api_key_configured: diagnostics.state === "configured" ? "true" : "false",
    api_key_source: diagnostics.source ?? "(none)",
    api_key_checked_paths: diagnostics.checkedPaths.join(" | ") || "(none)",
    api_key_credential_database_paths: diagnostics.credentialDatabasePaths.join(" | ") || "(none)",
    auth_error: diagnostics.error ? sanitizeDisplayText(diagnostics.error) : undefined,
  });
}
