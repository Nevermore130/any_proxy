import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureSessionHeaderName } from "./session.js";
import { DEFAULT_RELA_RELAY_TARGET_HOSTS, relayOriginalHostHeaderName } from "./relay.js";

export type CaptureProject = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  relayPath: string;
  targetOrigin: string;
  allowedHosts: string[];
  sessionHeaderName: string;
  originalHostHeaderName: string;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CaptureProjectInput = {
  name?: unknown;
  type?: unknown;
  enabled?: unknown;
  relayPath?: unknown;
  targetOrigin?: unknown;
  allowedHosts?: unknown;
  sessionHeaderName?: unknown;
  originalHostHeaderName?: unknown;
};

export type ProjectStoreOptions = {
  persistPath?: string;
  defaultAllowedHosts?: readonly string[];
  defaultTargetOrigin?: string;
};

const defaultProjectId = "rela";
const defaultProjectType = "rela_capture_session";
const defaultProjectName = "热拉";
const defaultRelayPath = "/relay/rela";

export class ProjectStore {
  private readonly projects = new Map<string, CaptureProject>();
  private readonly persistPath?: string;

  constructor(private readonly options: ProjectStoreOptions = {}) {
    this.persistPath = options.persistPath;
    this.seedDefaultProject();
    this.loadFromDisk();
  }

  list(): CaptureProject[] {
    return Array.from(this.projects.values()).sort((a, b) => {
      if (a.id === defaultProjectId) return -1;
      if (b.id === defaultProjectId) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  get(id: string): CaptureProject | undefined {
    return this.projects.get(id);
  }

  getDefault(): CaptureProject {
    return this.projects.get(defaultProjectId) ?? this.seedDefaultProject();
  }

  findByRelayPath(pathname: string): CaptureProject | undefined {
    let normalizedPath: string;
    try {
      normalizedPath = normalizeRelayPath(pathname);
    } catch {
      return undefined;
    }
    return this.list()
      .filter((project) => project.enabled)
      .sort((a, b) => b.relayPath.length - a.relayPath.length)
      .find(
        (project) =>
          normalizedPath === project.relayPath ||
          normalizedPath.startsWith(`${project.relayPath}/`)
      );
  }

  create(input: CaptureProjectInput): CaptureProject {
    const now = new Date().toISOString();
    const name = stringValue(input.name, "Project name");
    const type = projectTypeValue(input.type);
    const relayPath = relayPathValue(input.relayPath, type);
    const targetOrigin = targetOriginValue(input.targetOrigin, this.options.defaultTargetOrigin);
    const allowedHosts = allowedHostsValue(input.allowedHosts, this.options.defaultAllowedHosts);
    const sessionHeaderName = headerNameValue(
      input.sessionHeaderName,
      captureSessionHeaderName
    );
    const originalHostHeaderName = headerNameValue(
      input.originalHostHeaderName,
      relayOriginalHostHeaderName
    );

    this.assertUniqueType(type);
    this.assertUniqueRelayPath(relayPath);

    const project: CaptureProject = {
      id: randomUUID(),
      name,
      type,
      enabled: booleanValue(input.enabled, true),
      relayPath,
      targetOrigin,
      allowedHosts,
      sessionHeaderName,
      originalHostHeaderName,
      builtIn: false,
      createdAt: now,
      updatedAt: now
    };

    this.projects.set(project.id, project);
    this.saveToDisk();
    return project;
  }

  update(id: string, input: CaptureProjectInput): CaptureProject | undefined {
    const existing = this.projects.get(id);
    if (!existing) {
      return undefined;
    }

    const type =
      existing.builtIn || input.type === undefined
        ? existing.type
        : projectTypeValue(input.type);
    const relayPath =
      existing.builtIn || input.relayPath === undefined
        ? existing.relayPath
        : relayPathValue(input.relayPath, type);
    const targetOrigin =
      input.targetOrigin === undefined
        ? existing.targetOrigin
        : targetOriginValue(input.targetOrigin, this.options.defaultTargetOrigin);
    const allowedHosts =
      input.allowedHosts === undefined
        ? existing.allowedHosts
        : allowedHostsValue(input.allowedHosts, this.options.defaultAllowedHosts);

    this.assertUniqueType(type, id);
    this.assertUniqueRelayPath(relayPath, id);

    const updated: CaptureProject = {
      ...existing,
      name: input.name === undefined ? existing.name : stringValue(input.name, "Project name"),
      type,
      enabled: booleanValue(input.enabled, existing.enabled),
      relayPath,
      targetOrigin,
      allowedHosts,
      sessionHeaderName:
        input.sessionHeaderName === undefined
          ? existing.sessionHeaderName
          : headerNameValue(input.sessionHeaderName, captureSessionHeaderName),
      originalHostHeaderName:
        input.originalHostHeaderName === undefined
          ? existing.originalHostHeaderName
          : headerNameValue(input.originalHostHeaderName, relayOriginalHostHeaderName),
      updatedAt: new Date().toISOString()
    };

    this.projects.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  delete(id: string): boolean {
    const project = this.projects.get(id);
    if (!project || project.builtIn) {
      return false;
    }

    const deleted = this.projects.delete(id);
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  private seedDefaultProject(): CaptureProject {
    const now = new Date().toISOString();
    const project: CaptureProject = {
      id: defaultProjectId,
      name: defaultProjectName,
      type: defaultProjectType,
      enabled: true,
      relayPath: defaultRelayPath,
      targetOrigin: normalizeTargetOrigin(
        this.options.defaultTargetOrigin ?? "https://api.rela.me"
      ),
      allowedHosts: normalizeAllowedHosts(
        this.options.defaultAllowedHosts ?? DEFAULT_RELA_RELAY_TARGET_HOSTS
      ),
      sessionHeaderName: captureSessionHeaderName,
      originalHostHeaderName: relayOriginalHostHeaderName,
      builtIn: true,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(project.id, project);
    return project;
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) {
      return;
    }

    try {
      const content = readFileSync(this.persistPath, "utf8");
      const data = JSON.parse(content) as { projects?: CaptureProject[] };
      for (const project of data.projects ?? []) {
        this.projects.set(project.id, normalizeStoredProject(project));
      }
    } catch (error) {
      console.error(`Failed to load projects from ${this.persistPath}:`, error);
    }
  }

  private saveToDisk(): void {
    if (!this.persistPath) {
      return;
    }

    try {
      const dir = path.dirname(this.persistPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(
        this.persistPath,
        JSON.stringify({ projects: this.list() }, null, 2),
        "utf8"
      );
    } catch (error) {
      console.error(`Failed to save projects to ${this.persistPath}:`, error);
    }
  }

  private assertUniqueType(type: string, currentId?: string): void {
    for (const project of this.projects.values()) {
      if (project.id !== currentId && project.type === type) {
        throw new Error(`Project type already exists: ${type}`);
      }
    }
  }

  private assertUniqueRelayPath(relayPath: string, currentId?: string): void {
    for (const project of this.projects.values()) {
      if (project.id !== currentId && project.relayPath === relayPath) {
        throw new Error(`Relay path already exists: ${relayPath}`);
      }
    }
  }
}

function normalizeStoredProject(project: CaptureProject): CaptureProject {
  const isDefaultProject = project.id === defaultProjectId;
  return {
    ...project,
    name: stringValue(project.name, "Project name"),
    type: isDefaultProject ? defaultProjectType : projectTypeValue(project.type),
    enabled: Boolean(project.enabled),
    relayPath: isDefaultProject ? defaultRelayPath : normalizeRelayPath(project.relayPath),
    targetOrigin: normalizeTargetOrigin(project.targetOrigin),
    allowedHosts: normalizeAllowedHosts(project.allowedHosts),
    sessionHeaderName: headerNameValue(project.sessionHeaderName, captureSessionHeaderName),
    originalHostHeaderName: headerNameValue(
      project.originalHostHeaderName,
      relayOriginalHostHeaderName
    ),
    builtIn: isDefaultProject || Boolean(project.builtIn),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || project.createdAt || new Date().toISOString()
  };
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function projectTypeValue(value: unknown): string {
  const type = stringValue(value, "Project type");
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(type)) {
    throw new Error("Project type must start with a letter and contain only letters, numbers, _ or -");
  }
  return type;
}

function relayPathValue(value: unknown, type: string): string {
  if (value === undefined || value === null || value === "") {
    return `/relay/${slugFromType(type)}`;
  }
  return normalizeRelayPath(stringValue(value, "Relay path"));
}

function normalizeRelayPath(value: string): string {
  const normalized = value.trim().replace(/\/+$/g, "");
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  if (!/^\/relay\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(withSlash)) {
    throw new Error("Relay path must look like /relay/project");
  }
  return withSlash;
}

function targetOriginValue(value: unknown, fallback: string | undefined): string {
  if (value === undefined || value === null || value === "") {
    return normalizeTargetOrigin(fallback ?? "https://api.rela.me");
  }
  return normalizeTargetOrigin(stringValue(value, "Target origin"));
}

function normalizeTargetOrigin(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Target origin must use http or https");
  }
  return parsed.origin;
}

function allowedHostsValue(
  value: unknown,
  fallback: readonly string[] | undefined
): string[] {
  if (value === undefined || value === null || value === "") {
    return normalizeAllowedHosts(fallback ?? []);
  }
  if (Array.isArray(value)) {
    return normalizeAllowedHosts(value.map((item) => String(item)));
  }
  if (typeof value === "string") {
    return normalizeAllowedHosts(value.split(/[\n,]/g));
  }
  throw new Error("Allowed hosts must be a list or comma separated string");
}

function normalizeAllowedHosts(hosts: readonly string[]): string[] {
  return Array.from(
    new Set(
      hosts
        .map((host) => normalizedHostname(host))
        .filter((host): host is string => Boolean(host))
    )
  );
}

function normalizedHostname(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(`http://${trimmed}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function headerNameValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = stringValue(value, "Header name");
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(normalized)) {
    throw new Error("Header name is invalid");
  }
  return normalized;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function slugFromType(type: string): string {
  return (
    type
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}
