import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import { parseAddonLine } from "./addonEvents.js";
import type { AddonFlowEvent } from "./types.js";

type Env = Record<string, string | undefined>;

export type MitmdumpBinaryResolution =
  | { ok: true; path: string; message?: never }
  | { ok: false; message: string; path?: never };

export type ResolveMitmdumpBinaryOptions = {
  env?: Env;
  pathLookup?: (name: string) => string | undefined;
};

export type StartMitmproxyOptions = {
  proxyHost: string;
  proxyPort: number;
  onEvent: (event: AddonFlowEvent) => void;
  onLog: (line: string) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  env?: Env;
  rootDir?: string;
};

export type MitmproxyRuntime = {
  child: ChildProcess;
  stop: () => void;
};

const MITMDUMP_MISSING_MESSAGE =
  "mitmdump was not found. Install mitmproxy with `brew install mitmproxy`, " +
  "or set RELA_CAPTURE_MITMDUMP_BIN to the mitmdump executable path.";

export function resolveMitmdumpBinary(
  options: ResolveMitmdumpBinaryOptions = {}
): MitmdumpBinaryResolution {
  const env = options.env ?? process.env;
  const configuredPath = env.RELA_CAPTURE_MITMDUMP_BIN;
  if (configuredPath) {
    return { ok: true, path: configuredPath };
  }

  const pathLookup = options.pathLookup ?? ((name: string) => lookupPath(name, env));
  const pathResult = pathLookup("mitmdump");
  if (pathResult) {
    return { ok: true, path: pathResult };
  }

  return { ok: false, message: MITMDUMP_MISSING_MESSAGE };
}

export function lookupPath(name: string, env: Env = process.env): string | undefined {
  const pathEnv = env.PATH;
  if (!pathEnv) {
    return undefined;
  }

  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Keep searching PATH entries.
    }
  }

  return undefined;
}

export function startMitmproxy(options: StartMitmproxyOptions): MitmproxyRuntime {
  const env = options.env ?? process.env;
  const resolution = resolveMitmdumpBinary({ env });
  if (!resolution.ok) {
    throw new Error(resolution.message);
  }

  const rootDir =
    options.rootDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const confDir = path.join(rootDir, ".mitmproxy");
  const addonPath = path.join(rootDir, "scripts", "mitm", "capture_addon.py");

  fs.mkdirSync(confDir, { recursive: true });

  const child = spawn(
    resolution.path,
    [
      "--listen-host",
      options.proxyHost,
      "--listen-port",
      String(options.proxyPort),
      "--confdir",
      confDir,
      "-s",
      addonPath
    ],
    {
      cwd: rootDir,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  readLines(child.stdout, (line) => {
    const event = parseAddonLine(line);
    if (event) {
      options.onEvent(event);
      return;
    }

    options.onLog(line);
  });
  readLines(child.stderr, options.onLog);

  child.once("error", (error) => {
    options.onLog(`mitmdump error: ${error.message}`);
  });
  child.once("exit", (code, signal) => {
    options.onExit(code, signal);
  });

  return {
    child,
    stop: () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };
}

function readLines(stream: Readable | null, onLine: (line: string) => void): void {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      onLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  });

  stream.on("end", () => {
    if (buffer) {
      onLine(buffer.replace(/\r$/, ""));
    }
  });
}
