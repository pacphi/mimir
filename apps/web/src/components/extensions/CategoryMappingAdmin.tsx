import { useState } from "react";
import { Plus, Trash2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCategoryMappings,
  useCreateCategoryMapping,
  useUpdateCategoryMapping,
  useDeleteCategoryMapping,
  useTriggerCatalogSync,
} from "@/hooks/useExtensions";

export function CategoryMappingAdmin() {
  const { data: mappings, isLoading } = useCategoryMappings();
  const createMapping = useCreateCategoryMapping();
  const updateMapping = useUpdateCategoryMapping();
  const deleteMapping = useDeleteCategoryMapping();
  const triggerSync = useTriggerCatalogSync();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleAdd = () => {
    if (!newCategory.trim() || !newLabel.trim()) return;
    createMapping.mutate(
      { sindri_category: newCategory.trim(), display_label: newLabel.trim() },
      {
        onSuccess: () => {
          setNewCategory("");
          setNewLabel("");
          setShowAddForm(false);
        },
      },
    );
  };

  const handleUpdate = (id: string) => {
    if (!editLabel.trim()) return;
    updateMapping.mutate(
      { id, input: { display_label: editLabel.trim() } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleDelete = (id: string) => {
    deleteMapping.mutate(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Category Mappings</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
            className="border-gray-700 text-gray-400"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${triggerSync.isPending ? "animate-spin" : ""}`}
            />
            Sync from GitHub
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="border-gray-700 text-gray-400"
          >
            {showAddForm ? (
              <X className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            {showAddForm ? "Cancel" : "Add Mapping"}
          </Button>
        </div>
      </div>

      {triggerSync.isSuccess && (
        <p className="text-sm text-green-400">Catalog synced successfully.</p>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="flex items-end gap-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Sindri Category</label>
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. ai-agents"
              className="bg-gray-900 border-gray-700 text-white text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Display Label</label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. AI"
              className="bg-gray-900 border-gray-700 text-white text-sm"
            />
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={createMapping.isPending || !newCategory.trim() || !newLabel.trim()}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Add
          </Button>
        </div>
      )}

      {/* Mappings table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Sindri Category
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Display Label
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings?.map((m) => (
                <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{m.sindri_category}</td>
                  <td className="px-4 py-2">
                    {editingId === m.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-7 bg-gray-900 border-gray-700 text-white text-sm"
                          onKeyDown={(e) => e.key === "Enter" && handleUpdate(m.id)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdate(m.id)}
                          className="h-7 text-xs text-green-400"
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-7 text-xs text-gray-500"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span
                        className="text-white cursor-pointer hover:text-indigo-400"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditLabel(m.display_label);
                        }}
                      >
                        {m.display_label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                      className="h-7 w-7 p-0 text-gray-500 hover:text-red-400"
                      title="Delete mapping"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(!mappings || mappings.length === 0) && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                    No category mappings configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
