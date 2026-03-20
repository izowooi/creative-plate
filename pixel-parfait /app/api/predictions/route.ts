import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fetchPredictionStatus } from "@/lib/replicate";

export async function GET(request: Request) {
  const authenticated = await requireAuth();

  if (!authenticated) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ids = searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!ids?.length) {
    return NextResponse.json({ error: "조회할 prediction id 가 없습니다." }, { status: 400 });
  }

  try {
    const predictions = await Promise.all(ids.map((id) => fetchPredictionStatus(id)));
    return NextResponse.json({ predictions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "예측 상태를 불러오지 못했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
