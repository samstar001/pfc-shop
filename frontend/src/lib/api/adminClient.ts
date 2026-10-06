// Error carrying the HTTP status so pages can react to 401/403
export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Browser-side helper for admin API calls (goes through the /api rewrite, the session cookie is sent automatically)
export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // File uploads (FormData) must set their own content type, so only add JSON headers for normal bodies
  const isForm =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Prefer the first field-level message, then the general one
    const message =
      data?.error?.details?.[0]?.issue ??
      data?.error?.message ??
      "Request failed";
    throw new AdminApiError(res.status, message);
  }
  return data as T;
}
