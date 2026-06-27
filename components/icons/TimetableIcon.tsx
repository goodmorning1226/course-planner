// Small timetable/calendar mark used in the navbar (and mirrored by app/icon.svg
// for the browser tab). Stroke uses currentColor so it inherits the text colour.
export function TimetableIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* page */}
      <rect x="3" y="4" width="18" height="18" rx="2" />
      {/* binder posts + header divider */}
      <path d="M8 2v4M16 2v4M3 9h18" />
      {/* timetable grid */}
      <path d="M9 9v13M15 9v13M3 15h18" />
    </svg>
  );
}
