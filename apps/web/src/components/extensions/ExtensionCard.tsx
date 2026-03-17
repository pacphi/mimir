import { Package, Server } from "lucide-react";
import type { FleetExtension } from "@/types/extension";

const CATEGORY_COLORS: Record<string, string> = {
  AI: "bg-purple-500/20 text-purple-300",
  Languages: "bg-blue-500/20 text-blue-300",
  Infrastructure: "bg-orange-500/20 text-orange-300",
  "MCP Servers": "bg-cyan-500/20 text-cyan-300",
  Testing: "bg-green-500/20 text-green-300",
  Tools: "bg-gray-500/20 text-gray-300",
  Desktop: "bg-pink-500/20 text-pink-300",
  Research: "bg-yellow-500/20 text-yellow-300",
  Management: "bg-teal-500/20 text-teal-300",
};

interface ExtensionCardProps {
  extension: FleetExtension;
  onClick: (name: string) => void;
}

export function ExtensionCard({ extension, onClick }: ExtensionCardProps) {
  const categoryColor = CATEGORY_COLORS[extension.category_label] ?? "bg-gray-500/20 text-gray-300";

  return (
    <div
      data-testid="extension-card"
      onClick={() => onClick(extension.name)}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 hover:bg-gray-900 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-800">
            <Package className="h-4 w-4 text-gray-400" />
          </div>
          <div className="min-w-0">
            <span
              data-testid="extension-card-name"
              className="font-medium text-white truncate block"
            >
              {extension.display_name ?? extension.name}
            </span>
            <p className="text-xs text-gray-500 truncate">{extension.name}</p>
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${categoryColor}`}
        >
          {extension.category_label}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 line-clamp-2">
        {extension.description ?? `Sindri extension: ${extension.name}`}
      </p>

      {/* Instance chips */}
      {extension.instances.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {extension.instances.slice(0, 4).map((inst) => (
            <span
              key={inst.id}
              className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500"
              title={`${inst.name} (${inst.provider})`}
            >
              {inst.name}
            </span>
          ))}
          {extension.instances.length > 4 && (
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
              +{extension.instances.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 mt-auto">
        <span className="flex items-center gap-1">
          <Server className="h-3 w-3" />
          {extension.instance_count} instance{extension.instance_count !== 1 ? "s" : ""}
        </span>
        <span className="text-gray-600">{extension.category}</span>
      </div>
    </div>
  );
}
