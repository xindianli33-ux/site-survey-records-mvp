import { NextResponse } from "next/server";
import { requiredEnv } from "@/app/lib/google-auth";

function randomBase64Url(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function challengeFor(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: `${requestUrl.origin}/api/auth/callback/google`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
    scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/spreadsheets"].join(" "),
  }).toString();
  const response = NextResponse.redirect(authorizationUrl);
  const options = { httpOnly: true, secure: requestUrl.protocol === "https:", sameSite: "lax" as const, path: "/", maxAge: 600 };
  response.cookies.set("site_survey_oauth_state", state, options);
  response.cookies.set("site_survey_oauth_verifier", verifier, options);
  return response;
}
