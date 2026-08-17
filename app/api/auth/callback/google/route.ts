import { NextResponse } from "next/server";
import { requiredEnv, sealSession, SESSION_COOKIE, sessionCookieOptions, type GoogleSession } from "@/app/lib/google-auth";

function requestCookies(request: Request) {
  const result = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) result.set(key, decodeURIComponent(rest.join("=")));
  }
  return result;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (message: string) => NextResponse.redirect(`${url.origin}/?auth_error=${encodeURIComponent(message)}`);
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieMap = requestCookies(request);
  const expectedState = cookieMap.get("site_survey_oauth_state");
  const verifier = cookieMap.get("site_survey_oauth_verifier");
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return fail("invalid_oauth_state");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: `${url.origin}/api/auth/callback/google`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) return fail("token_exchange_failed");
  const token = (await tokenResponse.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!userResponse.ok) return fail("user_profile_failed");
  const user = (await userResponse.json()) as { email: string; name?: string; picture?: string };
  const session: GoogleSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    user: { email: user.email, name: user.name || user.email, picture: user.picture },
  };
  const response = NextResponse.redirect(`${url.origin}/?auth=success`);
  response.cookies.set(SESSION_COOKIE, await sealSession(session), sessionCookieOptions(url.protocol === "https:"));
  response.cookies.delete("site_survey_oauth_state");
  response.cookies.delete("site_survey_oauth_verifier");
  return response;
}
