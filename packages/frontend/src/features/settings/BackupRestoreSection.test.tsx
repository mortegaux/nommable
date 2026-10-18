import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackupRestoreSection } from '@/features/settings/BackupRestoreSection';
import { useAuthStore } from '@/store/auth.store';
import { UserRole, type User } from '@nommable/shared';
import type { BackupPreview } from '@nommable/shared';

const mockGetSystemStatus = vi.fn();
const mockExportBackup = vi.fn();
const mockPreviewRestore = vi.fn();
const mockConfirmRestore = vi.fn();
const mockListServerBackups = vi.fn();
const mockDownloadServerBackup = vi.fn();
const mockPreviewServerRestore = vi.fn();

vi.mock('@/services/api', () => ({
  settingsApi: {
    getSystemStatus: (...args: unknown[]) => mockGetSystemStatus(...args),
    exportBackup: (...args: unknown[]) => mockExportBackup(...args),
    previewRestore: (...args: unknown[]) => mockPreviewRestore(...args),
    confirmRestore: (...args: unknown[]) => mockConfirmRestore(...args),
    listServerBackups: (...args: unknown[]) => mockListServerBackups(...args),
    downloadServerBackup: (...args: unknown[]) => mockDownloadServerBackup(...args),
    previewServerRestore: (...args: unknown[]) => mockPreviewServerRestore(...args),
  },
}));

const adminUser: User = {
  id: 'u1',
  email: 'admin@example.com',
  username: 'admin',
  role: UserRole.ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const plainUser: User = { ...adminUser, id: 'u2', username: 'cook', role: UserRole.USER };

const validPreview: BackupPreview = {
  token: 'preview-token-123',
  manifest: {
    formatVersion: 1,
    appVersion: '1.2.0',
    createdAt: '2026-10-18T12:00:00.000Z',
    schemaVersion: ['InitialSchema1788000000000'],
    counts: {
      recipes: 3,
      images: 2,
      users: 1,
      mealPlans: 1,
      shoppingLists: 1,
      pantryItems: 4,
      batchPlans: 0,
    },
    dbFile: 'database.db',
    uploadsPrefix: 'uploads/',
    uploadFileCount: 2,
  },
  counts: {
    recipes: 3,
    images: 2,
    users: 1,
    mealPlans: 1,
    shoppingLists: 1,
    pantryItems: 4,
    batchPlans: 0,
  },
  validation: { valid: true, errors: [], warnings: [] },
  archiveSizeBytes: 29599,
  expiresAt: '2026-10-18T13:00:00.000Z',
};

function renderSection() {
  return render(
    <MemoryRouter>
      <BackupRestoreSection />
    </MemoryRouter>
  );
}

describe('BackupRestoreSection (issue #71)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemStatus.mockResolvedValue({
      data: { lastBackup: { status: 'not-configured', at: null, lastRestoreAt: null } },
    });
    mockListServerBackups.mockResolvedValue({ data: { backups: [] } });
  });

  it('renders the Backup & Restore section for admins', () => {
    useAuthStore.setState({ user: adminUser } as never);
    renderSection();
    expect(screen.getByText('Backup & Restore')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download Backup' })).toBeTruthy();
    expect(screen.getByLabelText('Backup archive (.zip)')).toBeTruthy();
  });

  it('refuses non-admins', () => {
    useAuthStore.setState({ user: plainUser } as never);
    renderSection();
    expect(screen.getByText('Only admins can manage backups.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download Backup' })).toBeNull();
  });

  it('export triggers a download and shows success', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    const blob = new Blob(['fake-zip'], { type: 'application/zip' });
    mockExportBackup.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="nommable-backup-123.zip"' },
    });
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Download Backup' }));
    await waitFor(() => expect(mockExportBackup).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    await waitFor(() => expect(screen.getByText('Backup downloaded.')).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it('restore preview → confirm flow applies the restore', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockPreviewRestore.mockResolvedValue({ data: validPreview });
    mockConfirmRestore.mockResolvedValue({ data: { message: 'Restore applied.', restarting: true } });
    renderSection();

    const file = new File(['fake-zip'], 'nommable-backup-123.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Backup archive (.zip)'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview Restore' }));
    await waitFor(() => expect(mockPreviewRestore).toHaveBeenCalledTimes(1));
    // Preview shows the manifest + verified counts.
    expect(screen.getByText('Backup preview')).toBeTruthy();
    expect(screen.getByText('1.2.0')).toBeTruthy();
    // Restore requires the explicit checkbox first: the button exists but is disabled.
    const restoreButton = screen.getByRole('button', { name: 'Restore Backup' });
    expect((restoreButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(/I understand this will replace all current data/));
    expect((restoreButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Backup' }));
    await waitFor(() =>
      expect(mockConfirmRestore).toHaveBeenCalledWith('preview-token-123')
    );
    await waitFor(() => expect(screen.getByText('Restore applied')).toBeTruthy());
  });

  it('an invalid preview blocks the restore', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockPreviewRestore.mockResolvedValue({
      data: {
        ...validPreview,
        validation: { valid: false, errors: ['Manifest counts do not match database'], warnings: [] },
      },
    });
    renderSection();
    const file = new File(['fake-zip'], 'bad.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Backup archive (.zip)'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview Restore' }));
    await waitFor(() => expect(screen.getByText('This backup failed validation')).toBeTruthy());
    expect(screen.getByText('Manifest counts do not match database')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore Backup' })).toBeNull();
  });

  it('a preview failure shows an error', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockPreviewRestore.mockRejectedValue({
      response: { data: { error: 'Not a valid backup archive' } },
    });
    renderSection();
    const file = new File(['not-a-zip'], 'bad.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Backup archive (.zip)'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview Restore' }));
    await waitFor(() => expect(screen.getByText('Not a valid backup archive')).toBeTruthy());
  });

  it('lists server backups with kind badges and per-entry actions (issue #74)', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockListServerBackups.mockResolvedValue({
      data: {
        backups: [
          {
            name: 'safety-2026-10-18T12-00-00-000Z.zip',
            sizeBytes: 29599,
            createdAt: '2026-10-18T12:00:00.000Z',
            kind: 'safety',
            status: 'ok',
          },
          {
            name: 'nommable-backup-2026-10-17T10-00-00-000Z.zip',
            sizeBytes: 12345,
            createdAt: '2026-10-17T10:00:00.000Z',
            kind: 'export',
            status: 'ok',
          },
        ],
      },
    });
    renderSection();
    await waitFor(() => expect(mockListServerBackups).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Backups on this server')).toBeTruthy();
    expect(screen.getByText('safety-2026-10-18T12-00-00-000Z.zip')).toBeTruthy();
    expect(screen.getByText('Safety')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(2);
  });

  it('shows an empty state when no server backups exist', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    renderSection();
    await waitFor(() => expect(mockListServerBackups).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/No backups on this server yet/)).toBeTruthy();
  });

  it('an unreadable entry shows its reason and offers no actions', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockListServerBackups.mockResolvedValue({
      data: {
        backups: [
          {
            name: 'corrupt.zip',
            sizeBytes: 0,
            createdAt: '2026-10-18T12:00:00.000Z',
            kind: 'export',
            status: 'unreadable',
            error: 'File is empty',
          },
        ],
      },
    });
    renderSection();
    await waitFor(() => expect(screen.getByText('corrupt.zip')).toBeTruthy());
    expect(screen.getByText(/Unreadable · File is empty/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('a list failure degrades gracefully (warning, export still works)', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockListServerBackups.mockRejectedValue(new Error('boom'));
    renderSection();
    await waitFor(() =>
      expect(screen.getByText(/Could not load server backups/)).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: 'Download Backup' })).toBeTruthy();
  });

  it('download from the list triggers a download', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockListServerBackups.mockResolvedValue({
      data: {
        backups: [
          {
            name: 'safety-1.zip',
            sizeBytes: 100,
            createdAt: '2026-10-18T12:00:00.000Z',
            kind: 'safety',
            status: 'ok',
          },
        ],
      },
    });
    const blob = new Blob(['fake-zip'], { type: 'application/zip' });
    mockDownloadServerBackup.mockResolvedValue({ data: blob, headers: {} });
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    renderSection();
    await waitFor(() => expect(screen.getByText('safety-1.zip')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(mockDownloadServerBackup).toHaveBeenCalledWith('safety-1.zip')
    );
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    vi.unstubAllGlobals();
  });

  it('restore from the list goes through the same preview → confirm flow', async () => {
    useAuthStore.setState({ user: adminUser } as never);
    mockListServerBackups.mockResolvedValue({
      data: {
        backups: [
          {
            name: 'safety-1.zip',
            sizeBytes: 100,
            createdAt: '2026-10-18T12:00:00.000Z',
            kind: 'safety',
            status: 'ok',
          },
        ],
      },
    });
    mockPreviewServerRestore.mockResolvedValue({ data: validPreview });
    mockConfirmRestore.mockResolvedValue({ data: { message: 'Restore applied.', restarting: true } });
    renderSection();
    await waitFor(() => expect(screen.getByText('safety-1.zip')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(mockPreviewServerRestore).toHaveBeenCalledWith('safety-1.zip')
    );
    expect(screen.getByText('Backup preview')).toBeTruthy();
    const restoreButton = screen.getByRole('button', { name: 'Restore Backup' });
    expect((restoreButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(/I understand this will replace all current data/));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Backup' }));
    await waitFor(() =>
      expect(mockConfirmRestore).toHaveBeenCalledWith('preview-token-123')
    );
    await waitFor(() => expect(screen.getByText('Restore applied')).toBeTruthy());
  });
});
