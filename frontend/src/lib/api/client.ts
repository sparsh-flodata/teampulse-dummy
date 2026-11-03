// The one fetch client every API function goes through. It attaches the
// active account's access token and normalizes error messages. It never
// logs request or token details.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type TokenSource = () => string | null;
type UnauthorizedHandler = () => void;

let getAccessToken: TokenSource = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

/** Wired by the auth feature so this module stays free of app imports. */
export function configureApiClient(options: {
  getAccessToken: TokenSource;
  onUnauthorized: UnauthorizedHandler;
}) {
  getAccessToken = options.getAccessToken;
  onUnauthorized = options.onUnauthorized;
}

export const API_BASE = "/api";

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header (sign-in, refresh). */
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

export async function apiRequest<T = unknown>(
  path: string,
  { method, body, anonymous = false }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-TeamPulse-Request": "1",
  };
  const token = anonymous ? null : getAccessToken();
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(API_BASE + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new ApiError(await errorMessage(response), response.status);
    if (response.status === 401 && !anonymous) onUnauthorized();
    throw error;
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body: unknown = {}) =>
    apiRequest<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body }),
};
