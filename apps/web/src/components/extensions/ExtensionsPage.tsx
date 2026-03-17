import { useState } from "react";
import { Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtensionRegistry } from "./ExtensionRegistry";
import { ExtensionDetail } from "./ExtensionDetail";
import { CategoryMappingAdmin } from "./CategoryMappingAdmin";

export function ExtensionsPage() {
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-indigo-400" />
            <h1 className="text-2xl font-semibold text-white">Extensions</h1>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Browse, manage, and monitor extensions across your fleet
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setShowAdmin(!showAdmin);
            setSelectedExtensionId(null);
          }}
          className={`h-8 w-8 ${showAdmin ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
          title="Category settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {showAdmin ? (
        <CategoryMappingAdmin />
      ) : selectedExtensionId ? (
        <ExtensionDetail
          extensionId={selectedExtensionId}
          onBack={() => setSelectedExtensionId(null)}
        />
      ) : (
        <ExtensionRegistry onSelectExtension={(id) => setSelectedExtensionId(id)} />
      )}
    </div>
  );
}
