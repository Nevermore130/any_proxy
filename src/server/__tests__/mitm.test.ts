import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os, { type NetworkInterfaceInfo } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADDON_EVENT_PREFIX } from "../addonEvents.js";
import { getLanAddresses } from "../lan.js";
import { resolveMitmdumpBinary, startMitmproxy } from "../mitm.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

const spawnMock = vi.mocked(spawn);

describe("resolveMitmdumpBinary", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses RELA_CAPTURE_MITMDUMP_BIN first", () => {
    const result = resolveMitmdumpBinary({
      env: { RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump" },
      pathLookup: () => undefined
    });
    expect(result).toEqual({ ok: true, path: "/custom/mitmdump" });
  });

  it("uses PATH lookup when env is empty", () => {
    const result = resolveMitmdumpBinary({
      env: {},
      pathLookup: (name) => (name === "mitmdump" ? "/usr/local/bin/mitmdump" : undefined)
    });
    expect(result).toEqual({ ok: true, path: "/usr/local/bin/mitmdump" });
  });

  it("returns install guidance when missing", () => {
    const result = resolveMitmdumpBinary({ env: {}, pathLookup: () => undefined });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("mitmdump was not found");
    expect(result.message).toContain("brew install mitmproxy");
    expect(result.message).toContain("pipx install mitmproxy");
  });

  it("accepts environment overrides without replacing the whole process env", () => {
    const result = resolveMitmdumpBinary({
      envOverrides: { RELA_CAPTURE_MITMDUMP_BIN: "/override/mitmdump" },
      pathLookup: () => undefined
    });

    expect(result).toEqual({ ok: true, path: "/override/mitmdump" });
  });
});

describe("startMitmproxy", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns mitmdump with listen settings, local confdir, addon script, cwd, and env", () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);
    const rootDir = createTempRootDir();

    startMitmproxy({
      proxyHost: "127.0.0.1",
      proxyPort: 8088,
      rootDir,
      envOverrides: {
        RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump",
        RELA_CAPTURE_TEST_FLAG: "1"
      },
      onEvent: vi.fn(),
      onLog: vi.fn(),
      onExit: vi.fn()
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [binary, args, options] = spawnMock.mock.calls[0];
    expect(binary).toBe("/custom/mitmdump");
    expect(args).toEqual([
      "--listen-host",
      "127.0.0.1",
      "--listen-port",
      "8088",
      "--set",
      `confdir=${path.join(rootDir, ".mitmproxy")}`,
      "--set",
      "block_global=true",
      "-s",
      path.join(rootDir, "scripts", "mitm", "capture_addon.py")
    ]);
    expect(options?.cwd).toBe(rootDir);
    expect(options?.env).toMatchObject({
      PATH: process.env.PATH,
      RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump",
      RELA_CAPTURE_TEST_FLAG: "1"
    });
    expect(options?.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  it("can allow public proxy clients when requested", () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);

    startMitmproxy({
      proxyHost: "0.0.0.0",
      proxyPort: 8088,
      rootDir: createTempRootDir(),
      blockGlobal: false,
      envOverrides: { RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump" },
      onEvent: vi.fn(),
      onLog: vi.fn(),
      onExit: vi.fn()
    });

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain("block_global=false");
  });

  it("routes parsed stdout events to onEvent and normal stdout or stderr to onLog", () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);
    const onEvent = vi.fn();
    const onLog = vi.fn();

    startMitmproxy({
      proxyHost: "0.0.0.0",
      proxyPort: 8088,
      rootDir: createTempRootDir(),
      envOverrides: { RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump" },
      onEvent,
      onLog,
      onExit: vi.fn()
    });

    child.stdout.write("proxy listening\n");
    child.stdout.write(`${ADDON_EVENT_PREFIX}${JSON.stringify(validAddonPayload())}\n`);
    child.stderr.write("stderr warning\n");

    expect(onLog).toHaveBeenCalledWith("proxy listening");
    expect(onLog).toHaveBeenCalledWith("stderr warning");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].flow.host).toBe("api.example.com");
  });

  it("reports spawn errors as terminal once even if close follows", () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);
    const onLog = vi.fn();
    const onExit = vi.fn();

    startMitmproxy({
      proxyHost: "0.0.0.0",
      proxyPort: 8088,
      rootDir: createTempRootDir(),
      envOverrides: { RELA_CAPTURE_MITMDUMP_BIN: "/bad/mitmdump" },
      onEvent: vi.fn(),
      onLog,
      onExit
    });

    child.emit("error", new Error("spawn ENOENT"));
    child.emit("close", 1, null);
    child.emit("exit", 1, null);

    expect(onLog).toHaveBeenCalledWith("mitmdump error: spawn ENOENT");
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(null, null);
  });

  it("reports close as terminal when exit is not emitted", () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);
    const onExit = vi.fn();

    startMitmproxy({
      proxyHost: "0.0.0.0",
      proxyPort: 8088,
      rootDir: createTempRootDir(),
      envOverrides: { RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump" },
      onEvent: vi.fn(),
      onLog: vi.fn(),
      onExit
    });

    child.emit("close", 2, "SIGTERM");

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(2, "SIGTERM");
  });
});

describe("getLanAddresses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps non-internal IPv4 addresses but orders private addresses first and link-local last", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      bridge100: [ipv4("169.254.1.10")],
      utun4: [ipv4("10.8.0.2")],
      en0: [ipv4("192.168.1.23")],
      eth0: [ipv4("203.0.113.8")],
      lo0: [ipv4("127.0.0.1", true)]
    });

    expect(getLanAddresses()).toEqual([
      { interfaceName: "en0", address: "192.168.1.23" },
      { interfaceName: "utun4", address: "10.8.0.2" },
      { interfaceName: "eth0", address: "203.0.113.8" },
      { interfaceName: "bridge100", address: "169.254.1.10" }
    ]);
  });
});

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

function createTempRootDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rela-capture-mitm-test-"));
}

function validAddonPayload(): unknown {
  return {
    eventType: "request",
    flow: {
      id: "flow-1",
      clientIp: "192.168.1.20",
      startedAtEpochMs: 1781337600000,
      protocol: "https",
      method: "GET",
      scheme: "https",
      host: "api.example.com",
      path: "/v1/me",
      requestHeaders: [],
      isTlsIntercepted: true
    }
  };
}

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`
  };
}
