import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { FlowStore } from "../flowStore.js";
import { RuleStore } from "../ruleStore.js";
import { createApp } from "../app.js";

describe("What's New API", () => {
  let app: Express;
  let store: FlowStore;
  let ruleStore: RuleStore;

  beforeEach(() => {
    store = new FlowStore({ maxFlows: 100, bodyPreviewBytes: 1024 });
    ruleStore = new RuleStore();
    app = createApp({
      store,
      ruleStore,
      lanAddresses: [{ interfaceName: "eth0", address: "192.168.1.100" }],
      dashboardPort: 3000
    });
  });

  afterEach(() => {
    store.clear();
  });

  describe("GET /api/status", () => {
    it("includes version field", async () => {
      const response = await request(app).get("/api/status");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("version");
      expect(typeof response.body.version).toBe("string");
    });
  });

  describe("GET /api/whats-new", () => {
    it("returns whats new entries", async () => {
      const response = await request(app).get("/api/whats-new");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("entries");
      expect(Array.isArray(response.body.entries)).toBe(true);
    });

    it("entries have required fields", async () => {
      const response = await request(app).get("/api/whats-new");
      const entries = response.body.entries;

      if (entries.length > 0) {
        const entry = entries[0];
        expect(entry).toHaveProperty("version");
        expect(entry).toHaveProperty("title");
        expect(entry).toHaveProperty("publishedAt");
        expect(entry).toHaveProperty("showModal");
        expect(entry).toHaveProperty("body");
        expect(Array.isArray(entry.body)).toBe(true);
      }
    });
  });
});
