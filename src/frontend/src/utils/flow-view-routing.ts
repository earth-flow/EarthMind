/** Path segment appended to a flow's route for its App runtime view. */
const APP_VIEW_SEGMENT = "/app";

/**
 * Whether ``pathname`` is one of the sibling views of the given flow — the
 * editor canvas (``/flow/:id``) or the App runtime (``/flow/:id/app``).
 *
 * The two views share the same loaded flow and the same stores, so moving
 * between them is not "leaving the flow". Navigation guards and teardown must
 * treat it differently from navigating away to, say, the flows list: there is
 * nothing to save and nothing to discard.
 *
 * Matching is done on a substring so it survives a router basename or the
 * optional custom-param prefix.
 */
export function isSiblingFlowView(
  pathname: string,
  flowId: string | undefined,
): boolean {
  if (!flowId) return false;

  const flowPath = `/flow/${flowId}`;
  const start = pathname.indexOf(flowPath);
  if (start === -1) return false;

  const remainder = pathname.slice(start + flowPath.length).replace(/\/$/, "");

  return remainder === "" || remainder === APP_VIEW_SEGMENT;
}
