import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function GET(request: Request) {
  const authenticated = await requireAuth();

  if (!authenticated) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("url");
  const filename = sanitizeFilename(searchParams.get("filename") ?? "pixel-parfait-image");

  if (!source) {
    return NextResponse.json({ error: "다운로드할 파일 URL 이 없습니다." }, { status: 400 });
  }

  const sourceUrl = new URL(source);

  if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "replicate.delivery") {
    return NextResponse.json({ error: "허용되지 않은 파일 URL 입니다." }, { status: 400 });
  }

  const upstream = await fetch(sourceUrl.toString(), {
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "파일을 가져오지 못했습니다." }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
