// The one fetch client every API function goes through. It attaches the
// active account's access token, refreshes once on 401 and retries, and
// normalizes error messages. It never logs request or token details.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type AuthHooks = {
  getAccessToken: () => string | null;
  /** Returns a fresh access token, or null when the session cannot be renewed. */
  refreshAccessToken: (failedToken: string) => Promise<string | null>;
  /** Called when refresh failed: the account must be signed out. */
  onAuthFailure: (failedToken: string) => void;
};

let auth: AuthHooks = {
  getAccessToken: () => null,
  refreshAccessToken: async () => null,
  onAuthFailure: () => {},
};

/** Wired by the auth feature so this module stays free of app imports. */
export function configureApiClient(hooks: AuthHooks) {
  auth = hooks;
}

export const API_BASE = "/api";

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header and refresh handling (sign-in, refresh). */
  anonymous?: boolean;
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

function send(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-TeamPulse-Request": "1",
  };
  if (token) headers.Authorization = "Bearer " + token;
  return fetch(API_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiRequest<T = unknown>(
  path: string,
  { method, body, anonymous = false }: RequestOptions = {},
): Promise<T> {
  const verb = method ?? (body === undefined ? "GET" : "POST");
  const token = anonymous ? null : auth.getAccessToken();
  let response = await send(path, verb, body, token);

  // On 401: refresh once, then retry once. A second 401 ends the session.
  if (response.status === 401 && !anonymous && token) {
    const fresh = await auth.refreshAccessToken(token);
    if (fresh) response = await send(path, verb, body, fresh);
    if (!fresh || response.status === 401) auth.onAuthFailure(token);
  }

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
};
