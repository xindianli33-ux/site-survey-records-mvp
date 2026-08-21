import { cookies } from "next/headers";

export type GoogleUser = { email: string; name: string; picture?: string };
export type GoogleSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: GoogleUser;
};

export const SESSION_COOKIE = "site_survey_google_session";

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requiredEnv("GOOGLE_CLIENT_SECRET")));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealSession(session: GoogleSession) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), plaintext);
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function openSession(value?: string): Promise<GoogleSession | null> {
  if (!value) return null;
  try {
    const [ivPart, ciphertextPart] = value.split(".");
    if (!ivPart || !ciphertextPart) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivPart) },
      await encryptionKey(),
      base64UrlToBytes(ciphertextPart),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as GoogleSession;
  } catch {
    return null;
  }
}

export async function readSession() {
  const store = await cookies();
  return openSession(store.get(SESSION_COOKIE)?.value);
}

export async function refreshGoogleSession(session: GoogleSession) {
  if (session.expiresAt > Date.now() + 60_000) return { session, refreshed: false };
  if (!session.refreshToken) throw new Error("Google authorization expired. Please sign in again.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: session.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Unable to refresh Google authorization.");
  const token = (await response.json()) as { access_token: string; expires_in?: number };
  return {
    refreshed: true,
    session: { ...session, accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 },
  };
}

export const sessionCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
});
