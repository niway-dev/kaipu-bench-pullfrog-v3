import { describe, expect, it } from "vitest";
import {
  newWorkspaceFolderName,
  normalizeWorkspaceName,
  validateWorkspaceName,
  WORKSPACE_FOLDER_PREFIX,
  WORKSPACE_NAME_MAX_LENGTH,
} from "./workspace-name";

describe("normalizeWorkspaceName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeWorkspaceName("  Client   Acme ")).toBe("Client Acme");
  });

  it("refuses nothing-left and control characters", () => {
    expect(normalizeWorkspaceName("   ")).toBeNull();
    expect(normalizeWorkspaceName("bad\u0007bell")).toBeNull();
    expect(normalizeWorkspaceName(42)).toBeNull();
  });

  it("cuts a name at the maximum length", () => {
    expect(normalizeWorkspaceName("x".repeat(200))).toHaveLength(WORKSPACE_NAME_MAX_LENGTH);
  });
});

describe("validateWorkspaceName", () => {
  const taken = [
    { id: "a", name: "Default workspace" },
    { id: "b", name: "Client Acme" },
  ];

  it("accepts a free name, trimmed", () => {
    expect(validateWorkspaceName("  Personal ", taken)).toEqual({ ok: true, name: "Personal" });
  });

  it("refuses an empty name", () => {
    expect(validateWorkspaceName("   ", taken)).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a name already in use, ignoring case and spacing", () => {
    expect(validateWorkspaceName("client   ACME", taken)).toEqual({ ok: false, reason: "taken" });
  });

  it("lets a workspace keep its own name when it is the one being edited", () => {
    expect(validateWorkspaceName("Client Acme", taken, "b")).toEqual({
      ok: true,
      name: "Client Acme",
    });
    expect(validateWorkspaceName("Default workspace", taken, "b")).toEqual({
      ok: false,
      reason: "taken",
    });
  });

  it("refuses a name that would be cut short into one already in use", () => {
    const long = "y".repeat(WORKSPACE_NAME_MAX_LENGTH);
    expect(validateWorkspaceName(`${long}zzz`, [{ id: "c", name: long }])).toEqual({
      ok: false,
      reason: "taken",
    });
  });
});

describe("newWorkspaceFolderName", () => {
  it("is 'Kaipu Record — <name>'", () => {
    expect(WORKSPACE_FOLDER_PREFIX).toBe("Kaipu Record — ");
    expect(newWorkspaceFolderName("Work")).toBe("Kaipu Record — Work");
  });

  it("replaces what no file system accepts in a folder name", () => {
    expect(newWorkspaceFolderName('Acme/Q3: "plan"?')).toBe("Kaipu Record — Acme-Q3- -plan-");
  });

  it("never ends with a dot or a space (Windows refuses those)", () => {
    expect(newWorkspaceFolderName("Work. ")).toBe("Kaipu Record — Work");
  });

  it("never ends in the prefix's own space, whatever the name is made of", () => {
    expect(newWorkspaceFolderName("...")).toBe("Kaipu Record — workspace");
    expect(newWorkspaceFolderName("?")).toBe("Kaipu Record — -");
    expect(newWorkspaceFolderName("?").endsWith(" ")).toBe(false);
  });
});
