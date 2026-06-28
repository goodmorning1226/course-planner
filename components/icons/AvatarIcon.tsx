import { cn } from "@/lib/utils";

// Unified user avatar: black circle, white border, white person silhouette.
// Size via className (e.g. "h-8 w-8").
export function AvatarIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-white bg-black text-white",
        className
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
        <path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 1.8c-3.9 0-7 2.3-7 5.2V21h14v-2c0-2.9-3.1-5.2-7-5.2z" />
      </svg>
    </span>
  );
}
