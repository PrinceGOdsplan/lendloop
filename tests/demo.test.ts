import { describe, expect, it } from "vitest";
import { isDemoParams, isDemoSearch } from "../lib/demo";

describe("reviewer demo panel switch", () => {
  it("accepts bare, empty, 1 and true", () => {
    for (const q of ["?demo", "?demo=", "?demo=1", "?demo=true", "?x=1&demo"]) expect(isDemoSearch(q)).toBe(true);
    expect(isDemoParams({ demo: "" })).toBe(true);
    expect(isDemoParams({ demo: "1" })).toBe(true);
    expect(isDemoParams({ demo: ["true"] })).toBe(true);
  });

  it("stays off without the parameter or when switched off", () => {
    for (const q of ["", "?", "?x=1", "?demo=0", "?demo=false", "?demonstration=1"])
      expect(isDemoSearch(q)).toBe(false);
    expect(isDemoParams({})).toBe(false);
    expect(isDemoParams({ demo: "0" })).toBe(false);
  });
});
