export const metadata = { title: "Sign in" };

// In Next.js 15+, searchParams is a Promise
type Props = { searchParams: Promise<{ next?: string; error?: string }> };

// Friendly messages for the error codes the backend can send back
const errors: Record<string, string> = {
  denied: "Sign-in was cancelled.",
  state: "Your sign-in session expired. Please try again.",
  failed: "We couldn't sign you in with Google. Please try again.",
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;

  // Only pass on site-relative paths
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-gray-600">
        Use your Google account to sign in or create an account.
      </p>

      {/* Error message, if any */}
      {error && (
        <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {errors[error] ?? "Something went wrong."}
        </p>
      )}

      {/* Plain <a> on purpose: this must be a full page navigation to the API, not a client-side route */}
      <a
        href={`/api/v1/auth/google/login?next=${encodeURIComponent(safeNext)}`}
        className="btn-secondary mt-6 inline-block w-full"
      >
        Continue with Google
      </a>
    </div>
  );
}
