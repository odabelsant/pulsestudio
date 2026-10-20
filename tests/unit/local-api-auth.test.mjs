import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminApiAuthorizationError,
  localApiAuthorizationError,
} from "../../src/lib/local-api-auth.ts";

const savedEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  sessionToken: process.env.PULSE_LOCAL_API_TOKEN,
  adminToken: process.env.PULSE_ADMIN_TOKEN,
};

function setEnvironment({ nodeEnv, sessionToken, adminToken }) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (sessionToken === undefined) delete process.env.PULSE_LOCAL_API_TOKEN;
  else process.env.PULSE_LOCAL_API_TOKEN = sessionToken;
  if (adminToken === undefined) delete process.env.PULSE_ADMIN_TOKEN;
  else process.env.PULSE_ADMIN_TOKEN = adminToken;
}

test.after(() => setEnvironment(savedEnvironment));

test("requires a matching bearer token whenever an Electron session token is configured", async () => {
  const token = "a".repeat(64);
  setEnvironment({ nodeEnv: "development", sessionToken: token });

  const unauthorized = localApiAuthorizationError(new Request("http://127.0.0.1:3000/api/runner"));
  assert.equal(unauthorized?.status, 401);
  const errorBody = await unauthorized.json();
  assert.equal(errorBody.error, "Se requiere una sesión local autorizada.");
  assert.doesNotMatch(JSON.stringify(errorBody), new RegExp(token));

  const wrongToken = localApiAuthorizationError(new Request("http://127.0.0.1:3000/api/runner", {
    headers: { Authorization: `Bearer ${"b".repeat(64)}` },
  }));
  assert.equal(wrongToken?.status, 401);

  const authorized = localApiAuthorizationError(new Request("http://127.0.0.1:3000/api/runner", {
    headers: { Authorization: `Bearer ${token}` },
  }));
  assert.equal(authorized, null);
});

test("allows only same-origin loopback browser requests in local development", () => {
  setEnvironment({ nodeEnv: "development", sessionToken: undefined });
  const accepted = localApiAuthorizationError(new Request("http://localhost:3000/api/context", {
    headers: {
      Host: "localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      Origin: "http://localhost:3000",
    },
  }));
  assert.equal(accepted, null);

  const remoteHost = localApiAuthorizationError(new Request("http://192.168.1.20:3000/api/context", {
    headers: {
      Host: "192.168.1.20:3000",
      "Sec-Fetch-Site": "same-origin",
      Origin: "http://192.168.1.20:3000",
    },
  }));
  assert.equal(remoteHost?.status, 401);

  const crossOrigin = localApiAuthorizationError(new Request("http://127.0.0.1:3000/api/context", {
    headers: {
      Host: "127.0.0.1:3000",
      "Sec-Fetch-Site": "cross-site",
      Origin: "https://attacker.invalid",
    },
  }));
  assert.equal(crossOrigin?.status, 401);
});

test("fails closed outside development when no local session token exists", () => {
  setEnvironment({ nodeEnv: "production", sessionToken: undefined });
  const result = localApiAuthorizationError(new Request("http://127.0.0.1:3000/api/history", {
    headers: {
      Host: "127.0.0.1:3000",
      "Sec-Fetch-Site": "same-origin",
    },
  }));
  assert.equal(result?.status, 401);
});

test("fails closed for missing and invalid administrative credentials", async () => {
  setEnvironment({ nodeEnv: "development", sessionToken: undefined, adminToken: undefined });
  const missing = adminApiAuthorizationError(new Request("http://localhost:3000/api/env"));
  assert.equal(missing?.status, 503);

  setEnvironment({ nodeEnv: "development", sessionToken: undefined, adminToken: "secret-admin-value" });
  const invalid = adminApiAuthorizationError(new Request("http://localhost:3000/api/env", {
    headers: { "x-pulse-admin-token": "wrong" },
  }));
  assert.equal(invalid?.status, 401);
  assert.doesNotMatch(await invalid.text(), /secret-admin-value/);

  const valid = adminApiAuthorizationError(new Request("http://localhost:3000/api/env", {
    headers: { "x-pulse-admin-token": "secret-admin-value" },
  }));
  assert.equal(valid, null);
});
