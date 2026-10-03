import { expect, it } from "vitest";
import { allRows } from "../src/lib/pagination";

it("loads beyond the Supabase row limit without truncating future bookings", async () => {
  const rows = Array.from({ length: 1051 }, (_, id) => ({ id }));
  const loaded = await allRows((from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }));
  expect(loaded).toEqual(rows);
});
it("surfaces a failed subsequent page rather than returning partial calendar data", async () => {
  await expect(allRows((from) => Promise.resolve(from === 0
    ? { data: [1, 2], error: null } : { data: null, error: { message: "Disconnected" } }), 2)).rejects.toThrow("Disconnected");
});
