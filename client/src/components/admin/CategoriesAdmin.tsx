import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FolderTree,
} from "lucide-react";

export function CategoriesAdmin() {
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.cabinetCategories.list.useQuery();

  // State for adding new category
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // State for editing a category
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");

  // State for expanded categories (to show sub-categories)
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());

  // State for adding new sub-category
  const [addingSubForCat, setAddingSubForCat] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState("");

  // State for editing a sub-category
  const [editingSubId, setEditingSubId] = useState<number | null>(null);
  const [editSubName, setEditSubName] = useState("");

  // Mutations
  const createCat = trpc.cabinetCategories.create.useMutation({
    onSuccess: () => {
      toast.success("Category created");
      utils.cabinetCategories.list.invalidate();
      setNewCatName("");
      setAddingCat(false);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const updateCat = trpc.cabinetCategories.update.useMutation({
    onSuccess: () => {
      toast.success("Category renamed");
      utils.cabinetCategories.list.invalidate();
      setEditingCatId(null);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const deleteCat = trpc.cabinetCategories.delete.useMutation({
    onSuccess: () => {
      toast.success("Category deleted");
      utils.cabinetCategories.list.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const createSub = trpc.cabinetCategories.createSub.useMutation({
    onSuccess: () => {
      toast.success("Sub-category created");
      utils.cabinetCategories.list.invalidate();
      setNewSubName("");
      setAddingSubForCat(null);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const updateSub = trpc.cabinetCategories.updateSub.useMutation({
    onSuccess: () => {
      toast.success("Sub-category renamed");
      utils.cabinetCategories.list.invalidate();
      setEditingSubId(null);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const deleteSub = trpc.cabinetCategories.deleteSub.useMutation({
    onSuccess: () => {
      toast.success("Sub-category deleted");
      utils.cabinetCategories.list.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const toggleExpand = (catId: number) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Cabinet Categories & Sub-Categories
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the categories and sub-categories used throughout the platform. Changes apply immediately to all category dropdowns.
          </p>
        </div>
        {!addingCat && (
          <Button size="sm" onClick={() => setAddingCat(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        )}
      </div>

      {/* Add new category inline */}
      {addingCat && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="New category name..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCatName.trim()) createCat.mutate({ name: newCatName.trim() });
                  if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); }
                }}
                autoFocus
                className="max-w-xs"
              />
              <Button
                size="sm"
                onClick={() => { if (newCatName.trim()) createCat.mutate({ name: newCatName.trim() }); }}
                disabled={!newCatName.trim() || createCat.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingCat(false); setNewCatName(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category list */}
      <div className="space-y-2">
        {categories?.map((cat) => {
          const isExpanded = expandedCats.has(cat.id);
          const isEditing = editingCatId === cat.id;

          return (
            <Card key={cat.id} className="overflow-hidden">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {/* Expand/collapse toggle */}
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    className="p-0.5 rounded hover:bg-muted transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {/* Category name (editable) */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editCatName.trim()) updateCat.mutate({ id: cat.id, name: editCatName.trim() });
                          if (e.key === "Escape") setEditingCatId(null);
                        }}
                        autoFocus
                        className="max-w-xs h-8"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { if (editCatName.trim()) updateCat.mutate({ id: cat.id, name: editCatName.trim() }); }}
                        disabled={!editCatName.trim() || updateCat.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCatId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <CardTitle className="text-sm font-medium flex-1">{cat.name}</CardTitle>
                  )}

                  {/* Sub-category count badge */}
                  <Badge variant="secondary" className="text-xs">
                    {cat.subCategories.length} sub
                  </Badge>

                  {/* Action buttons */}
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${cat.name}" and all its sub-categories?`)) {
                            deleteCat.mutate({ id: cat.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              {/* Sub-categories (expanded) */}
              {isExpanded && (
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="ml-6 space-y-1.5 border-l-2 border-muted pl-3">
                    {cat.subCategories.map((sub) => {
                      const isEditingSub = editingSubId === sub.id;
                      return (
                        <div key={sub.id} className="flex items-center gap-2 py-1">
                          {isEditingSub ? (
                            <>
                              <Input
                                value={editSubName}
                                onChange={(e) => setEditSubName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && editSubName.trim()) updateSub.mutate({ id: sub.id, name: editSubName.trim() });
                                  if (e.key === "Escape") setEditingSubId(null);
                                }}
                                autoFocus
                                className="max-w-xs h-7 text-sm"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => { if (editSubName.trim()) updateSub.mutate({ id: sub.id, name: editSubName.trim() }); }}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingSubId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm flex-1">{sub.name}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                                onClick={() => { setEditingSubId(sub.id); setEditSubName(sub.name); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 opacity-50 hover:opacity-100 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete sub-category "${sub.name}"?`)) {
                                    deleteSub.mutate({ id: sub.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Add sub-category */}
                    {addingSubForCat === cat.id ? (
                      <div className="flex items-center gap-2 py-1">
                        <Input
                          placeholder="New sub-category..."
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newSubName.trim()) createSub.mutate({ categoryId: cat.id, name: newSubName.trim() });
                            if (e.key === "Escape") { setAddingSubForCat(null); setNewSubName(""); }
                          }}
                          autoFocus
                          className="max-w-xs h-7 text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => { if (newSubName.trim()) createSub.mutate({ categoryId: cat.id, name: newSubName.trim() }); }}
                          disabled={!newSubName.trim() || createSub.isPending}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setAddingSubForCat(null); setNewSubName(""); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground mt-1"
                        onClick={() => { setAddingSubForCat(cat.id); setNewSubName(""); }}
                      >
                        <Plus className="h-3 w-3" />
                        Add sub-category
                      </Button>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {(!categories || categories.length === 0) && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <FolderTree className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No categories yet. Click "Add Category" to get started.</p>
        </div>
      )}
    </div>
  );
}

export default CategoriesAdmin;
