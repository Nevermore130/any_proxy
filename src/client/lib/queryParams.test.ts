import { describe, expect, it } from "vitest";
import type { BodyPreview } from "../types.js";
import {
  defaultRequestPaneTab,
  isFormUrlEncodedBody,
  isQueryEchoedAsBody,
  looksLikeFormUrlEncoded,
  parseQueryString,
  queryStringFromFlow,
  queryStringFromUrl,
  shouldHideRequestBody
} from "./queryParams.js";

describe("queryStringFromUrl", () => {
  it("extracts the raw query without a leading question mark", () => {
    expect(
      queryStringFromUrl(
        "https://api.rela.me/v3/users/info?userIds=1%2C2&customSortType=ai&lat=39.9"
      )
    ).toBe("userIds=1%2C2&customSortType=ai&lat=39.9");
    expect(queryStringFromUrl("/v3/users/info?userIds=1&lat=2#top")).toBe("userIds=1&lat=2");
    expect(queryStringFromUrl("/v3/users/info")).toBe("");
    expect(queryStringFromUrl(undefined)).toBe("");
  });
});

describe("queryStringFromFlow", () => {
  it("reads the captured path search string", () => {
    expect(queryStringFromFlow({ path: "/v3/users/info?userIds=1&customSortType=ai" })).toBe(
      "userIds=1&customSortType=ai"
    );
    expect(queryStringFromFlow({ path: "/v3/users/info" })).toBe("");
  });
});

describe("parseQueryString", () => {
  it("decodes values for display and keeps raw encoding", () => {
    expect(parseQueryString("userIds=1%2C2&customSortType=ai+rank&empty=&flag")).toEqual([
      { key: "userIds", rawKey: "userIds", rawValue: "1%2C2", value: "1,2" },
      { key: "customSortType", rawKey: "customSortType", rawValue: "ai+rank", value: "ai rank" },
      { key: "empty", rawKey: "empty", rawValue: "", value: "" },
      { key: "flag", rawKey: "flag", rawValue: "", value: "" }
    ]);
  });

  it("keeps duplicate keys as separate rows and skips empty segments", () => {
    expect(parseQueryString("?tag=a&tag=b&&")).toEqual([
      { key: "tag", rawKey: "tag", rawValue: "a", value: "a" },
      { key: "tag", rawKey: "tag", rawValue: "b", value: "b" }
    ]);
  });

  it("falls back to the raw component when decoding fails", () => {
    expect(parseQueryString("q=%E0%A4%A")).toEqual([
      { key: "q", rawKey: "q", rawValue: "%E0%A4%A", value: "%E0%A4%A" }
    ]);
  });

  it("returns an empty list when there is no query string", () => {
    expect(parseQueryString("")).toEqual([]);
    expect(parseQueryString("?")).toEqual([]);
    expect(parseQueryString(undefined)).toEqual([]);
  });
});

describe("isFormUrlEncodedBody", () => {
  it("treats application/x-www-form-urlencoded content as form fields", () => {
    expect(
      isFormUrlEncodedBody({
        kind: "text",
        contentType: "application/x-www-form-urlencoded; charset=UTF-8",
        preview: "name=rela&ok=1"
      })
    ).toBe(true);
  });

  it("detects form-looking text bodies without a content type", () => {
    expect(
      isFormUrlEncodedBody({
        kind: "text",
        preview: "userIds=1%2C2&lat=39.9&lng=116.4"
      })
    ).toBe(true);
    expect(looksLikeFormUrlEncoded("token=abc&redirect=https%3A%2F%2Fex.com%2Fcb")).toBe(true);
  });

  it("does not classify JSON, markup, or plain sentences as form fields", () => {
    const jsonBody: BodyPreview = {
      kind: "text",
      contentType: "application/json",
      preview: "{\"hello\":\"relay\"}"
    };
    expect(isFormUrlEncodedBody(jsonBody)).toBe(false);
    expect(looksLikeFormUrlEncoded("<xml>a=1</xml>")).toBe(false);
    expect(looksLikeFormUrlEncoded("just a sentence")).toBe(false);
    expect(isFormUrlEncodedBody({ kind: "empty" })).toBe(false);
  });
});

describe("request body classification", () => {
  it("hides GET/HEAD bodies that are empty or echo the query string", () => {
    const query = "userIds=1&lat=39.9";
    expect(shouldHideRequestBody("GET", { kind: "empty" }, query)).toBe(true);
    expect(
      shouldHideRequestBody("GET", { kind: "text", preview: query }, query)
    ).toBe(true);
    expect(
      shouldHideRequestBody("HEAD", { kind: "text", preview: `?${query}` }, query)
    ).toBe(true);
    expect(isQueryEchoedAsBody("GET", query, query)).toBe(true);
  });

  it("keeps a real GET body that is not the query string", () => {
    expect(
      shouldHideRequestBody(
        "GET",
        { kind: "text", preview: "{\"probe\":true}" },
        "userIds=1"
      )
    ).toBe(false);
    expect(isQueryEchoedAsBody("POST", "userIds=1", "userIds=1")).toBe(false);
  });

  it("defaults to Params when the URL has query params", () => {
    expect(defaultRequestPaneTab(4)).toBe("params");
    expect(defaultRequestPaneTab(0)).toBe("headers");
  });
});
