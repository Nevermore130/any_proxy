import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuleStore } from "../ruleStore.js";

const testDataDir = path.join(process.cwd(), "test-data");
const testRulesFile = path.join(testDataDir, "test-rules.json");

beforeEach(() => {
  if (!existsSync(testDataDir)) {
    mkdirSync(testDataDir, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true, force: true });
  }
});

describe("RuleStore", () => {
  it("creates a rule with auto-generated id and timestamps", () => {
    const store = new RuleStore();
    const rule = store.create({
      name: "Test Rule",
      enabled: true,
      match: {
        method: "GET",
        pathMatch: "/v1/me",
        pathMatchType: "prefix"
      },
      actions: {
        delayMs: 1000,
        mockMode: false
      }
    });

    expect(rule.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rule.name).toBe("Test Rule");
    expect(rule.createdAt).toBeTruthy();
    expect(rule.updatedAt).toBeTruthy();
  });

  it("lists rules sorted by creation time (newest first)", async () => {
    const store = new RuleStore();
    const rule1 = store.create({
      name: "First",
      enabled: true,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const rule2 = store.create({
      name: "Second",
      enabled: true,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    const rules = store.list();
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe(rule2.id);
    expect(rules[1].id).toBe(rule1.id);
  });

  it("updates a rule and changes updatedAt timestamp", async () => {
    const store = new RuleStore();
    const rule = store.create({
      name: "Original",
      enabled: true,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = store.update(rule.id, { name: "Updated", enabled: false });

    expect(updated).toBeTruthy();
    expect(updated!.name).toBe("Updated");
    expect(updated!.enabled).toBe(false);
    expect(updated!.createdAt).toBe(rule.createdAt);
    expect(updated!.updatedAt).not.toBe(rule.updatedAt);
  });

  it("deletes a rule", () => {
    const store = new RuleStore();
    const rule = store.create({
      name: "To Delete",
      enabled: true,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.delete(rule.id)).toBe(true);
    expect(store.get(rule.id)).toBeUndefined();
    expect(store.delete(rule.id)).toBe(false);
  });

  it("matches rules by method", () => {
    const store = new RuleStore();
    store.create({
      name: "GET only",
      enabled: true,
      match: { method: "GET", pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.findMatchingRule("GET", "/any", undefined)).toBeTruthy();
    expect(store.findMatchingRule("POST", "/any", undefined)).toBeUndefined();
  });

  it("matches rules with ANY method", () => {
    const store = new RuleStore();
    store.create({
      name: "Any method",
      enabled: true,
      match: { method: "ANY", pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.findMatchingRule("GET", "/any", undefined)).toBeTruthy();
    expect(store.findMatchingRule("POST", "/any", undefined)).toBeTruthy();
    expect(store.findMatchingRule("DELETE", "/any", undefined)).toBeTruthy();
  });

  it("matches rules by path prefix", () => {
    const store = new RuleStore();
    store.create({
      name: "v1 prefix",
      enabled: true,
      match: { pathMatch: "/v1/", pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.findMatchingRule("GET", "/v1/me", undefined)).toBeTruthy();
    expect(store.findMatchingRule("GET", "/v1/profile", undefined)).toBeTruthy();
    expect(store.findMatchingRule("GET", "/v2/me", undefined)).toBeUndefined();
  });

  it("matches rules by glob pattern", () => {
    const store = new RuleStore();
    store.create({
      name: "Glob pattern",
      enabled: true,
      match: { pathMatch: "/v1/*/detail", pathMatchType: "glob" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.findMatchingRule("GET", "/v1/user/detail", undefined)).toBeTruthy();
    expect(store.findMatchingRule("GET", "/v1/post/detail", undefined)).toBeTruthy();
    expect(store.findMatchingRule("GET", "/v1/user/list", undefined)).toBeUndefined();
  });

  it("matches rules by original host", () => {
    const store = new RuleStore();
    store.create({
      name: "Specific host",
      enabled: true,
      match: { originalHost: "test-api.rela.me", pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.findMatchingRule("GET", "/v1/me", "test-api.rela.me")).toBeTruthy();
    expect(store.findMatchingRule("GET", "/v1/me", "api.rela.me")).toBeUndefined();
    expect(store.findMatchingRule("GET", "/v1/me", undefined)).toBeUndefined();
  });

  it("returns first matching enabled rule", () => {
    const store = new RuleStore();
    const rule1 = store.create({
      name: "First match",
      enabled: true,
      match: { pathMatch: "/v1/", pathMatchType: "prefix" },
      actions: { delayMs: 1000, mockMode: false }
    });

    store.create({
      name: "Second match",
      enabled: true,
      match: { pathMatch: "/v1/", pathMatchType: "prefix" },
      actions: { delayMs: 2000, mockMode: false }
    });

    const matched = store.findMatchingRule("GET", "/v1/me", undefined);
    expect(matched!.id).toBe(rule1.id);
  });

  it("skips disabled rules", () => {
    const store = new RuleStore();
    store.create({
      name: "Disabled",
      enabled: false,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(store.findMatchingRule("GET", "/any", undefined)).toBeUndefined();
  });

  it("persists rules to disk", () => {
    const store = new RuleStore({ persistPath: testRulesFile });
    store.create({
      name: "Persisted",
      enabled: true,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    expect(existsSync(testRulesFile)).toBe(true);
    const content = readFileSync(testRulesFile, "utf8");
    const data = JSON.parse(content);
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0].name).toBe("Persisted");
  });

  it("loads rules from disk on initialization", () => {
    const initialStore = new RuleStore({ persistPath: testRulesFile });
    const rule = initialStore.create({
      name: "To Load",
      enabled: true,
      match: { pathMatchType: "prefix" },
      actions: { delayMs: 0, mockMode: false }
    });

    const loadedStore = new RuleStore({ persistPath: testRulesFile });
    const loaded = loadedStore.get(rule.id);
    expect(loaded).toBeTruthy();
    expect(loaded!.name).toBe("To Load");
  });

  it("handles missing persist file gracefully", () => {
    const store = new RuleStore({ persistPath: "/nonexistent/rules.json" });
    expect(store.list()).toHaveLength(0);
  });

  it("handles corrupted persist file gracefully", () => {
    writeFileSync(testRulesFile, "not json", "utf8");
    const store = new RuleStore({ persistPath: testRulesFile });
    expect(store.list()).toHaveLength(0);
  });
});
