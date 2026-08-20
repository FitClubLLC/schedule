import assert from "node:assert/strict";
import test from "node:test";
import { getHomeUpcomingState } from "./homePresentation.ts";

test("Home keeps upcoming appointment failures separate from an empty rest-day state", () => {
  assert.equal(
    getHomeUpcomingState({ isLoading: true, isError: false }),
    "loading",
  );
  assert.equal(
    getHomeUpcomingState({ isLoading: false, isError: true }),
    "error",
  );
  assert.equal(
    getHomeUpcomingState({ isLoading: false, isError: false }),
    "ready",
  );
});