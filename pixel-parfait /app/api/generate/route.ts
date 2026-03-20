import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateRequestSchema } from "@/lib/contracts";
import { createPrediction } from "@/lib/replicate";

export async function POST(request: Request) {
  const authenticated = await requireAuth();

  if (!authenticated) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const payload = generateRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "입력값을 다시 확인해 주세요.", issues: payload.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const predictions = await Promise.all(
      payload.data.selectedModels.map((modelId) => createPrediction(modelId, payload.data)),
    );

    const totalEstimateUsd = predictions.reduce((sum, prediction) => sum + prediction.estimateUsd, 0);

    return NextResponse.json({
      issuedAt: new Date().toISOString(),
      totalEstimateUsd,
      predictions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "생성 요청 중 알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
