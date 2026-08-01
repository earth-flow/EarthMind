import { isSiblingFlowView } from "../flow-view-routing";

const FLOW_ID = "abc-123";

describe("isSiblingFlowView", () => {
  it("matches the editor canvas route", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}`, FLOW_ID)).toBe(true);
  });

  it("matches the editor canvas route with a trailing slash", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}/`, FLOW_ID)).toBe(true);
  });

  it("matches the App runtime route", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}/app`, FLOW_ID)).toBe(true);
  });

  it("matches through a router basename or custom-param prefix", () => {
    expect(isSiblingFlowView(`/tenant-a/flow/${FLOW_ID}/app`, FLOW_ID)).toBe(
      true,
    );
  });

  // Guard against data loss in the other direction: these must NOT be treated
  // as sibling views, or leaving the flow would skip teardown and leave a
  // stale flow in the stores.
  it("rejects the flows list", () => {
    expect(isSiblingFlowView("/all", FLOW_ID)).toBe(false);
  });

  it("rejects a different flow", () => {
    expect(isSiblingFlowView("/flow/other-flow/app", FLOW_ID)).toBe(false);
  });

  it("rejects the read-only view route", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}/view`, FLOW_ID)).toBe(false);
  });

  it("rejects an unknown nested route under the same flow", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}/settings`, FLOW_ID)).toBe(false);
  });

  it("rejects a route whose id merely starts with the flow id", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}-copy/app`, FLOW_ID)).toBe(false);
  });

  it("returns false when no flow is loaded", () => {
    expect(isSiblingFlowView(`/flow/${FLOW_ID}`, undefined)).toBe(false);
  });
});
