// Models sometimes wrap JSON in prose or code fences. Pull out the outermost object.
export function extractJSON(text: string): Record<string, unknown> | null {
  const clean = text.replace(/```json|```/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed: unknown = JSON.parse(clean.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
