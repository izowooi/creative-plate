"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

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
        setError(data?.error ?? "입장할 수 없습니다.");
        return;
      }

      setPassword("");
      router.refresh();
    });
  }

  return (
    <section className="relative flex min-h-[calc(100vh-3rem)] w-full items-center justify-center">
      <div className="absolute right-0 top-0">
        <ThemeToggle />
      </div>

      <div className="glass-card w-full max-w-md rounded-[2rem] p-6 sm:p-8">
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium tracking-[0.28em] text-[var(--muted)] uppercase">
              Pixel Parfait
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Enter</h1>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              className="app-input rounded-2xl px-4 py-3 text-center text-base"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="입장 코드"
              autoComplete="current-password"
              disabled={!configured || isPending}
            />

            <button
              className="w-full rounded-2xl bg-[var(--foreground)] px-4 py-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45"
              type="submit"
              disabled={!configured || isPending}
            >
              {isPending ? "Entering..." : "입장"}
            </button>
          </form>

          {error ? (
            <div className="rounded-2xl border border-[color:rgba(229,72,77,0.24)] bg-[color:rgba(229,72,77,0.08)] px-4 py-3 text-center text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          {!configured ? (
            <p className="text-center text-sm text-[var(--muted)]">
              `APP_ACCESS_PASSWORD`, `APP_SESSION_SECRET` 설정이 필요합니다.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
