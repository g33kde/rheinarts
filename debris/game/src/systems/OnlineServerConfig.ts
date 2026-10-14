import { ONLINE_SERVER } from '../config/GameConfig';

/**
 * Which dedicated server the "Online" screen connects to. Resolution order:
 * a localStorage override (for pointing a build at a test server without
 * rebuilding), then the build-time `VITE_DEBRIS_SERVER`, then the
 * hard-coded default. Only `ws://` / `wss://` URLs are accepted from the
 * first two - anything else falls through rather than failing later with
 * a confusing socket error.
 */
export function pickServerUrl(
  override: string | null | undefined,
  buildTime: string | undefined,
): string {
  for (const candidate of [override, buildTime]) {
    const trimmed = candidate?.trim();
    if (trimmed && /^wss?:\/\/\S+$/.test(trimmed)) return trimmed;
  }
  return ONLINE_SERVER.defaultUrl;
}

export function resolveOnlineServerUrl(): string {
  let override: string | null = null;
  try {
    override = window.localStorage.getItem(ONLINE_SERVER.storageKey);
  } catch {
    // Storage can be blocked/unavailable - the override is a convenience only.
  }
  return pickServerUrl(override, import.meta.env.VITE_DEBRIS_SERVER as string | undefined);
}
