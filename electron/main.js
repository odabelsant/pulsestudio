const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
let pty;
try {
  pty = require("node-pty");
} catch (e) {
  console.warn("node-pty could not be loaded immediately:", e);
}

let mainWindow = null;
let currentPty = null;
const validatedAlmConnections = new Map();

const ALM_PLATFORMS = new Set(["azure-devops", "jira"]);
const AZURE_WORK_ITEM_NAMESPACE = "52d39943-cb85-4d7f-8fa8-c6baac873819";
const ALM_TEST_TTL_MS = 5 * 60 * 1000;

function almStorePath() {
  return path.join(app.getPath("userData"), "alm-connections.enc");
}

function ensureSecureAlmStorage() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("El cifrado seguro del sistema no está disponible.");
  }
  if (
    process.platform === "linux" &&
    safeStorage.getSelectedStorageBackend() === "basic_text"
  ) {
    throw new Error("Configura GNOME Keyring o KWallet para guardar tokens de forma segura.");
  }
}

function assertTrustedAlmSender(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error("La solicitud de configuración ALM no proviene de la ventana de PulseStudio.");
  }
}

function normalizeAlmInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Los datos de conexión no son válidos.");
  }
  const { id, platform, name, baseUrl, token } = input;
  if (platform !== "azure-devops" && platform !== "jira") {
    throw new Error("Selecciona Azure DevOps o Jira.");
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new Error("El nombre debe tener entre 1 y 100 caracteres.");
  }
  if (typeof baseUrl !== "string" || baseUrl.length > 2048) {
    throw new Error("La URL de conexión no es válida.");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl.trim());
  } catch {
    throw new Error("Introduce una URL completa, por ejemplo https://dev.azure.com/organizacion.");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("La URL debe usar HTTPS y no contener credenciales, parámetros ni fragmentos.");
  }
  if (token !== undefined && (typeof token !== "string" || token.length > 8192)) {
    throw new Error("El token de acceso no es válido.");
  }
  if (id !== undefined && (typeof id !== "string" || id.length > 100)) {
    throw new Error("El identificador de conexión no es válido.");
  }
  return {
    id: typeof id === "string" ? id : undefined,
    platform,
    name: name.trim(),
    baseUrl: parsedUrl.href.replace(/\/+$/, ""),
    token: typeof token === "string" ? token.trim() : "",
  };
}

function publicAlmConnection(connection) {
  return {
    id: connection.id,
    platform: connection.platform,
    name: connection.name,
    baseUrl: connection.baseUrl,
    hasToken: Boolean(connection.token),
    updatedAt: connection.updatedAt,
  };
}

async function readAlmConnections() {
  ensureSecureAlmStorage();
  try {
    const encrypted = await fs.promises.readFile(almStorePath(), "utf8");
    const decrypted = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    const connections = JSON.parse(decrypted);
    if (!Array.isArray(connections)) throw new Error("Formato de almacenamiento no válido.");
    return connections.filter((connection) =>
      connection &&
      typeof connection.id === "string" &&
      ALM_PLATFORMS.has(connection.platform) &&
      typeof connection.name === "string" &&
      typeof connection.baseUrl === "string" &&
      typeof connection.token === "string" &&
      typeof connection.updatedAt === "string"
    );
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw new Error("No se pudieron leer las conexiones ALM cifradas.");
  }
}

async function writeAlmConnections(connections) {
  ensureSecureAlmStorage();
  const encrypted = safeStorage.encryptString(JSON.stringify(connections)).toString("base64");
  const destination = almStorePath();
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, encrypted, { encoding: "utf8", mode: 0o600 });
    await fs.promises.rename(temporary, destination);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function connectionFingerprint(connection, token) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([
      connection.id || "",
      connection.platform,
      connection.name,
      connection.baseUrl,
      token,
    ]))
    .digest("hex");
}

async function almFetchJson(baseUrl, endpoint, token, platform) {
  const url = new URL(endpoint, `${baseUrl}/`);
  const authorization = platform === "azure-devops"
    ? `Basic ${Buffer.from(`:${token}`).toString("base64")}`
    : `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: authorization },
      redirect: "error",
      signal: controller.signal,
    });
    const body = await response.text();
    let data;
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function permissionValue(data) {
  return Boolean(data && Array.isArray(data.value) && data.value[0] === true);
}

async function testAzureDevOpsConnection(connection, token) {
  const projectsResult = await almFetchJson(
    connection.baseUrl,
    "_apis/projects?$top=1&api-version=7.1",
    token,
    connection.platform,
  );
  if (!projectsResult.response.ok) {
    return {
      success: false,
      readAccess: false,
      writeAccess: false,
      message: `Azure DevOps rechazó la lectura de proyectos (HTTP ${projectsResult.response.status}). Revisa la URL y el PAT.`,
    };
  }
  const project = projectsResult.data?.value?.[0];
  if (!project || typeof project.name !== "string") {
    return {
      success: false,
      readAccess: true,
      writeAccess: false,
      message: "La lectura funciona, pero no hay proyectos para comprobar permisos de escritura.",
    };
  }

  const namespaceResult = await almFetchJson(
    connection.baseUrl,
    `_apis/securitynamespaces/${AZURE_WORK_ITEM_NAMESPACE}?api-version=7.1`,
    token,
    connection.platform,
  );
  if (!namespaceResult.response.ok) {
    return {
      success: false,
      readAccess: true,
      writeAccess: false,
      message: "La lectura funciona, pero el PAT no permite consultar permisos de Work Items.",
    };
  }
  const namespace = Array.isArray(namespaceResult.data)
    ? namespaceResult.data[0]
    : Array.isArray(namespaceResult.data?.value)
      ? namespaceResult.data.value[0]
      : namespaceResult.data;
  const actions = Array.isArray(namespace?.actions) ? namespace.actions : [];
  const readBit = actions.find((action) =>
    typeof action?.bit === "number" &&
    /^(view|read).*work items?$/i.test(`${action.name ?? ""} ${action.displayName ?? ""}`.trim())
  )?.bit ?? actions.find((action) =>
    typeof action?.bit === "number" && /view work items|read work items/i.test(action.displayName ?? "")
  )?.bit;
  const writeBit = actions.find((action) =>
    typeof action?.bit === "number" &&
    /^(edit|write|create).*work items?$/i.test(`${action.name ?? ""} ${action.displayName ?? ""}`.trim())
  )?.bit ?? actions.find((action) =>
    typeof action?.bit === "number" && /edit work items|write work items|create work items/i.test(action.displayName ?? "")
  )?.bit;
  if (typeof readBit !== "number" || typeof writeBit !== "number") {
    return {
      success: false,
      readAccess: true,
      writeAccess: false,
      message: "La lectura funciona, pero Azure DevOps no devolvió los permisos necesarios para comprobar escritura.",
    };
  }

  const tokenPath = `$/` + project.name;
  const permissionsEndpoint = (bit) =>
    `_apis/permissions/${AZURE_WORK_ITEM_NAMESPACE}/${bit}?tokens=${encodeURIComponent(tokenPath)}&alwaysAllowAdministrators=false&api-version=7.1`;
  const [readResult, writeResult] = await Promise.all([
    almFetchJson(connection.baseUrl, permissionsEndpoint(readBit), token, connection.platform),
    almFetchJson(connection.baseUrl, permissionsEndpoint(writeBit), token, connection.platform),
  ]);
  const readAccess = readResult.response.ok && permissionValue(readResult.data);
  const writeAccess = writeResult.response.ok && permissionValue(writeResult.data);
  return {
    success: readAccess && writeAccess,
    readAccess,
    writeAccess,
    message: readAccess && writeAccess
      ? `Conexión validada. Lectura y escritura de Work Items confirmadas en ${project.name}; no se modificaron datos.`
      : `La autenticación funcionó, pero faltan permisos de ${!readAccess && !writeAccess ? "lectura y escritura" : !readAccess ? "lectura" : "escritura"} de Work Items en ${project.name}.`,
  };
}

async function testJiraConnection(connection, token) {
  let version = "3";
  let identity = await almFetchJson(
    connection.baseUrl,
    "rest/api/3/myself",
    token,
    connection.platform,
  );
  if (identity.response.status === 404) {
    version = "2";
    identity = await almFetchJson(
      connection.baseUrl,
      "rest/api/2/myself",
      token,
      connection.platform,
    );
  }
  if (!identity.response.ok) {
    return {
      success: false,
      readAccess: false,
      writeAccess: false,
      message: `Jira rechazó la autenticación (HTTP ${identity.response.status}). Revisa la URL y el Bearer Token.`,
    };
  }
  const projects = await almFetchJson(
    connection.baseUrl,
    version === "3"
      ? "rest/api/3/project/search?maxResults=1"
      : "rest/api/2/project",
    token,
    connection.platform,
  );
  if (!projects.response.ok) {
    return {
      success: false,
      readAccess: true,
      writeAccess: false,
      message: "La autenticación funciona, pero no se pudo leer un proyecto para comprobar permisos.",
    };
  }
  const project = Array.isArray(projects.data?.values)
    ? projects.data.values[0]
    : Array.isArray(projects.data)
      ? projects.data[0]
      : undefined;
  if (!project || (typeof project.id !== "string" && typeof project.id !== "number")) {
    return {
      success: false,
      readAccess: true,
      writeAccess: false,
      message: "La lectura funciona, pero no hay proyectos visibles para comprobar escritura.",
    };
  }
  const projectParameter = typeof project.key === "string"
    ? `projectKey=${encodeURIComponent(project.key)}`
    : `projectId=${encodeURIComponent(String(project.id))}`;
  const permissionResult = await almFetchJson(
    connection.baseUrl,
    `rest/api/${version}/mypermissions?${projectParameter}&permissions=BROWSE_PROJECTS,CREATE_ISSUES,EDIT_ISSUES`,
    token,
    connection.platform,
  );
  if (!permissionResult.response.ok) {
    return {
      success: false,
      readAccess: true,
      writeAccess: false,
      message: "La lectura funciona, pero Jira no permitió verificar los permisos del proyecto.",
    };
  }
  const permissions = permissionResult.data?.permissions ?? {};
  const readAccess = permissions.BROWSE_PROJECTS?.havePermission === true;
  const writeAccess =
    permissions.CREATE_ISSUES?.havePermission === true ||
    permissions.EDIT_ISSUES?.havePermission === true;
  return {
    success: readAccess && writeAccess,
    readAccess,
    writeAccess,
    message: readAccess && writeAccess
      ? `Conexión validada. Lectura y escritura de incidencias confirmadas en ${project.name ?? project.key}; no se modificaron datos.`
      : `La autenticación funcionó, pero faltan permisos de ${!readAccess && !writeAccess ? "lectura y escritura" : !readAccess ? "lectura" : "escritura"} en el proyecto Jira.`,
  };
}

function setupAlmIPC() {
  ipcMain.handle("alm:load-connections", async (event) => {
    assertTrustedAlmSender(event);
    try {
      const connections = await readAlmConnections();
      return { success: true, connections: connections.map(publicAlmConnection) };
    } catch (error) {
      return {
        success: false,
        connections: [],
        error: error instanceof Error ? error.message : "No se pudieron cargar las conexiones.",
      };
    }
  });

  ipcMain.handle("alm:test-connection", async (event, rawInput) => {
    assertTrustedAlmSender(event);
    try {
      const input = normalizeAlmInput(rawInput);
      let token = input.token;
      if (!token && input.id) {
        const existing = (await readAlmConnections()).find((connection) => connection.id === input.id);
        token = existing?.token ?? "";
      }
      if (!token) throw new Error("Introduce un token o selecciona una conexión guardada con token.");
      const result = input.platform === "azure-devops"
        ? await testAzureDevOpsConnection(input, token)
        : await testJiraConnection(input, token);
      if (result.success) {
        validatedAlmConnections.set(event.sender.id, {
          fingerprint: connectionFingerprint(input, token),
          expiresAt: Date.now() + ALM_TEST_TTL_MS,
        });
      } else {
        validatedAlmConnections.delete(event.sender.id);
      }
      return result;
    } catch (error) {
      validatedAlmConnections.delete(event.sender.id);
      return {
        success: false,
        readAccess: false,
        writeAccess: false,
        message: error instanceof Error ? error.message : "No se pudo probar la conexión.",
      };
    }
  });

  ipcMain.handle("alm:save-connection", async (event, rawInput) => {
    assertTrustedAlmSender(event);
    try {
      const input = normalizeAlmInput(rawInput);
      const connections = await readAlmConnections();
      const existing = input.id
        ? connections.find((connection) => connection.id === input.id)
        : undefined;
      const token = input.token || existing?.token || "";
      if (!token) throw new Error("Introduce el token antes de guardar.");
      const validation = validatedAlmConnections.get(event.sender.id);
      if (
        !validation ||
        validation.expiresAt < Date.now() ||
        validation.fingerprint !== connectionFingerprint(input, token)
      ) {
        throw new Error("Prueba la conexión con estos datos antes de guardar.");
      }
      const now = new Date().toISOString();
      const connection = {
        id: existing?.id ?? crypto.randomUUID(),
        platform: input.platform,
        name: input.name,
        baseUrl: input.baseUrl,
        token,
        updatedAt: now,
      };
      const next = existing
        ? connections.map((item) => item.id === existing.id ? connection : item)
        : [...connections, connection];
      await writeAlmConnections(next);
      validatedAlmConnections.delete(event.sender.id);
      return { success: true, connection: publicAlmConnection(connection) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "No se pudo guardar la conexión.",
      };
    }
  });

  ipcMain.handle("alm:delete-connection", async (event, id) => {
    assertTrustedAlmSender(event);
    try {
      if (typeof id !== "string" || !id) throw new Error("El identificador no es válido.");
      const connections = await readAlmConnections();
      const next = connections.filter((connection) => connection.id !== id);
      if (next.length === connections.length) throw new Error("No se encontró la conexión.");
      await writeAlmConnections(next);
      validatedAlmConnections.delete(event.sender.id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "No se pudo eliminar la conexión.",
      };
    }
  });
}

function waitForServer(url, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const parsed = new URL(url);

    function check() {
      const req = http.get(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname || "/",
          timeout: 1000,
        },
        (res) => {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            resolve(true);
          } else if (Date.now() - startTime < timeoutMs) {
            setTimeout(check, 800);
          } else {
            resolve(false);
          }
        }
      );

      req.on("error", () => {
        if (Date.now() - startTime < timeoutMs) {
          setTimeout(check, 800);
        } else {
          resolve(false);
        }
      });

      req.end();
    }

    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: "PulseStudio",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 12 },
    backgroundColor: "#0b0b0b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const devUrl = "http://localhost:3000";

  waitForServer(devUrl).then((ready) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (ready) {
      mainWindow.loadURL(devUrl);
    } else {
      console.warn("Dev server not responding, loading anyway...");
      mainWindow.loadURL(devUrl);
    }
  });

  mainWindow.on("closed", () => {
    if (currentPty) {
      try {
        currentPty.kill();
      } catch (e) {}
      currentPty = null;
    }
    mainWindow = null;
  });
}

// IPC Handlers for System PTY Terminal
function setupTerminalIPC() {
  ipcMain.handle("terminal:create", (event, options = {}) => {
    if (!pty) {
      try {
        pty = require("node-pty");
      } catch (err) {
        return { error: "node-pty no está disponible: " + err.message };
      }
    }

    if (currentPty) {
      try {
        currentPty.kill();
      } catch (e) {}
      currentPty = null;
    }

    const defaultShell =
      process.platform === "win32"
        ? "powershell.exe"
        : process.env.SHELL || "/bin/zsh";

    const defaultCwd =
      options.cwd ||
      process.env.TARGET_WORKSPACE_PATH ||
      path.resolve(__dirname, "..");

    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    try {
      currentPty = pty.spawn(defaultShell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: defaultCwd,
        env,
      });

      currentPty.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal:data", data);
        }
      });

      currentPty.onExit(({ exitCode, signal }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal:exit", { exitCode, signal });
        }
        currentPty = null;
      });

      return {
        success: true,
        shell: defaultShell,
        cwd: defaultCwd,
        pid: currentPty.pid,
      };
    } catch (err) {
      console.error("Failed to spawn PTY:", err);
      return { error: err.message };
    }
  });

  ipcMain.on("terminal:write", (event, data) => {
    if (currentPty) {
      currentPty.write(data);
    }
  });

  ipcMain.on("terminal:resize", (event, { cols, rows }) => {
    if (currentPty && cols && rows) {
      try {
        currentPty.resize(cols, rows);
      } catch (e) {}
    }
  });

  ipcMain.on("terminal:kill", () => {
    if (currentPty) {
      try {
        currentPty.kill();
      } catch (e) {}
      currentPty = null;
    }
  });
}

app.whenReady().then(() => {
  setupTerminalIPC();
  setupAlmIPC();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
