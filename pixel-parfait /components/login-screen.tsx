"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

type LoginScreenProps = {
  configured: boolean;
};

export function LoginScreen({ configured }: LoginScreenProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "로그인에 실패했습니다.");
        return;
      }

      setPassword("");
      router.refresh();
    });
  }

  return (
    <section className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="glass-card grid-fade relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--teal)] to-[var(--olive)]" />
        <div className="space-y-8">
          <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-white/55 px-3 py-1 text-sm font-medium text-[var(--muted)]">
            Private image lab for Replicate
          </div>

          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.28em] text-[var(--muted)]">Pixel Parfait</p>
            <h1 className="fancy-title max-w-2xl text-5xl leading-none font-semibold text-balance sm:text-6xl">
              여러 모델이 같은 프롬프트를 어떻게 다르게 해석하는지, 한 화면에서.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
              초보자는 기본 설정만으로, 숙련자는 고급 옵션까지. 생성 결과는 저장하지 않고 바로
              다운로드하는 흐름에 맞춰 디자인했습니다.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              title="모델 동시 비교"
              description="최대 4개 모델에 같은 프롬프트를 한 번에 보내고 결과를 나란히 봅니다."
            />
            <FeatureCard
              title="비용 가시화"
              description="선택한 모델 기준 예상 차감 비용을 미리 보여주고, 생성 후에도 다시 확인합니다."
            />
            <FeatureCard
              title="즉시 다운로드"
              description="개별 다운로드와 ZIP 일괄 다운로드를 모두 지원하고 서버에는 남기지 않습니다."
            />
          </div>
        </div>
      </div>

      <div className="glass-card self-center rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Access</p>
            <h2 className="text-3xl font-semibold tracking-tight">비밀번호를 입력해 주세요</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              URL을 알아도 비밀번호 없이는 생성 API가 동작하지 않도록 잠가두었습니다.
            </p>
          </div>

          {!configured ? (
            <div className="rounded-3xl border border-[var(--border)] bg-white/70 p-5 text-sm leading-6 text-[var(--muted)]">
              <p className="font-semibold text-[var(--foreground)]">환경 변수가 아직 준비되지 않았습니다.</p>
              <p className="mt-2">
                `APP_ACCESS_PASSWORD` 와 `APP_SESSION_SECRET` 를 먼저 설정하면 이 로그인 화면이 바로
                동작합니다.
              </p>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--muted)]">접속 비밀번호</span>
              <input
                className="w-full rounded-2xl border border-[var(--border)] bg-white/85 px-4 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(201,109,68,0.12)]"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                disabled={!configured || isPending}
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              className="w-full rounded-full bg-[var(--foreground)] px-5 py-3 text-base font-semibold text-white transition hover:translate-y-[-1px] hover:bg-[#2a221d] disabled:cursor-not-allowed disabled:opacity-55"
              type="submit"
              disabled={!configured || isPending}
            >
              {isPending ? "문을 여는 중..." : "스튜디오 입장"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

type FeatureCardProps = {
  title: string;
  description: string;
};

function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white/65 p-4">
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
    </div>
  );
}
