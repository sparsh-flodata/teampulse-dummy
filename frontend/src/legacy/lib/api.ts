export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-TeamPulse-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ detail: "The server could not complete this request." }));
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : data.detail?.map((d: { msg: string }) => d.msg).join(", ") ||
            "Please check the form.",
      response.status,
    );
  }
  return response.json();
}
