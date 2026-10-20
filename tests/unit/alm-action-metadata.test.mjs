import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { toActionAlmConnection } from "../../electron/alm-action-metadata.js";

test("returns only safe ALM metadata and excludes unknown providers", () => {
  const metadata = toActionAlmConnection({
    id: "alm-1",
    name: "QA Jira",
    platform: "jira",
    baseUrl: "https://jira.example.invalid",
    token: "secret-token-value",
  });
  assert.deepEqual(metadata, {
    id: "alm-1",
    name: "QA Jira",
    platform: "jira",
    status: "configured",
    capabilities: [],
  });
  assert.doesNotMatch(JSON.stringify(metadata), /secret-token-value|baseUrl|token/i);
  assert.deepEqual(
    toActionAlmConnection({
      id: "alm-3",
      name: "Incomplete connection",
      platform: "azure-devops",
      token: "",
    }),
    {
      id: "alm-3",
      name: "Incomplete connection",
      platform: "azure-devops",
      status: "needs-credentials",
      capabilities: [],
    },
  );
  assert.equal(toActionAlmConnection({
    id: "alm-2",
    name: "Unknown",
    platform: "gitlab",
    token: "secret-token-value",
  }), null);
});

test("preload exposes the typed, fixed ALM metadata IPC operation", () => {
  const source = readFileSync(new URL("../../electron/preload.js", import.meta.url), "utf8");
  const mainSource = readFileSync(new URL("../../electron/main.js", import.meta.url), "utf8");
  let exposed;
  const calls = [];
  const electron = {
    contextBridge: {
      exposeInMainWorld: (_name, api) => {
        exposed = api;
      },
    },
    ipcRenderer: {
      invoke: (...args) => {
        calls.push(args);
        return Promise.resolve({ success: true, connections: [] });
      },
      on() {},
      removeListener() {},
      send() {},
    },
  };

  runInNewContext(source, {
    require: () => electron,
    process: { platform: "darwin" },
  });
  assert.equal(typeof exposed.almListActionConnections, "function");
  assert.equal("getLocalApiToken" in exposed, false);
  assert.doesNotMatch(source, /PULSE_LOCAL_API_TOKEN|getLocalApiToken/);
  assert.equal("almGetProfiles" in exposed, false);
  exposed.almListActionConnections();
  assert.deepEqual(calls, [["alm:list-action-connections"]]);
  assert.match(mainSource, /ipcMain\.handle\("alm:list-action-connections"/);
  assert.match(mainSource, /function setupLocalApiAuthorization\(\)/);
  assert.match(mainSource, /Authorization: `Bearer \$\{token\}`/);
});

test("keeps the Electron session token in main and authenticates terminal IPC senders", () => {
  const preload = readFileSync(new URL("../../electron/preload.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../../electron/main.js", import.meta.url), "utf8");
  const terminalIpc = main.split("function setupTerminalIPC()")[1]?.split("app.whenReady()")[0] ?? "";
  assert.doesNotMatch(preload, /PULSE_LOCAL_API_TOKEN|getLocalApiToken/);
  assert.match(main, /function assertTrustedRenderer\(event\)/);
  assert.equal((terminalIpc.match(/assertTrustedRenderer\(event\)/g) ?? []).length, 4);
});
