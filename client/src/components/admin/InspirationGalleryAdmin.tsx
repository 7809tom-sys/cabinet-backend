/**
 * InspirationGalleryAdmin
 * Admin panel for managing inspiration gallery photos.
 * Supports create, edit, toggle active/inactive, delete, and reorder (sort order).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Eye, EyeOff, ImageIcon, ExternalLink } from "lucide-react";

const ROOM_OPTIONS = [
  { value: "", label: "— Any Room —" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "laundry", label: "Laundry" },
  { value: "closet", label: "Closet" },
  { value: "other", label: "Other" },
];

interface PhotoRow {
  id: number;
  title: string;
  imageUrl: string;
  roomType: string | null;
  styleId: number | null;
  doorStyleName: string | null;
  colorName: string | null;
  tags: string | null;
  sortOrder: number;
  isActive: boolean | number;
}

interface FormState {
  title: string;
  imageUrl: string;
  roomType: string;
  styleId: string;
  doorStyleName: string;
  colorName: string;
  tags: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  imageUrl: "",
  roomType: "",
  styleId: "",
  doorStyleName: "",
  colorName: "",
  tags: "",
  sortOrder: "0",
  isActive: true,
};

function photoToForm(p: PhotoRow): FormState {
  return {
    title: p.title,
    imageUrl: p.imageUrl,
    roomType: p.roomType ?? "",
    styleId: p.styleId != null ? String(p.styleId) : "",
    doorStyleName: p.doorStyleName ?? "",
    colorName: p.colorName ?? "",
    tags: p.tags ?? "",
    sortOrder: String(p.sortOrder),
    isActive: Boolean(p.isActive),
  };
}

export default function InspirationGalleryAdmin() {
  const utils = trpc.useUtils();
  const { data: photos, isLoading, error, refetch } = trpc.inspiration.adminList.useQuery();

  const createMut = trpc.inspiration.create.useMutation({
    onSuccess: () => { utils.inspiration.adminList.invalidate(); toast.success("Photo added"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMut = trpc.inspiration.update.useMutation({
    onSuccess: () => { utils.inspiration.adminList.invalidate(); toast.success("Photo updated"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.inspiration.delete.useMutation({
    onSuccess: () => { utils.inspiration.adminList.invalidate(); toast.success("Photo deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(p: PhotoRow) {
    setEditId(p.id);
    setForm(photoToForm(p));
    setDialogOpen(true);
  }

  function handleSave() {
    const payload = {
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim(),
      roomType: form.roomType || null,
      styleId: form.styleId ? Number(form.styleId) : null,
      doorStyleName: form.doorStyleName.trim() || null,
      colorName: form.colorName.trim() || null,
      tags: form.tags.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    if (!payload.title) { toast.error("Title is required"); return; }
    if (!payload.imageUrl) { toast.error("Image URL is required"); return; }
    if (editId != null) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  function handleToggleActive(p: PhotoRow) {
    updateMut.mutate({ id: p.id, isActive: !p.isActive });
  }

  function handleDelete(p: PhotoRow) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    deleteMut.mutate({ id: p.id });
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  if (isLoading) return <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-primary" /></div>;
  if (error) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-destructive">Failed to load photos: {error.message}</p>
      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Inspiration Gallery</h2>
          <p className="text-sm text-muted-foreground">
            Manage photos shown on the public <a href="/inspiration" target="_blank" className="text-primary underline inline-flex items-center gap-1">Inspiration Gallery <ExternalLink className="h-3 w-3" /></a>.
            Upload images to S3 first, then paste the URL here.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Add Photo
        </Button>
      </div>

      {/* Photo grid */}
      {!photos || photos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No photos yet</p>
          <p className="text-sm mt-1">Click "Add Photo" to upload your first inspiration image.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(photos as PhotoRow[]).map((p) => (
            <Card key={p.id} className={!p.isActive ? "opacity-50" : ""}>
              <CardContent className="p-0">
                {/* Image */}
                <div className="aspect-[4/3] bg-muted rounded-t-lg overflow-hidden relative">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  {/* Active badge */}
                  <div className="absolute top-2 right-2">
                    <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                      {p.isActive ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                </div>
                {/* Info */}
                <div className="p-3 space-y-1">
                  <p className="font-medium text-sm truncate">{p.title}</p>
                  <div className="flex flex-wrap gap-1">
                    {p.roomType && <Badge variant="outline" className="text-xs capitalize">{p.roomType}</Badge>}
                    {p.doorStyleName && <Badge variant="secondary" className="text-xs">{p.doorStyleName}</Badge>}
                    {p.colorName && <Badge variant="outline" className="text-xs">{p.colorName}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Sort: {p.sortOrder}</p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 px-3 pb-3">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-9 p-0"
                    title={p.isActive ? "Hide from gallery" : "Show in gallery"}
                    onClick={() => handleToggleActive(p)}
                  >
                    {p.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-9 p-0 text-destructive hover:bg-destructive/10"
                    title="Delete photo"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId != null ? "Edit Photo" : "Add Photo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. White Shaker Kitchen with Island"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL *</Label>
              <Input
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Upload the image via the Product Images tab first, then paste the URL here.
              </p>
              {form.imageUrl && (
                <div className="mt-2 aspect-[4/3] rounded-md overflow-hidden bg-muted">
                  <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Room Type</Label>
              <Select value={form.roomType} onValueChange={(v: string) => setForm((f) => ({ ...f, roomType: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_OPTIONS.map((o) => (
                    <SelectItem key={o.value || "_none"} value={o.value || "_none"}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Door Style Name</Label>
                <Input
                  placeholder="e.g. Shaker"
                  value={form.doorStyleName}
                  onChange={(e) => setForm((f) => ({ ...f, doorStyleName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color Name</Label>
                <Input
                  placeholder="e.g. Bright White"
                  value={form.colorName}
                  onChange={(e) => setForm((f) => ({ ...f, colorName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Door Style ID (optional)</Label>
              <Input
                type="number"
                placeholder="Links the photo to a specific door style"
                value={form.styleId}
                onChange={(e) => setForm((f) => ({ ...f, styleId: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                When set, the "Design This Look" button will pre-load this style in the design tool.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input
                placeholder="e.g. modern, white, island, open-concept"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Comma-separated keywords for future search/filter.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first. Use 0 for default.</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label>Show in public gallery</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Spinner className="h-4 w-4 mr-2" /> : null}
              {editId != null ? "Save Changes" : "Add Photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
