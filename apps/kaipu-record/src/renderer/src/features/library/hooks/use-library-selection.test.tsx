import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLibrarySelection } from "./use-library-selection";

const items = ["a", "b", "c", "d", "e"].map((assetId) => ({ assetId, ok: assetId !== "c" }));
const canSelect = (item: { ok: boolean }) => item.ok;

describe("useLibrarySelection", () => {
  it("toggles one item per click", () => {
    const { result } = renderHook(() => useLibrarySelection(items, "", canSelect));
    act(() => result.current.toggle("b", false));
    act(() => result.current.toggle("d", false));
    expect(result.current.selected.map((i) => i.assetId)).toEqual(["b", "d"]);
    act(() => result.current.toggle("b", false));
    expect(result.current.selected.map((i) => i.assetId)).toEqual(["d"]);
  });

  it("shift-click selects the range in the order on screen, skipping items that cannot move", () => {
    const { result, rerender } = renderHook(
      ({ list }) => useLibrarySelection(list, "", canSelect),
      { initialProps: { list: items } },
    );
    act(() => result.current.toggle("a", false));
    act(() => result.current.toggle("e", true));
    expect(result.current.selected.map((i) => i.assetId)).toEqual(["a", "b", "d", "e"]);

    // Another order on screen (a different sort): the range follows what is shown.
    const reversed = [...items].reverse();
    rerender({ list: reversed });
    act(() => result.current.clear());
    act(() => result.current.toggle("e", false));
    act(() => result.current.toggle("b", true));
    expect(result.current.selected.map((i) => i.assetId)).toEqual(["e", "d", "b"]);
  });

  it("clears when the search, a chip or the sort changes", () => {
    const { result, rerender } = renderHook(
      ({ key }) => useLibrarySelection(items, key, canSelect),
      { initialProps: { key: "all" } },
    );
    act(() => result.current.toggle("a", false));
    rerender({ key: "recordings" });
    expect(result.current.selected).toEqual([]);
  });

  it("keeps only the items still listed, and can check exactly those that stayed", () => {
    const { result, rerender } = renderHook(
      ({ list }) => useLibrarySelection(list, "", canSelect),
      { initialProps: { list: items } },
    );
    act(() => result.current.replace(["a", "b"]));
    rerender({ list: items.filter((i) => i.assetId !== "a") });
    expect(result.current.selected.map((i) => i.assetId)).toEqual(["b"]);
  });
});
