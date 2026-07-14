/**
 * InlineEditImage — admin-only inline image editor.
 *
 * Usage:
 *   <InlineEditImage
 *     value={style.thumbnailImageUrl ?? ""}
 *     onSave={(url) => updateMut.mutate({ id: style.id, thumbnailImageUrl: url })}
 *     label="Thumbnail"
 *   >
 *     <img src={style.thumbnailImageUrl} alt="Thumbnail" />
 *   </InlineEditImage>
 *
 * Shows a camera icon overlay on hover (admin only). Clicking opens a popover
 * with a URL input and file upload option. Saving calls onSave(newUrl).
 */
import { useState, useRef } from "react";
import { Camera, Check, X, Upload, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InlineEditImageProps {
  value: string;
  onSave: (newUrl: string) => Promise<void> | void;
  label?: string;
  className?: string;
  /** Render the display content (the image) */
  children: React.ReactNode;
  /** Accept attribute for file input, defaults to "image/*" */
  accept?: string;
}

export function InlineEditImage({
  value,
  onSave,
  label,
  className,
  children,
  accept = "image/*",
}: InlineEditImageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) return <>{children}</>;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json() as { url: string };
      setDraft(json.url);
    } catch (err) {
      toast.error("Image upload failed. Please try pasting a URL instead.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className={cn("group relative inline-block", className)}>
      {/* Camera icon overlay */}
      {!editing && (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-black/40 rounded"
          title={label ? `Edit ${label}` : "Edit image"}
        >
          <Camera className="h-5 w-5 text-white drop-shadow" />
        </button>
      )}
      {children}
      {editing && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-white shadow-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">{label ? `Edit ${label}` : "Edit image"}</p>
          {/* URL input */}
          <input
            type="url"
            placeholder="Paste image URL..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none ring-1 ring-blue-400 focus:ring-blue-500"
          />
          {/* Preview */}
          {draft && (
            <img src={draft} alt="Preview" className="h-20 w-full object-cover rounded border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          {/* File upload */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {uploading ? "Uploading..." : "Upload from device"}
          </button>
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />
          {/* Save / Cancel */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check size={11} />}
              Save
            </button>
            <button
              onClick={() => { setDraft(value); setEditing(false); }}
              className="flex items-center gap-1 rounded bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200"
            >
              <X size={11} /> Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
