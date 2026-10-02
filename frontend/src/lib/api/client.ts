// Server-side helper for calling the Express API from Next.js server components.
// (Browser code calls the relative /api/... path instead, which goes through the rewrite.)

// Backend base URL, with any trailing slash removed
const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);

// Error carrying the HTTP status so pages can react (e.g. 404 → notFound())
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// GET a JSON resource from the API; never cached for now (so builds don't depend on the backend being awake)
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}/api/v1${path}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}
