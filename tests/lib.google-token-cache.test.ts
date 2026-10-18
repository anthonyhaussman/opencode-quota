import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useOpencodeFolders } from "./helpers/opencode-folders.js";

const runtime = useOpencodeFolders();

function entry(accessToken: string, expiresAt = Date.now() + 60_000) {
  return { accessToken, expiresAt };
}

describe("google-token-cache", () => {
  let legacyCachePath: string;

  beforeEach(async () => {
    vi.resetModules();
    legacyCachePath = join(runtime.cacheDir, "opencode-quota", "google-access-tokens.json");
  });

  it("uses opaque process-local account keys without PII or reusable credential verifiers", async () => {
    const { makeAccountCacheKey } = await import("../src/lib/google-token-cache.js");
    const first = makeAccountCacheKey({
      refreshToken: "refresh-secret-one",
      projectId: "private-project-one",
    });
    const repeat = makeAccountCacheKey({
      refreshToken: "refresh-secret-one",
      projectId: "private-project-one",
    });
    const changedToken = makeAccountCacheKey({
      refreshToken: "refresh-secret-two",
      projectId: "private-project-one",
    });
    const changedProject = makeAccountCacheKey({
      refreshToken: "refresh-secret-one",
      projectId: "private-project-two",
    });

    expect(first).toMatch(/^gat1_[A-Za-z0-9_-]{43}$/u);
    expect(first).toBe(repeat);
    expect(changedToken).not.toBe(first);
    expect(changedProject).not.toBe(first);
    expect(JSON.stringify({ first })).not.toMatch(/refresh-secret|private-project/u);
  });

  it("migrates by deleting the legacy PII-bearing disk cache without reading or replacing it", async () => {
    await mkdir(dirname(legacyCachePath), { recursive: true });
    await writeFile(
      legacyCachePath,
      JSON.stringify({
        version: 1,
        entries: {
          "alice@example.com::private-project::reusable-unkeyed-verifier": {
            accessToken: "legacy-access-token",
            expiresAt: Date.now() + 60_000,
            projectId: "private-project",
            email: "alice@example.com",
          },
        },
      }),
      "utf8",
    );

    const cache = (await import("../src/lib/google-token-cache.js")).createGoogleTokenCache();
    const cachedEntry = entry("new-process-token");
    await cache.set({ key: "opaque-account", entry: cachedEntry });

    await expect(access(legacyCachePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(cache.get({ key: "opaque-account", skewMs: 0 })).resolves.toEqual(cachedEntry);
    expect(await readdir(dirname(legacyCachePath))).toEqual([]);
  });

  it("keeps valid tokens process-local and removes expired entries", async () => {
    const cache = (await import("../src/lib/google-token-cache.js")).createGoogleTokenCache();
    const validEntry = entry("valid-token");
    await cache.set({ key: "valid", entry: validEntry });
    await cache.set({ key: "expired", entry: entry("expired-token", Date.now()) });

    const valid = await cache.get({ key: "valid", skewMs: 0 });
    expect(valid).toEqual(validEntry);
    if (valid) valid.accessToken = "mutated";
    await expect(cache.get({ key: "valid", skewMs: 0 })).resolves.toEqual(validEntry);
    await expect(cache.get({ key: "expired", skewMs: 0 })).resolves.toBeNull();
    await expect(access(legacyCachePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps both accounts when two updates run at once", async () => {
    const cache = (await import("../src/lib/google-token-cache.js")).createGoogleTokenCache();
    await Promise.all([
      cache.set({ key: "first", entry: entry("first-token") }),
      cache.set({ key: "second", entry: entry("second-token") }),
    ]);

    for (const key of ["first", "second"]) {
      await expect(cache.get({ key, skewMs: 0 })).resolves.toMatchObject({
        accessToken: `${key}-token`,
      });
    }
  });

  it("does not reuse memory or opaque account keys across module instances", async () => {
    const firstModule = await import("../src/lib/google-token-cache.js");
    const firstKey = firstModule.makeAccountCacheKey({
      refreshToken: "refresh-secret",
      projectId: "project-id",
    });
    await firstModule.createGoogleTokenCache().set({ key: firstKey, entry: entry("first-token") });

    vi.resetModules();
    const secondModule = await import("../src/lib/google-token-cache.js");
    const secondKey = secondModule.makeAccountCacheKey({
      refreshToken: "refresh-secret",
      projectId: "project-id",
    });

    expect(secondKey).not.toBe(firstKey);
    await expect(
      secondModule.createGoogleTokenCache().get({ key: secondKey, skewMs: 0 }),
    ).resolves.toBeNull();
  });

  it("retries a denied legacy cleanup without using an insecure fallback", async () => {
    await mkdir(legacyCachePath, { recursive: true });
    const cache = (await import("../src/lib/google-token-cache.js")).createGoogleTokenCache();

    await cache.set({ key: "account", entry: entry("token") });
    expect((await readdir(legacyCachePath)).length).toBe(0);

    await rm(legacyCachePath, { recursive: true, force: true });
    await mkdir(dirname(legacyCachePath), { recursive: true });
    await writeFile(legacyCachePath, "legacy-pii-after-transient-failure", "utf8");
    await expect(cache.get({ key: "account", skewMs: 0 })).resolves.toMatchObject({
      accessToken: "token",
    });
    await expect(access(legacyCachePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
