import { NextRequest, NextResponse } from "next/server";
import { searchEntries } from "@/lib/db";

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const results = searchEntries(query, 10)
    .map(({ slug, name, nameEn, category, era, summary }) => ({
      slug,
      name,
      nameEn,
      category,
      era,
      summary,
    }));

  return NextResponse.json({ query, count: results.length, results });
}
