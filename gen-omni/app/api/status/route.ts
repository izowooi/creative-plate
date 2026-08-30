import { NextResponse } from "next/server";
import { configuredApiKeys } from "@/lib/api-keys";

export function GET() {
  const count = configuredApiKeys().length;
  return NextResponse.json({ configured: count > 0, fallbackReady: count > 1, model: "gemini-omni-1.1-flash" });
}
