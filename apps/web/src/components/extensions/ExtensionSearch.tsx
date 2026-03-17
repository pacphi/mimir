import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FleetExtensionFilters, FleetExtensionCategory } from "@/types/extension";

interface ExtensionSearchProps {
  filters: FleetExtensionFilters;
  onFiltersChange: (filters: FleetExtensionFilters) => void;
  categories?: FleetExtensionCategory[];
}

export function ExtensionSearch({ filters, onFiltersChange, categories }: ExtensionSearchProps) {
  const handleSearch = (search: string) => {
    onFiltersChange({ ...filters, search: search || undefined });
  };

  const handleCategory = (label: string) => {
    onFiltersChange({
      ...filters,
      category: filters.category === label ? undefined : label,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = filters.search || filters.category;

  // Deduplicate categories by display_label, summing counts
  const uniqueCategories = new Map<string, number>();
  for (const cat of categories ?? []) {
    uniqueCategories.set(
      cat.display_label,
      (uniqueCategories.get(cat.display_label) ?? 0) + cat.count,
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          data-testid="extension-search-input"
          placeholder="Search extensions..."
          value={filters.search ?? ""}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
        />
        {filters.search && (
          <button
            onClick={() => handleSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category filters from API */}
        {Array.from(uniqueCategories.entries()).map(([label, count]) => (
          <button
            key={label}
            data-testid={`extension-category-filter-${label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => handleCategory(label)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.category === label
                ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {label}
            <span className="text-[10px] opacity-60">{count}</span>
          </button>
        ))}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-6 px-2 text-xs text-gray-500 hover:text-gray-300"
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
