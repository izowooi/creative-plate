import { NextRequest, NextResponse } from "next/server";
import { searchEntryPreviews } from "@/lib/db";

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const results = searchEntryPreviews(query, 10)
    .map(({ slug, name, nameEn, category, subcategory, era, summary, greatWork }) => ({
      slug,
      name,
      nameEn,
      category,
      subcategory,
      era,
      summary,
      creator: greatWork?.creatorRef,
      creationLabel: greatWork?.creationLabel,
      gameEra: greatWork?.gameEra,
      pack: greatWork?.pack,
    }));

  return NextResponse.json({ query, count: results.length, results });
}
