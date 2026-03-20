import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePassword, isAuthConfigured, setAuthCookie } from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error: "APP_ACCESS_PASSWORD 또는 APP_SESSION_SECRET 이 설정되지 않았습니다.",
      },
      { status: 503 },
    );
  }

  const parsed = loginSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const isValid = await authenticatePassword(parsed.data.password);

  if (!isValid) {
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  await setAuthCookie();

  return NextResponse.json({ ok: true });
}
