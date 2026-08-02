import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import archiveManifest from "../public/images/archive/manifest.json";

const archiveSlugs = new Set(Object.keys(archiveManifest));

export function proxy(request: NextRequest) {
  const match = /^\/archive\/([^/]+)\/?$/.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();

  let slug = "";
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    // Invalid URL encoding is treated like any other unknown archive slug.
  }
  if (archiveSlugs.has(slug)) return NextResponse.next();

  const notFoundUrl = request.nextUrl.clone();
  notFoundUrl.pathname = "/__archive-not-found";
  notFoundUrl.search = "";
  return NextResponse.rewrite(notFoundUrl, { status: 404 });
}

export const config = {
  matcher: ["/archive/:path*"],
};
