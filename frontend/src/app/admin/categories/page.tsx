"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminCategory } from "@/lib/api/types";

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The form: editingId is null when adding a new category
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<{ items: AdminCategory[] }>(
        "/admin/categories",
      );
      setItems(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load categories");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset the form to "add new"
  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setSortOrder("0");
    setIsActive(true);
  }

  // Fill the form with a category to edit it
  function startEdit(c: AdminCategory) {
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description ?? "");
    setSortOrder(String(c.sortOrder));
    setIsActive(c.isActive);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Create or save
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminFetch(
        editingId ? `/admin/categories/${editingId}` : "/admin/categories",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            name,
            description: description || null,
            sortOrder: Number(sortOrder) || 0,
            isActive,
          }),
        },
      );
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  // Delete (the server refuses if the category still has products)
  async function remove(c: AdminCategory) {
    if (!window.confirm(`Delete the category "${c.name}"?`)) return;
    setError(null);
    try {
      await adminFetch(`/admin/categories/${c.id}`, { method: "DELETE" });
      if (editingId === c.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Categories</h1>

      {/* Add / edit form */}
      <form
        onSubmit={handleSubmit}
        className="mt-4 space-y-3 rounded-lg border p-4"
      >
        <h2 className="font-semibold">
          {editingId ? "Edit category" : "Add a category"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Name *
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-medium">
            Order on the site (0 = first)
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 font-normal"
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Visible on the shop
        </label>
        <div className="flex gap-3">
          <button
            disabled={saving}
            className="rounded bg-brand px-4 py-2 text-sm text-white disabled:bg-gray-400"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add category"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {/* List */}
      <div className="mt-6 space-y-2">
        {items?.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {c.name}{" "}
                {!c.isActive && (
                  <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs">
                    Hidden
                  </span>
                )}
              </p>
              <p className="text-gray-600">
                /{c.slug} · {c.productCount} product
                {c.productCount === 1 ? "" : "s"} · order {c.sortOrder}
              </p>
            </div>
            <div>
              <button onClick={() => startEdit(c)} className="underline">
                Edit
              </button>
              <button
                onClick={() => remove(c)}
                className="ml-3 text-red-600 underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {items && items.length === 0 && (
          <p className="text-gray-600">No categories yet.</p>
        )}
        {!items && !error && <p className="text-gray-600">Loading...</p>}
      </div>
    </div>
  );
}
