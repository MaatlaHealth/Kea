"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export type FilterDefinition = {
  name: string;
  label: string;
  options: FilterOption[];
  /** Value that clears the filter. Defaults to "all". */
  allValue?: string;
};

/**
 * URL driven filter bar.
 *
 * Filters live in the query string so that a filtered view can be shared,
 * bookmarked and rendered on the server without client state.
 */
export function FilterBar({
  searchPlaceholder = "Search",
  filters = [],
  className,
}: {
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get("q") ?? "";
  const [term, setTerm] = React.useState(currentSearch);
  const [syncedSearch, setSyncedSearch] = React.useState(currentSearch);
  const [pending, startTransition] = React.useTransition();

  // When the URL changes, bring the input back in step with it. Adjusting
  // state during render is the supported pattern for this, and avoids the
  // extra commit an effect would cause.
  if (currentSearch !== syncedSearch) {
    setSyncedSearch(currentSearch);
    setTerm(currentSearch);
  }

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "" || value === "all") params.delete(key);
        else params.set(key, value);
      }
      params.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const activeCount = filters.filter((filter) => searchParams.get(filter.name)).length;
  const hasAny = activeCount > 0 || currentSearch.length > 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <form
        className="relative min-w-[14rem] flex-1 sm:max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: term.trim() || null });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="pl-9"
        />
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>

      {filters.map((filter) => {
        const allValue = filter.allValue ?? "all";
        const value = searchParams.get(filter.name) ?? allValue;
        return (
          <Select
            key={filter.name}
            value={value}
            onValueChange={(next) => update({ [filter.name]: next })}
          >
            <SelectTrigger className="w-auto min-w-[10rem]" aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      {hasAny ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setTerm("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <X />
          Clear
        </Button>
      ) : null}

      {pending ? <span className="text-xs text-muted-foreground">Updating</span> : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return null;

  const go = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-1 pt-4 text-sm text-muted-foreground">
      <p>
        Showing <span className="font-medium text-foreground">{first}</span> to{" "}
        <span className="font-medium text-foreground">{last}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          Previous
        </Button>
        <span className="text-xs">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
