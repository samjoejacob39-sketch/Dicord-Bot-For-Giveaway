export interface FullMinecraftProfile {
  username: string;
  uuid?: string;
  formattedUuid?: string;
  avatarUrl: string;
  bodyUrl: string;
  comboUrl: string;
  skinFrontUrl: string;
  skinBackUrl: string;
  skinType: string;
  capes: string;
  capeUrl?: string;
  hasCape: boolean;
  nameChangeable: boolean;
  lastNameChange: string;
  emailChangeable: boolean;
  passwordChangeable: boolean;
  gameType: string;
}

export function formatUuid(uuid: string): string {
  const clean = uuid.replace(/-/g, "");
  if (clean.length !== 32) return uuid;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

/**
 * Automatically fetch Minecraft profile details (UUID, skin model, capes,
 * and render URLs) from PlayerDB / Mojang texture data.
 */
export async function resolveMinecraftProfile(
  rawUsername: string,
  timeoutMs: number = 3500
): Promise<FullMinecraftProfile> {
  const cleanUsername = rawUsername.trim();
  const enc = encodeURIComponent(cleanUsername);

  // Safe fallback profile (used if the lookup fails)
  const profile: FullMinecraftProfile = {
    username: cleanUsername,
    avatarUrl: `https://mc-heads.net/avatar/${enc}/128`,
    bodyUrl: `https://mc-heads.net/body/${enc}/right`,
    comboUrl: `https://mc-heads.net/combo/${enc}/right`,
    skinFrontUrl: `https://mc-heads.net/body/${enc}/left`,
    skinBackUrl: `https://mc-heads.net/body/${enc}/right`,
    skinType: "Classic (Steve)",
    capes: "None",
    hasCape: false,
    nameChangeable: false,
    lastNameChange: "Unknown",
    emailChangeable: true,
    passwordChangeable: true,
    gameType: "Java, Bedrock",
  };

  // Fetch from PlayerDB API (UUID, casing, textures, skin model, cape)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(
      `https://playerdb.co/api/player/minecraft/${enc}`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "Minecraft-Checker-Bot/2.0" },
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.data?.player) {
        const p = data.data.player;
        profile.username = p.username || cleanUsername;
        profile.uuid = p.raw_id || p.id?.replace(/-/g, "");
        profile.formattedUuid =
          p.id || (profile.uuid ? formatUuid(profile.uuid) : undefined);

        if (profile.uuid) {
          const id = profile.uuid;
          profile.avatarUrl = `https://mc-heads.net/avatar/${id}/128`;
          profile.bodyUrl = `https://mc-heads.net/body/${id}/right`;
          profile.comboUrl = `https://mc-heads.net/combo/${id}/right`;
          profile.skinFrontUrl = `https://mc-heads.net/body/${id}/left`;
          profile.skinBackUrl = `https://mc-heads.net/body/${id}/right`;
        }

        // Decode the Mojang texture property for skin model + cape presence
        if (Array.isArray(p.properties) && p.properties.length > 0) {
          const texProp = p.properties.find(
            (prop: any) => prop.name === "textures"
          );
          if (texProp?.value) {
            try {
              const decoded = JSON.parse(
                Buffer.from(texProp.value, "base64").toString("utf8")
              );

              const skinMeta = decoded?.textures?.SKIN?.metadata?.model;
              profile.skinType =
                skinMeta === "slim" ? "Slim (Alex)" : "Classic (Steve)";

              if (decoded?.textures?.CAPE?.url) {
                profile.hasCape = true;
                profile.capes = "Yes";
                profile.capeUrl = profile.uuid
                  ? `https://crafatar.com/capes/${profile.uuid}?scale=10`
                  : decoded.textures.CAPE.url;
              } else {
                profile.hasCape = false;
                profile.capes = "None";
                profile.capeUrl = undefined;
              }
            } catch {
              // Ignore malformed texture data
            }
          }
        }
      }
    }
  } catch {
    // PlayerDB lookup failed or timed out — fallback profile is used
  }

  return profile;
}
