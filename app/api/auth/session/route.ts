import { NextResponse } from "next/server";
import { readSession } from "@/app/lib/google-auth";

export async function GET() {
  const session = await readSession();
  return NextResponse.json(session ? { authenticated: true, user: session.user } : { authenticated: false });
}
