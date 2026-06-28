"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Search input. Searches course name / teacher / classroom / serial no.
// Debounces 300ms so we don't hit the API on every keystroke; submitting the
// form searches immediately.
export function CourseSearchBar({
  onSearch,
  initialValue = "",
}: {
  onSearch: (q: string) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search as the user types.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(value.trim()), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // onSearch is stable from the parent; we intentionally key on value only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    onSearch(value.trim());
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜尋課名、教師、教室或流水號…"
        aria-label="搜尋課程"
        autoComplete="off"
      />
      <Button type="submit" className="shrink-0 whitespace-nowrap">
        搜尋
      </Button>
    </form>
  );
}
