import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PantryPage from '../features/pantry/PantryPage';
import { pantryApi } from '@/services/api';

vi.mock('@/services/api', () => ({
  pantryApi: {
    getAll: vi.fn(),
    getExpiring: vi.fn(),
    getLowStock: vi.fn(),
    getLocations: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    toggleLowStock: vi.fn(),
    updateQuantity: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
  },
}));

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  aiNotConfiguredClass: 'opacity-50',
  AISetupBadge: () => <span>AI Setup</span>,
}));

const mockItems = [
  {
    id: 'item-1',
    name: 'Basmati Rice',
    quantity: 2,
    unit: 'kg',
    category: 'Grains & Pasta',
    location: 'Pantry',
    isLowStock: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'item-2',
    name: 'Whole Milk',
    quantity: 0.5,
    unit: 'L',
    category: 'Dairy',
    location: 'Refrigerator',
    isLowStock: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockLocations = [
  { name: 'Pantry', isDefault: true, itemCount: 1 },
  { name: 'Refrigerator', isDefault: true, itemCount: 1 },
  { name: 'Freezer', isDefault: true, itemCount: 0 },
  { name: 'Spice Rack', isDefault: true, itemCount: 0 },
  { name: 'Cabinet', isDefault: true, itemCount: 0 },
  { name: 'Other', isDefault: true, itemCount: 0 },
];

describe('PantryPage (#30, #31, #32, #33)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pantryApi.getAll as any).mockResolvedValue({ data: mockItems });
    (pantryApi.getExpiring as any).mockResolvedValue({ data: [] });
    (pantryApi.getLowStock as any).mockResolvedValue({ data: [mockItems[1]] });
    (pantryApi.getLocations as any).mockResolvedValue({ data: mockLocations });
  });

  it('renders pantry items in responsive grid with prominent low-stock visual distinction (#30)', async () => {
    const { container } = render(<PantryPage />);

    await waitFor(() => {
      expect(screen.getByText('Basmati Rice')).toBeInTheDocument();
      expect(screen.getByText('Whole Milk')).toBeInTheDocument();
    });

    // Check responsive grid container for wide screens
    const gridContainer = container.querySelector('.md\\:grid-cols-2');
    expect(gridContainer).toBeInTheDocument();

    // Check prominent low-stock styling & badge
    expect(screen.getByText('Low stock')).toBeInTheDocument();
  });

  it('provides an AlertTriangle low-stock button with clear accessible labels and tooltips (#31)', async () => {
    render(<PantryPage />);

    await waitFor(() => {
      expect(screen.getByText('Whole Milk')).toBeInTheDocument();
    });

    // Find the low-stock button for item-2 (Whole Milk - isLowStock: true)
    const lowStockBtn = screen.getByLabelText('Low stock active for Whole Milk — tap to clear flag');
    expect(lowStockBtn).toBeInTheDocument();
    expect(lowStockBtn).toHaveAttribute('aria-pressed', 'true');
    expect(lowStockBtn).toHaveAttribute('title', 'Low stock — tap to clear flag');

    // Click toggle
    (pantryApi.toggleLowStock as any).mockResolvedValue({ data: { ...mockItems[1], isLowStock: false } });
    fireEvent.click(lowStockBtn);
    expect(pantryApi.toggleLowStock).toHaveBeenCalledWith('item-2');
  });

  it('opens pre-filled edit dialog and submits updates on save (#32)', async () => {
    render(<PantryPage />);

    await waitFor(() => {
      expect(screen.getByText('Basmati Rice')).toBeInTheDocument();
    });

    // Click Edit button for Basmati Rice
    const editBtn = screen.getByLabelText('Edit Basmati Rice');
    fireEvent.click(editBtn);

    // Dialog appears with pre-filled inputs
    expect(screen.getByText('Edit "Basmati Rice"')).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Item name *');
    expect(nameInput).toHaveValue('Basmati Rice');

    // Change quantity and submit
    const qtyInput = screen.getByLabelText('Quantity *');
    fireEvent.change(qtyInput, { target: { value: '3.5' } });

    (pantryApi.update as any).mockResolvedValue({ data: { ...mockItems[0], quantity: 3.5 } });
    const saveBtn = screen.getByRole('button', { name: 'Save changes' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(pantryApi.update).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          name: 'Basmati Rice',
          quantity: 3.5,
        })
      );
    });
  });

  it('opens storage locations manager modal and lists locations with item counts (#33)', async () => {
    render(<PantryPage />);

    await waitFor(() => {
      expect(screen.getByText('Basmati Rice')).toBeInTheDocument();
    });

    // Click Locations button in header
    const locationsBtn = screen.getByRole('button', { name: 'Manage storage locations' });
    fireEvent.click(locationsBtn);

    // Verify modal header and locations list
    expect(screen.getByText('Manage storage locations')).toBeInTheDocument();
    expect(screen.getByText('Configured locations (6)')).toBeInTheDocument();
    expect(screen.getAllByText('1 item').length).toBe(2);
  });
});
