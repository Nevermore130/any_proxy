import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RequestRule } from "./types.js";

export type RuleStoreOptions = {
  persistPath?: string;
};

export class RuleStore {
  private readonly rules = new Map<string, RequestRule>();
  private readonly persistPath?: string;

  constructor(options: RuleStoreOptions = {}) {
    this.persistPath = options.persistPath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) {
      return;
    }

    try {
      const content = readFileSync(this.persistPath, "utf8");
      const data = JSON.parse(content) as { rules: RequestRule[] };
      if (Array.isArray(data.rules)) {
        for (const rule of data.rules) {
          this.rules.set(rule.id, rule);
        }
      }
    } catch (error) {
      console.error(`Failed to load rules from ${this.persistPath}:`, error);
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

      const data = { rules: Array.from(this.rules.values()) };
      writeFileSync(this.persistPath, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
      console.error(`Failed to save rules to ${this.persistPath}:`, error);
    }
  }

  create(input: Omit<RequestRule, "id" | "createdAt" | "updatedAt">): RequestRule {
    const now = new Date().toISOString();
    const rule: RequestRule = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };

    this.rules.set(rule.id, rule);
    this.saveToDisk();
    return rule;
  }

  update(id: string, updates: Partial<Omit<RequestRule, "id" | "createdAt" | "updatedAt">>): RequestRule | undefined {
    const existing = this.rules.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: RequestRule = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      match: {
        ...existing.match,
        ...(updates.match ?? {})
      },
      actions: {
        ...existing.actions,
        ...(updates.actions ?? {})
      }
    };

    this.rules.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  get(id: string): RequestRule | undefined {
    return this.rules.get(id);
  }

  list(): RequestRule[] {
    return Array.from(this.rules.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  findMatchingRule(
    method: string,
    path: string,
    originalHost?: string
  ): RequestRule | undefined {
    const enabledRules = this.list().filter((rule) => rule.enabled);

    for (const rule of enabledRules) {
      if (this.ruleMatches(rule, method, path, originalHost)) {
        return rule;
      }
    }

    return undefined;
  }

  private ruleMatches(
    rule: RequestRule,
    method: string,
    path: string,
    originalHost?: string
  ): boolean {
    if (rule.match.method && rule.match.method !== "ANY" && rule.match.method !== method) {
      return false;
    }

    if (rule.match.pathMatch) {
      const matched = this.pathMatches(rule.match.pathMatch, rule.match.pathMatchType, path);
      if (!matched) {
        return false;
      }
    }

    if (rule.match.originalHost && rule.match.originalHost !== originalHost) {
      return false;
    }

    return true;
  }

  private pathMatches(pattern: string, matchType: "prefix" | "glob", path: string): boolean {
    if (matchType === "prefix") {
      return path.startsWith(pattern);
    }

    return this.globMatch(pattern, path);
  }

  private globMatch(pattern: string, str: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }
}
