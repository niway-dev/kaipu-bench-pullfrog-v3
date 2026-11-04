import { describe, expect, it } from "vitest";
import { uiArea } from "./ui-area";

describe("uiArea", () => {
  it("returns the data attribute the catalog locates areas by", () => {
    expect(uiArea("record.mic")).toEqual({ "data-ui-area": "record.mic" });
  });
});
