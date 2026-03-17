import { useState } from "react";
import { LayoutGrid, List, Package, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFleetExtensions } from "@/hooks/useExtensions";
import { ExtensionSearch } from "./ExtensionSearch";
import { ExtensionCard } from "./ExtensionCard";
import type { FleetExtensionFilters } from "@/types/extension";

type ViewMode = "grid" | "list";

interface ExtensionRegistryProps {
  onSelectExtension: (id: string) => void;
}

export function ExtensionRegistry({ onSelectExtension }: ExtensionRegistryProps) {
  const [filters, setFilters] = useState<FleetExtensionFilters>({});
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { data, isLoading } = useFleetExtensions(filters);

  const extensions = data?.extensions ?? [];

  const handleFiltersChange = (newFilters: FleetExtensionFilters) => {
    setFilters(newFilters);
  };

  return (
    <div className="space-y-6" data-testid="extension-registry">
      {/* Summary stats */}
      {data && (
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <span>
            <span className="text-white font-medium">{data.total}</span> extension
            {data.total !== 1 ? "s" : ""} across fleet
          </span>
          <span>
            <span className="text-white font-medium">{data.instances_with_extensions}</span>{" "}
            instance{data.instances_with_extensions !== 1 ? "s" : ""} with extensions
          </span>
        </div>
      )}

      {/* Search and filters */}
      <ExtensionSearch
        filters={filters}
        onFiltersChange={handleFiltersChange}
        categories={data?.categories}
      />

      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {isLoading ? (
            "Loading..."
          ) : (
            <>
              {extensions.length} extension{extensions.length !== 1 ? "s" : ""}
              {(filters.search || filters.category) && " matching filters"}
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${viewMode === "grid" ? "text-white bg-gray-800" : "text-gray-500"}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${viewMode === "list" ? "text-white bg-gray-800" : "text-gray-500"}`}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              : "space-y-2"
          }
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900/50"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && extensions.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 py-16 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-gray-600" />
          <p className="text-gray-400">No extensions found</p>
          <p className="mt-1 text-sm text-gray-600">
            Extensions appear when instances with installed extensions connect.
          </p>
        </div>
      )}

      {/* Grid view */}
      {!isLoading && extensions.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {extensions.map((ext) => (
            <ExtensionCard key={ext.name} extension={ext} onClick={onSelectExtension} />
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && extensions.length > 0 && viewMode === "list" && (
        <div className="space-y-2">
          {extensions.map((ext) => (
            <div
              key={ext.name}
              data-testid="extension-list-row"
              onClick={() => onSelectExtension(ext.name)}
              className="flex cursor-pointer items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 p-3 hover:border-gray-700 hover:bg-gray-900 transition-colors"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-800">
                <Package className="h-4 w-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm truncate">
                    {ext.display_name ?? ext.name}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {ext.description ?? `Sindri extension: ${ext.name}`}
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-4 text-xs text-gray-500">
                <span className="rounded px-1.5 py-0.5 bg-gray-800">{ext.category_label}</span>
                <span className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  {ext.instance_count}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
