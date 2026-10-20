import { timingSafeEqual } from "node:crypto";

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isValidSessionToken(request: Request, expected: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}

function isLocalDevelopmentRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!host || fetchSite !== "same-origin") return false;

  try {
    const requestUrl = new URL(request.url);
    const hostUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (!isLoopbackHostname(hostUrl.hostname)) return false;

    const origin = request.headers.get("origin");
    return !origin || new URL(origin).origin === hostUrl.origin;
  } catch {
    return false;
  }
}

export function localApiAuthorizationError(request: Request): Response | null {
  const expectedToken = process.env.PULSE_LOCAL_API_TOKEN;
  const authorized = expectedToken
    ? isValidSessionToken(request, expectedToken)
    : isLocalDevelopmentRequest(request);

  return authorized
    ? null
    : new Response(JSON.stringify({ error: "Se requiere una sesión local autorizada." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
}

export function adminApiAuthorizationError(request: Request): Response | null {
  const expected = process.env.PULSE_ADMIN_TOKEN;
  const received = request.headers.get("x-pulse-admin-token");
  if (!expected) {
    return new Response(JSON.stringify({ error: "La autorización administrativa no está configurada." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const receivedBytes = Buffer.from(received ?? "", "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const authorized = receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
  return authorized
    ? null
    : new Response(JSON.stringify({ error: "Se requiere autorización administrativa válida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
}
