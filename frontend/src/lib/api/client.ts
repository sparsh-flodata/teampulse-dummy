// The one fetch client every API function goes through. Sign-in is FloData
// single sign-on: the session lives in httpOnly cookies set by the backend
// (same origin), so no token is ever handled here. On 401 the browser goes to
// the FloData sign-in and comes back to the current page. It never logs
// request details.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const API_BASE = "/api";
export const SIGN_IN_URL = "/auth/login";
export const SIGN_OUT_URL = "/auth/logout";

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

async function errorMessage(response: Response) {
  const data = await response
    .json()
    .catch(() => ({ detail: "The server could not complete this request." }));
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail))
    return data.detail.map((d: { msg: string }) => d.msg).join(", ");
  return "Please check the form.";
}

let signingIn = false;

/** Full-page trip to FloData sign-in; it returns to the page the user was on. */
function goToSignIn(): Promise<never> {
  if (!signingIn) {
    signingIn = true;
    const here = window.location.pathname + window.location.search;
    window.location.assign(
      SIGN_IN_URL + "?next=" + encodeURIComponent(here),
    );
  }
  // The page is navigating away; leave callers pending rather than flash an error.
  return new Promise<never>(() => {});
}

export async function apiRequest<T = unknown>(
  path: string,
  { method, body }: RequestOptions = {},
): Promise<T> {
  const verb = method ?? (body === undefined ? "GET" : "POST");
  const response = await fetch(API_BASE + path, {
    method: verb,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-TeamPulse-Request": "1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // The backend refreshes tokens silently; a 401 means the session is over.
  if (response.status === 401) return goToSignIn();
  if (!response.ok)
    throw new ApiError(await errorMessage(response), response.status);
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body: unknown = {}) =>
    apiRequest<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
