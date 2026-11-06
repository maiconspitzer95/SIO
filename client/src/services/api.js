let csrfToken;
export async function api(path, options = {}) {
  const method = options.method || "GET";
  const multipart = options.body instanceof FormData;
  if (method !== "GET" && !csrfToken) {
    const response = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error("Não foi possível iniciar uma sessão segura.");
    csrfToken = (await response.json()).csrfToken;
  }
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !multipart
        ? { "Content-Type": "application/json" }
        : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
    body: options.body
      ? multipart
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("sio:expired"));
    if (response.status === 403) csrfToken = undefined;
    const error = new Error(
      data.error || "Não foi possível concluir a solicitação.",
    );
    error.status = response.status;
    throw error;
  }
  if (data.csrfToken) csrfToken = data.csrfToken;
  if (path === "/auth/logout" || path === "/auth/reset") csrfToken = undefined;
  return data;
}
