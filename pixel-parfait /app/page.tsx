import { LoginScreen } from "@/components/login-screen";
import { Studio } from "@/components/studio";
import { isAuthConfigured, isAuthenticated } from "@/lib/auth";

export default async function HomePage() {
  const [authenticated, configured] = await Promise.all([
    isAuthenticated(),
    Promise.resolve(isAuthConfigured()),
  ]);

  return (
    <main className="page-shell min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl items-stretch justify-center">
        {authenticated ? (
          <Studio />
        ) : (
          <LoginScreen configured={configured} />
        )}
      </div>
    </main>
  );
}
