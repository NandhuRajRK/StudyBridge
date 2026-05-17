const WRITE_ACTION_TYPES = new Set([
  "create_note",
  "create_topic",
  "create_task",
  "create_study_guide",
  "create_mindmap",
  "create_material",
  "create_quiz",
]);

function capText(value, max = 4000) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sanitizeAction(action) {
  if (!action || typeof action !== "object") return null;
  return {
    ...action,
    type: typeof action.type === "string" ? action.type.trim() : "",
    title: capText(typeof action.title === "string" ? action.title : "", 180),
  };
}

function actionRequiresApproval(action) {
  return WRITE_ACTION_TYPES.has(String(action?.type || "").trim());
}

export function isPendingActionApproval(text) {
  return /^(approve|approved|apply|confirm|yes|yep|yeah|ok|okay|do it|go ahead|proceed|looks good|run it|save it)\b/i.test(String(text || "").trim());
}

export function isPendingActionCancellation(text) {
  return /^(cancel|discard|stop|no|nope|never mind|nevermind|don't|do not)\b/i.test(String(text || "").trim());
}

function parsePendingActionsFromReply(content) {
  if (typeof content !== "string" || !/Pending StudyBridge actions/i.test(content)) return [];

  return content
    .split("\n")
    .map((line) => line.match(/^\s*[-*]\s*(?:\d+\.\s*)?(create_[a-z_]+)\s*:\s*(.+?)\s*$/i))
    .filter(Boolean)
    .map((match) => sanitizeAction({ type: match[1], title: match[2] }))
    .filter(Boolean)
    .filter(actionRequiresApproval);
}

export function getRecoverablePendingActions(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (message.actionStatus === "applied" || message.actionStatus === "canceled") return [];
    if (/StudyBridge actions applied|Pending StudyBridge actions canceled/i.test(message.content || "")) return [];
    if (Array.isArray(message.pendingActions) && message.pendingActions.length > 0) {
      return message.pendingActions.map(sanitizeAction).filter(Boolean).filter(actionRequiresApproval);
    }

    const recovered = parsePendingActionsFromReply(message.content);
    if (recovered.length > 0) return recovered;
  }

  return [];
}

