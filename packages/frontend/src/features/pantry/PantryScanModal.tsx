import { useState } from 'react';
import { aiErrorMessage } from '@/utils/aiValidation';
import { pantryApi } from '@/services/api';
import { Dialog } from '@/components/Dialog';
import { useToastStore } from '@/store/toast.store';
import { useAuthStore } from '@/store/auth.store';
import type { PantryItem, ScannedPantryItem } from '@nommable/shared';

const CATEGORIES = [
  'Spices & Seasonings',
  'Grains & Pasta',
  'Canned Goods',
  'Baking',
  'Oils & Vinegars',
  'Condiments',
  'Snacks',
  'Beverages',
  'Dairy',
  'Meat & Seafood',
  'Produce',
  'Frozen',
  'Other',
];

const LOCATIONS = ['Pantry', 'Refrigerator', 'Freezer', 'Spice Rack', 'Cabinet', 'Other'];

const MAX_PHOTOS = 5;

/** One candidate in the review step: the AI's guess + the user's edits. */
interface ReviewItem {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  location: string;
  expirationDate: string;
  notes: string;
  isLowStock: boolean;
  /** Existing pantry item this would merge into, if the user chooses merge. */
  mergeIntoId: string | null;
  merge: boolean;
}

interface PantryScanModalProps {
  onClose: () => void;
  /** Current pantry items, used for duplicate / merge detection. */
  existingItems: PantryItem[];
  /** Called after items are added so the parent can refresh. */
  onAdded: () => void;
  /** Available storage locations */
  availableLocations?: string[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function PantryScanModal({ onClose, existingItems, onAdded, availableLocations }: PantryScanModalProps) {
  const toast = useToastStore();
  const locationOptions = availableLocations && availableLocations.length > 0 ? availableLocations : LOCATIONS;
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  const [location, setLocation] = useState(locationOptions[0] || 'Pantry');
  const [files, setFiles] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setFiles((prev) => [...prev, ...selected].slice(0, MAX_PHOTOS));
    // Reset the input so the same file can be re-picked after removal.
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toReviewItem = (item: ScannedPantryItem, index: number): ReviewItem => {
    const match = existingItems.find((e) => normalizeName(e.name) === normalizeName(item.name));
    return {
      key: `${item.name}-${index}`,
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unit: item.unit || 'item',
      category: CATEGORIES.includes(item.category) ? item.category : 'Other',
      location,
      expirationDate: '',
      notes: '',
      isLowStock: false,
      mergeIntoId: match ? match.id : null,
      merge: Boolean(match),
    };
  };

  const handleScan = async () => {
    if (files.length === 0) {
      setError('Add at least one photo first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const res = await pantryApi.scanImages(files, location);
      const items = res.data.items ?? [];
      setReviewItems(items.map(toReviewItem));
      setStep('review');

      // The scan is the metered AI generation — refresh the credits badge
      // so it stays accurate without a page reload.
      await useAuthStore.getState().refreshUser();
    } catch (err: any) {
      const message =
        aiErrorMessage(err, err?.message || 'Failed to scan photos. Please try again.');
      setError(message);
    } finally {
      setScanning(false);
    }
  };

  const updateReviewItem = (key: string, patch: Partial<ReviewItem>) => {
    setReviewItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeReviewItem = (key: string) => {
    setReviewItems((prev) => prev.filter((item) => item.key !== key));
  };

  const addBlankItem = () => {
    setReviewItems((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        name: '',
        quantity: '1',
        unit: 'item',
        category: 'Other',
        location,
        expirationDate: '',
        notes: '',
        isLowStock: false,
        mergeIntoId: null,
        merge: false,
      },
    ]);
  };

  const handleAddAll = async () => {
    const valid = reviewItems.filter((item) => item.name.trim() && parseFloat(item.quantity) > 0);
    if (valid.length === 0) {
      setError('Nothing to add — give each item a name and a quantity above 0.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      for (const item of valid) {
        if (item.merge && item.mergeIntoId) {
          await pantryApi.updateQuantity(item.mergeIntoId, parseFloat(item.quantity));
        } else {
          await pantryApi.create({
            name: item.name.trim(),
            quantity: parseFloat(item.quantity),
            unit: item.unit.trim() || 'item',
            category: item.category,
            location: item.location,
            expirationDate: item.expirationDate || undefined,
            notes: item.notes.trim() || undefined,
            isLowStock: item.isLowStock,
          });
        }
      }
      toast.success(`Added ${valid.length} item${valid.length === 1 ? '' : 's'} to your pantry.`);
      onAdded();
      onClose();
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || 'Failed to add items. Please try again.';
      setError(message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog title="Scan Pantry with AI" onClose={onClose} panelClassName="max-w-4xl">
      <div className="p-6 space-y-5">
        {step === 'capture' && (
          <>
            {/* AI vision cost notice */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                AI Vision Cost Notice
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Scanning photos uses AI vision models, which have higher costs than text-only AI
                features. Each image processed will consume AI tokens.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            )}

            {/* Where were the photos taken? */}
            <div>
              <label
                htmlFor="scan-location"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Where are these photos from?
              </label>
              <select
                id="scan-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Helps the AI identify items — e.g. fridge photos usually show dairy and produce.
              </p>
            </div>

            {/* File upload */}
            <div>
              <span className="block text-sm font-medium text-foreground mb-2">
                Photos <span className="text-destructive">*</span>
              </span>
              <input
                id="pantry-scan-camera"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/jpg,image/webp"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                disabled={scanning}
              />
              <input
                id="pantry-scan-gallery"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileChange}
                className="hidden"
                disabled={scanning}
              />
              <div className="flex gap-3">
                <label
                  htmlFor="pantry-scan-camera"
                  className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors ${scanning ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  Take Photo
                </label>
                <label
                  htmlFor="pantry-scan-gallery"
                  className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors ${scanning ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  Choose from Gallery
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Take a wide photo of a whole shelf, fridge with the doors open, or freezer — one
                photo per space, not one per item. Supported formats: PNG, JPG, WebP • Maximum{' '}
                {MAX_PHOTOS} photos.
              </p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">
                  Selected Photos ({files.length}/{MAX_PHOTOS})
                </h3>
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-accent/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span aria-hidden="true">🖼️</span>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground text-sm truncate">
                            {file.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                        aria-label={`Remove ${file.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleScan}
                disabled={files.length === 0 || scanning}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {scanning ? 'Scanning…' : `Scan ${files.length} Photo${files.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Review what the AI found. Fix anything wrong, add missing items, fill in expiration
              dates — nothing is added until you confirm.
            </p>

            {reviewItems.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground">
                  No items detected in these photos. Add items manually below, or go back and try
                  different photos.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reviewItems.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateReviewItem(item.key, { name: e.target.value })}
                        placeholder="Item name"
                        aria-label="Item name"
                        className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateReviewItem(item.key, { quantity: e.target.value })}
                        placeholder="Qty"
                        aria-label="Quantity"
                        className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateReviewItem(item.key, { unit: e.target.value })}
                        placeholder="Unit"
                        aria-label="Unit"
                        className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeReviewItem(item.key)}
                        className="px-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label={`Remove ${item.name || 'item'}`}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={item.category}
                        onChange={(e) => updateReviewItem(item.key, { category: e.target.value })}
                        aria-label="Category"
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={item.location}
                        onChange={(e) => updateReviewItem(item.key, { location: e.target.value })}
                        aria-label="Location"
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {locationOptions.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={item.expirationDate}
                        onChange={(e) =>
                          updateReviewItem(item.key, { expirationDate: e.target.value })
                        }
                        aria-label="Expiration date"
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateReviewItem(item.key, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        aria-label="Notes"
                        className="flex-1 min-w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <label className="inline-flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isLowStock}
                          onChange={(e) =>
                            updateReviewItem(item.key, { isLowStock: e.target.checked })
                          }
                          className="accent-primary"
                        />
                        Low stock
                      </label>
                    </div>
                    {item.mergeIntoId && (
                      <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.merge}
                          onChange={(e) => updateReviewItem(item.key, { merge: e.target.checked })}
                          className="accent-primary"
                        />
                        Already in pantry — add to existing quantity instead of creating a duplicate
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addBlankItem}
              className="px-3 py-1.5 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              + Add missing item
            </button>

            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('capture')}
                disabled={adding}
                className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                Back to Photos
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={adding}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddAll}
                  disabled={adding || reviewItems.length === 0}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {adding
                    ? 'Adding…'
                    : `Add ${reviewItems.length} Item${reviewItems.length === 1 ? '' : 's'} to Pantry`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
