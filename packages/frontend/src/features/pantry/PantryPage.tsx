import { useState, useEffect } from 'react';
import { pantryApi } from '@/services/api';
import { AlertTriangle, Check, Clock, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Callout } from '@/components/Callout';
import { Dialog } from '@/components/Dialog';
import { PantryScanModal } from './PantryScanModal';
import { useAIStatus, aiNotConfiguredClass, AISetupBadge } from '@/hooks/useAIStatus';
import type { PantryItem, PantryLocationInfo } from '@nommable/shared';
import { useConfirmStore } from '@/store/confirm.store';
import { useToastStore } from '@/store/toast.store';

const CATEGORIES = [
  { name: 'Spices & Seasonings' },
  { name: 'Grains & Pasta' },
  { name: 'Canned Goods' },
  { name: 'Baking' },
  { name: 'Oils & Vinegars' },
  { name: 'Condiments' },
  { name: 'Snacks' },
  { name: 'Beverages' },
  { name: 'Dairy' },
  { name: 'Meat & Seafood' },
  { name: 'Produce' },
  { name: 'Frozen' },
  { name: 'Other' },
];

const DEFAULT_LOCATIONS = ['Pantry', 'Refrigerator', 'Freezer', 'Spice Rack', 'Cabinet', 'Other'];

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [locations, setLocations] = useState<PantryLocationInfo[]>([]);
  const confirm = useConfirmStore((s) => s.confirm);
  const toast = useToastStore();
  const [expiringItems, setExpiringItems] = useState<PantryItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showLocationManager, setShowLocationManager] = useState(false);
  const { isReady: aiReady, isLoading: aiLoading } = useAIStatus();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Add item form state
  const [formData, setFormData] = useState({
    name: '',
    quantity: '',
    unit: '',
    category: 'Other',
    location: 'Pantry',
    expirationDate: '',
    notes: '',
    isLowStock: false,
  });

  // Edit Item modal state
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    quantity: '',
    unit: '',
    category: 'Other',
    location: 'Pantry',
    expirationDate: '',
    notes: '',
    isLowStock: false,
  });

  // Location Manager state
  const [newLocationName, setNewLocationName] = useState('');
  const [editingLocationName, setEditingLocationName] = useState<string | null>(null);
  const [editingLocationNewName, setEditingLocationNewName] = useState('');
  const [deletingLocation, setDeletingLocation] = useState<PantryLocationInfo | null>(null);
  const [transferToLocation, setTransferToLocation] = useState('');
  const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);

  useEffect(() => {
    loadPantryData();
  }, []);

  const loadPantryData = async () => {
    try {
      const [allItems, expiring, lowStock, locsRes] = await Promise.all([
        pantryApi.getAll(),
        pantryApi.getExpiring(7),
        pantryApi.getLowStock(),
        pantryApi.getLocations().catch(() => ({ data: [] })),
      ]);
      setItems(allItems.data);
      setExpiringItems(expiring.data);
      setLowStockItems(lowStock.data);
      if (locsRes?.data && Array.isArray(locsRes.data)) {
        setLocations(locsRes.data);
      }
    } catch (error) {
      console.error('Failed to load pantry data:', error);
    } finally {
      setLoading(false);
    }
  };

  const locationNames = locations.length > 0
    ? locations.map((l) => l.name)
    : DEFAULT_LOCATIONS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await pantryApi.create({
        ...formData,
        quantity: parseFloat(formData.quantity),
        expirationDate: formData.expirationDate || undefined,
      });

      // Reset form
      setFormData({
        name: '',
        quantity: '',
        unit: '',
        category: 'Other',
        location: locationNames[0] || 'Pantry',
        expirationDate: '',
        notes: '',
        isLowStock: false,
      });
      setShowAddForm(false);
      loadPantryData();
      toast.success('Pantry item added.');
    } catch (error) {
      console.error('Failed to add item:', error);
      toast.error('Failed to add item. Please try again.');
    }
  };

  const handleStartEdit = (item: PantryItem) => {
    setEditingItem(item);
    setEditFormData({
      name: item.name,
      quantity: item.quantity.toString(),
      unit: item.unit,
      category: item.category,
      location: item.location || locationNames[0] || 'Pantry',
      expirationDate: item.expirationDate
        ? new Date(item.expirationDate).toISOString().split('T')[0]
        : '',
      notes: item.notes || '',
      isLowStock: item.isLowStock || false,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      await pantryApi.update(editingItem.id, {
        ...editFormData,
        quantity: parseFloat(editFormData.quantity),
        expirationDate: editFormData.expirationDate || undefined,
      });

      toast.success(`Updated "${editFormData.name}".`);
      setEditingItem(null);
      loadPantryData();
    } catch (error) {
      console.error('Failed to update item:', error);
      toast.error('Failed to update item. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    const ok = await confirm({
      title: 'Delete pantry item?',
      message: `Permanently delete "${item?.name ?? 'this item'}" from your pantry? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await pantryApi.delete(id);
      loadPantryData();
      toast.success('Pantry item deleted.');
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Failed to delete item. Please try again.');
    }
  };

  const handleToggleLowStock = async (id: string) => {
    try {
      await pantryApi.toggleLowStock(id);
      loadPantryData();
    } catch (error) {
      console.error('Failed to toggle low stock:', error);
    }
  };

  const handleQuantityChange = async (id: string, change: number) => {
    try {
      await pantryApi.updateQuantity(id, change);
      loadPantryData();
    } catch (error) {
      console.error('Failed to update quantity:', error);
    }
  };

  // Location Manager actions
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLocationName.trim();
    if (!name) return;

    setIsSubmittingLocation(true);
    try {
      await pantryApi.createLocation(name);
      setNewLocationName('');
      toast.success(`Location "${name}" created.`);
      loadPantryData();
    } catch (error: any) {
      console.error('Failed to create location:', error);
      const msg = error?.response?.data?.message || 'Failed to create location.';
      toast.error(msg);
    } finally {
      setIsSubmittingLocation(false);
    }
  };

  const handleRenameLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocationName) return;
    const newName = editingLocationNewName.trim();
    if (!newName || newName === editingLocationName) {
      setEditingLocationName(null);
      return;
    }

    setIsSubmittingLocation(true);
    try {
      await pantryApi.updateLocation(editingLocationName, newName);
      toast.success(`Location renamed to "${newName}".`);
      setEditingLocationName(null);
      loadPantryData();
    } catch (error: any) {
      console.error('Failed to rename location:', error);
      const msg = error?.response?.data?.message || 'Failed to rename location.';
      toast.error(msg);
    } finally {
      setIsSubmittingLocation(false);
    }
  };

  const handleConfirmDeleteLocation = async () => {
    if (!deletingLocation) return;

    setIsSubmittingLocation(true);
    try {
      await pantryApi.deleteLocation(
        deletingLocation.name,
        deletingLocation.itemCount > 0 ? transferToLocation : undefined
      );
      toast.success(`Location "${deletingLocation.name}" removed.`);
      setDeletingLocation(null);
      loadPantryData();
    } catch (error: any) {
      console.error('Failed to delete location:', error);
      const msg = error?.response?.data?.message || 'Failed to delete location.';
      toast.error(msg);
    } finally {
      setIsSubmittingLocation(false);
    }
  };

  const groupItemsByCategory = () => {
    const filtered = items.filter((item) => {
      const matchesSearch =
        !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    const grouped: { [key: string]: PantryItem[] } = {};
    filtered.forEach((item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });

    return grouped;
  };

  const getDaysUntilExpiration = (date: Date | undefined) => {
    if (!date) return null;
    const today = new Date();
    const expDate = new Date(date);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading pantry...</div>
      </div>
    );
  }

  const groupedItems = groupItemsByCategory();

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium leading-tight text-balance text-foreground">Pantry</h1>
          <p className="text-muted-foreground tabular-nums mt-1">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowLocationManager(true)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground hover:bg-accent shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary inline-flex items-center gap-1.5"
            aria-label="Manage storage locations"
            title="Manage storage locations"
          >
            <MapPin size={18} strokeWidth={1.5} />
            Locations
          </button>
          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            className={`rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground hover:bg-accent shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 inline-flex items-center gap-2 ${!aiReady && !aiLoading ? aiNotConfiguredClass : ''}`}
            aria-label="Scan pantry with AI"
            title={!aiReady && !aiLoading ? 'Set up AI to use this feature' : undefined}
          >
            Scan with AI
            {!aiReady && !aiLoading && <AISetupBadge />}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            {showAddForm ? 'Cancel' : 'Add item'}
          </button>
        </div>
      </div>

      {showScanModal && (
        <PantryScanModal
          onClose={() => setShowScanModal(false)}
          existingItems={items}
          onAdded={loadPantryData}
          availableLocations={locationNames}
        />
      )}

      {/* Alert Cards */}
      {(expiringItems.length > 0 || lowStockItems.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          {/* Expiring Items Alert */}
          {expiringItems.length > 0 && (
            <Callout
              tone="warning"
              icon={<Clock size={24} strokeWidth={1.5} aria-hidden="true" />}
              title={`${expiringItems.length} item${expiringItems.length !== 1 ? 's' : ''} expiring soon`}
            >
              <ul className="space-y-1">
                {expiringItems.slice(0, 3).map((item) => {
                  const days = getDaysUntilExpiration(item.expirationDate);
                  return (
                    <li key={item.id}>
                      {item.name} - {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                    </li>
                  );
                })}
                {expiringItems.length > 3 && (
                  <li className="font-medium">and {expiringItems.length - 3} more</li>
                )}
              </ul>
            </Callout>
          )}

          {/* Low Stock Alert (#31: replaced BarChartIcon with AlertTriangle) */}
          {lowStockItems.length > 0 && (
            <Callout
              tone="warning"
              icon={<AlertTriangle size={24} strokeWidth={1.5} aria-hidden="true" />}
              title={`${lowStockItems.length} item${lowStockItems.length !== 1 ? 's' : ''} running low`}
            >
              <ul className="space-y-1">
                {lowStockItems.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    {item.name} - {item.quantity} {item.unit}
                  </li>
                ))}
                {lowStockItems.length > 3 && (
                  <li className="font-medium">and {lowStockItems.length - 3} more</li>
                )}
              </ul>
            </Callout>
          )}
        </div>
      )}

      {/* Add item Form */}
      {showAddForm && (
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm mb-6">
          <h2 className="text-base font-medium text-foreground mb-4">Add new item</h2>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="add-name" className="block text-sm font-medium text-foreground mb-1">
                Item name *
              </label>
              <input
                id="add-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label htmlFor="add-quantity" className="block text-sm font-medium text-foreground mb-1">
                Quantity *
              </label>
              <input
                id="add-quantity"
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label htmlFor="add-unit" className="block text-sm font-medium text-foreground mb-1">
                Unit *
              </label>
              <input
                id="add-unit"
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="e.g., kg, lbs, pcs"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label htmlFor="add-category" className="block text-sm font-medium text-foreground mb-1">
                Category
              </label>
              <select
                id="add-category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="add-location" className="block text-sm font-medium text-foreground mb-1">
                Location
              </label>
              <select
                id="add-location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {locationNames.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="add-expiration" className="block text-sm font-medium text-foreground mb-1">
                Expiration date
              </label>
              <input
                id="add-expiration"
                type="date"
                value={formData.expirationDate}
                onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label htmlFor="add-notes" className="block text-sm font-medium text-foreground mb-1">
                Notes
              </label>
              <input
                id="add-notes"
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Add item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Item Modal (#32) */}
      {editingItem && (
        <Dialog
          title={`Edit "${editingItem.name}"`}
          onClose={() => setEditingItem(null)}
        >
          <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-foreground mb-1">
                Item name *
              </label>
              <input
                id="edit-name"
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-quantity" className="block text-sm font-medium text-foreground mb-1">
                  Quantity *
                </label>
                <input
                  id="edit-quantity"
                  type="number"
                  step="0.01"
                  value={editFormData.quantity}
                  onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-unit" className="block text-sm font-medium text-foreground mb-1">
                  Unit *
                </label>
                <input
                  id="edit-unit"
                  type="text"
                  value={editFormData.unit}
                  onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                  placeholder="e.g., kg, lbs, pcs"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-category" className="block text-sm font-medium text-foreground mb-1">
                  Category
                </label>
                <select
                  id="edit-category"
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-location" className="block text-sm font-medium text-foreground mb-1">
                  Location
                </label>
                <select
                  id="edit-location"
                  value={editFormData.location}
                  onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {locationNames.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="edit-expiration" className="block text-sm font-medium text-foreground mb-1">
                Expiration date
              </label>
              <input
                id="edit-expiration"
                type="date"
                value={editFormData.expirationDate}
                onChange={(e) => setEditFormData({ ...editFormData, expirationDate: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="edit-notes" className="block text-sm font-medium text-foreground mb-1">
                Notes
              </label>
              <input
                id="edit-notes"
                type="text"
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="edit-is-low-stock"
                checked={editFormData.isLowStock}
                onChange={(e) => setEditFormData({ ...editFormData, isLowStock: e.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <label htmlFor="edit-is-low-stock" className="text-sm font-medium text-foreground flex items-center gap-1.5 cursor-pointer">
                <AlertTriangle size={15} className="text-amber-500" strokeWidth={1.5} />
                Mark as low stock
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                Save changes
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Manage Storage Locations Modal (#33) */}
      {showLocationManager && (
        <Dialog
          title="Manage storage locations"
          onClose={() => {
            setShowLocationManager(false);
            setEditingLocationName(null);
            setDeletingLocation(null);
          }}
        >
          <div className="p-6 space-y-5">
            {/* Add new location */}
            <form onSubmit={handleCreateLocation} className="flex gap-2">
              <input
                type="text"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="New storage zone / location"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <button
                type="submit"
                disabled={!newLocationName.trim() || isSubmittingLocation}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={16} strokeWidth={1.5} />
                Add
              </button>
            </form>

            {/* Delete confirmation with transfer option */}
            {deletingLocation && (
              <Callout tone="error" title={`Delete location "${deletingLocation.name}"?`} className="space-y-3">
                <div className="space-y-3">
                {deletingLocation.itemCount > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      This location currently contains{' '}
                      <span className="font-medium text-foreground">
                        {deletingLocation.itemCount} {deletingLocation.itemCount === 1 ? 'item' : 'items'}
                      </span>
                      . Select where to transfer them:
                    </p>
                    <select
                      value={transferToLocation}
                      onChange={(e) => setTransferToLocation(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {locations
                        .filter((l) => l.name !== deletingLocation.name)
                        .map((l) => (
                          <option key={l.name} value={l.name}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This location has no items and will be permanently removed.
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeletingLocation(null)}
                    className="px-3 py-1.5 rounded text-xs border border-border bg-background text-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteLocation}
                    disabled={isSubmittingLocation}
                    className="px-3 py-1.5 rounded text-xs bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90"
                  >
                    Delete location
                  </button>
                </div>
                </div>
              </Callout>
            )}

            {/* List of locations */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium tabular-nums text-muted-foreground">
                Configured locations ({locations.length})
              </h3>
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-background">
                {locations.map((loc) => (
                  <li key={loc.name} className="flex items-center justify-between p-3 gap-2">
                    {editingLocationName === loc.name ? (
                      <form onSubmit={handleRenameLocation} className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingLocationNewName}
                          onChange={(e) => setEditingLocationNewName(e.target.value)}
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                          required
                        />
                        <button
                          type="submit"
                          disabled={!editingLocationNewName.trim() || editingLocationNewName === loc.name}
                          className="p-1.5 rounded text-primary hover:bg-accent disabled:opacity-50"
                          title="Save rename"
                          aria-label="Save rename"
                        >
                          <Check size={16} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLocationName(null)}
                          className="p-1.5 rounded text-muted-foreground hover:bg-accent"
                          title="Cancel"
                          aria-label="Cancel"
                        >
                          <X size={16} strokeWidth={1.5} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-sm text-foreground truncate">{loc.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {loc.itemCount} {loc.itemCount === 1 ? 'item' : 'items'}
                          </span>
                          {loc.isDefault && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              Built-in
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLocationName(loc.name);
                              setEditingLocationNewName(loc.name);
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            aria-label={`Rename ${loc.name}`}
                            title="Rename location"
                          >
                            <Pencil size={15} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const otherLocs = locations.filter((l) => l.name !== loc.name);
                              setTransferToLocation(otherLocs[0]?.name || 'Pantry');
                              setDeletingLocation(loc);
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label={`Delete ${loc.name}`}
                            title="Delete location"
                          >
                            <Trash2 size={15} strokeWidth={1.5} />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowLocationManager(false)}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Search and Filter */}
      <div className="mb-6 bg-card rounded-lg border border-border p-4 shadow-sm">
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pantry items"
            className="w-full rounded-md border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground mb-2">Filter by category</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat.name
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background border border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pantry Items by Category (#30: responsive two-column grid on md+ screens) */}
      {Object.keys(groupedItems).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {searchQuery || selectedCategory
              ? 'No items match your filters.'
              : 'Your pantry is empty. Add your first item.'}
          </p>
          {!searchQuery && !selectedCategory && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="mt-4 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Add item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="bg-card rounded-lg border border-border p-4 shadow-sm">
              <h2 className="text-base font-medium text-foreground mb-3 flex items-center gap-2">
                {category}
                <span className="font-mono text-[13px] tabular-nums text-muted-foreground font-normal">
                  ({categoryItems.length})
                </span>
              </h2>

              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-background">
                {categoryItems.map((item) => {
                  const daysUntilExp = getDaysUntilExpiration(item.expirationDate);
                  const isExpiringSoon = daysUntilExp !== null && daysUntilExp <= 7;
                  const isExpired = daysUntilExp !== null && daysUntilExp < 0;
                  const expiryLabel = item.expirationDate
                    ? isExpired
                      ? 'Expired'
                      : daysUntilExp === 0
                      ? 'Expires today'
                      : daysUntilExp === 1
                      ? 'Expires tomorrow'
                      : `Expires in ${daysUntilExp} days`
                    : null;

                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                        isExpired
                          ? 'bg-destructive/5'
                          : isExpiringSoon
                          ? 'bg-amber-50 dark:bg-amber-900/20'
                          : item.isLowStock
                          ? 'bg-red-50/80 dark:bg-red-950/30 border-l border-l-red-500'
                          : 'bg-background hover:bg-accent/30'
                      }`}
                    >
                      {/* Low stock toggle (#31: AlertTriangle with clear active/inactive state and tooltips) */}
                      <button
                        type="button"
                        onClick={() => handleToggleLowStock(item.id)}
                        aria-label={
                          item.isLowStock
                            ? `Low stock active for ${item.name} — tap to clear flag`
                            : `Mark ${item.name} as low stock`
                        }
                        aria-pressed={item.isLowStock}
                        title={item.isLowStock ? 'Low stock — tap to clear flag' : 'Mark as low stock'}
                        className={`w-10 h-10 flex-shrink-0 inline-flex items-center justify-center rounded-md border transition-colors ${
                          item.isLowStock
                            ? 'bg-red-600 border-red-600 text-white shadow-sm hover:bg-red-700'
                            : 'border-border text-muted-foreground hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 dark:hover:bg-amber-950/30'
                        }`}
                      >
                        <AlertTriangle size={18} className={item.isLowStock ? 'text-white' : ''} strokeWidth={1.5} />
                      </button>

                      {/* Name + quantity + meta (#30: high visibility low-stock badge, non-clipped info) */}
                      <div className="flex-1 min-w-0" title={item.notes || undefined}>
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="font-medium text-foreground truncate">{item.name}</span>
                          <span className="flex-shrink-0 text-sm tabular-nums text-muted-foreground whitespace-nowrap font-medium">
                            {item.quantity} {item.unit}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground min-w-0 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium text-[11px] truncate">
                            {item.location || 'Pantry'}
                          </span>
                          {expiryLabel && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`whitespace-nowrap ${
                                  isExpired
                                    ? 'text-destructive font-medium'
                                    : isExpiringSoon
                                    ? 'text-amber-700 dark:text-amber-300 font-medium'
                                    : ''
                                }`}
                              >
                                {expiryLabel}
                              </span>
                            </>
                          )}
                          {item.isLowStock && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border border-red-300 dark:border-red-800">
                              <AlertTriangle size={10} className="text-red-600 dark:text-red-400" strokeWidth={1.5} />
                              Low stock
                            </span>
                          )}
                          {item.notes && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate min-w-0">{item.notes}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Quantity stepper */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, -0.5)}
                          className="w-9 h-9 rounded-md border border-border bg-card hover:bg-accent transition-colors inline-flex items-center justify-center text-lg font-medium"
                          aria-label={`Decrease quantity of ${item.name}`}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, 0.5)}
                          className="w-9 h-9 rounded-md border border-border bg-card hover:bg-accent transition-colors inline-flex items-center justify-center text-lg font-medium"
                          aria-label={`Increase quantity of ${item.name}`}
                        >
                          +
                        </button>
                      </div>

                      {/* Actions: Edit (#32) & Delete */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="w-9 h-9 rounded-md border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center"
                          aria-label={`Edit ${item.name}`}
                          title="Edit item"
                        >
                          <Pencil size={16} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="w-9 h-9 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center justify-center"
                          aria-label={`Delete ${item.name}`}
                          title="Delete item"
                        >
                          <Trash2 size={16} strokeWidth={1.5} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
