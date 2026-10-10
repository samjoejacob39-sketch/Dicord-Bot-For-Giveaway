export interface MinecraftProfile {
  username: string;
  uuid?: string;
  formattedUuid?: string;
  avatarUrl: string;
  bodyUrl: string;
}

export function formatUuid(uuid: string): string {
  const clean = uuid.replace(/-/g, "");
  if (clean.length !== 32) return uuid;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

/**
 * Resolves Minecraft profile UUID and avatar URLs from Mojang API.
 * Fails safely if network is unavailable or user doesn't exist.
 */
export async function resolveMinecraftProfile(
  username: string,
  timeoutMs: number = 2500
): Promise<MinecraftProfile> {
  const defaultProfile: MinecraftProfile = {
    username,
    avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(username)}/128`,
    bodyUrl: `https://mc-heads.net/body/${encodeURIComponent(username)}/right`,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "Discord-AccountGiver-Bot/1.0" },
      }
    );

    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { id?: string; name?: string };
      if (data?.id) {
        return {
          username: data.name || username,
          uuid: data.id,
          formattedUuid: formatUuid(data.id),
          avatarUrl: `https://mc-heads.net/avatar/${data.id}/128`,
          bodyUrl: `https://mc-heads.net/body/${data.id}/right`,
        };
      }
    }
  } catch {
    // Mojang API lookup failed or timed out; proceed with default URLs safely
  }

  return defaultProfile;
}
