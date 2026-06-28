// A stable, anonymous, PII-free per-browser id (localStorage). Used only to
// count distinct non-logged-in visitors who have a (localStorage) timetable.
const KEY = "client-id";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
