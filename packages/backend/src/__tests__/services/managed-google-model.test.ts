import axios from 'axios';
import {
  MANAGED_GOOGLE_FLASH_FALLBACKS,
  MANAGED_GOOGLE_FLASH_IMAGE_FALLBACKS,
  clearManagedGoogleModelCache,
  managedGoogleFlashChain,
  managedGoogleFlashImageChain,
  resolveManagedGoogleImageModel,
  resolveManagedGoogleModel,
  selectManagedGoogleFlash,
  selectManagedGoogleFlashImage,
} from '../../services/ai/managed-google-model';

jest.mock('axios');
const mockedGet = axios.get as jest.Mock;

function liveListEntry(id: string, methods: string[] = ['generateContent']) {
  return { name: `models/${id}`, supportedGenerationMethods: methods };
}

describe('selectManagedGoogleFlash', () => {
  it('picks the newest stable Flash from a realistic live list', () => {
    expect(
      selectManagedGoogleFlash([
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-2.5-pro',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash-tts',
        'gemini-3.1-flash-image',
        'gemini-2.0-flash-001',
        'gemini-embedding-001',
        'gemini-3-flash-preview',
      ])
    ).toBe('gemini-3.8-flash');
  });

  it('orders by version, not by list position', () => {
    expect(
      selectManagedGoogleFlash(['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'])
    ).toBe('gemini-3.6-flash');
  });

  it('prefers the main Flash tier over a newer Flash-Lite', () => {
    expect(selectManagedGoogleFlash(['gemini-3.5-flash', 'gemini-3.8-flash-lite'])).toBe(
      'gemini-3.5-flash'
    );
  });

  it('falls back to the newest stable Flash-Lite when no main Flash exists', () => {
    expect(
      selectManagedGoogleFlash(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-pro'])
    ).toBe('gemini-3.5-flash-lite');
  });

  it('accepts a preview Flash only when no stable Flash exists', () => {
    expect(selectManagedGoogleFlash(['gemini-3-flash-preview', 'gemini-2.5-pro'])).toBe(
      'gemini-3-flash-preview'
    );
  });

  it('never selects Pro or capability variants', () => {
    expect(
      selectManagedGoogleFlash([
        'gemini-2.5-pro',
        'gemini-3.8-flash-tts',
        'gemini-3.8-live',
        'gemini-3.1-flash-image',
        'gemini-embedding-001',
      ])
    ).toBeNull();
  });

  it('ignores versioned -001 aliases in favour of the stable alias', () => {
    expect(selectManagedGoogleFlash(['gemini-3.6-flash-001', 'gemini-3.6-flash'])).toBe(
      'gemini-3.6-flash'
    );
    expect(selectManagedGoogleFlash(['gemini-3.6-flash-001'])).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(selectManagedGoogleFlash([])).toBeNull();
  });
});

describe('managedGoogleFlashChain', () => {
  it('puts the resolved model first, then the static fallbacks', () => {
    expect(managedGoogleFlashChain('gemini-3.8-flash')).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash',
    ]);
  });

  it('does not duplicate the resolved model when it is already in the chain', () => {
    expect(managedGoogleFlashChain('gemini-2.5-flash')).toEqual([
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ]);
  });
});

describe('resolveManagedGoogleModel', () => {
  beforeEach(() => {
    clearManagedGoogleModelCache();
    jest.clearAllMocks();
  });

  it('resolves the newest stable Flash from the live list', async () => {
    mockedGet.mockResolvedValue({
      data: {
        models: [
          liveListEntry('gemini-2.5-flash'),
          liveListEntry('gemini-3.8-flash'),
          liveListEntry('gemini-embedding-001', ['embedContent']),
        ],
      },
    });
    await expect(resolveManagedGoogleModel('test-key')).resolves.toBe('gemini-3.8-flash');
  });

  it('falls back to the static chain head when the live list fetch fails', async () => {
    mockedGet.mockRejectedValue(new Error('network down'));
    await expect(resolveManagedGoogleModel('test-key')).resolves.toBe(
      MANAGED_GOOGLE_FLASH_FALLBACKS[0]
    );
  });

  it('falls back to the static chain head when the live list has no Flash model', async () => {
    mockedGet.mockResolvedValue({
      data: { models: [liveListEntry('gemini-2.5-pro')] },
    });
    await expect(resolveManagedGoogleModel('test-key')).resolves.toBe(
      MANAGED_GOOGLE_FLASH_FALLBACKS[0]
    );
  });

  it('caches the live list so repeat resolutions do not refetch within the hour', async () => {
    mockedGet.mockResolvedValue({
      data: { models: [liveListEntry('gemini-3.6-flash')] },
    });
    await resolveManagedGoogleModel('test-key');
    await resolveManagedGoogleModel('test-key');
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});

describe('selectManagedGoogleFlashImage', () => {
  it('picks the newest stable Flash image model from a realistic live list', () => {
    expect(
      selectManagedGoogleFlashImage([
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image',
        'gemini-2.5-pro',
        'gemini-3-pro-image-preview',
      ])
    ).toBe('gemini-3.1-flash-image');
  });

  it('orders by version, not by list position', () => {
    expect(
      selectManagedGoogleFlashImage(['gemini-2.5-flash-image', 'gemini-3.1-flash-image'])
    ).toBe('gemini-3.1-flash-image');
  });

  it('accepts a preview image model only when no stable image model exists', () => {
    expect(
      selectManagedGoogleFlashImage(['gemini-3-flash-image-preview', 'gemini-2.5-flash'])
    ).toBe('gemini-3-flash-image-preview');
  });

  it('never selects text Flash, Pro image, -001 aliases, or 2.0-era exp-image ids', () => {
    expect(
      selectManagedGoogleFlashImage([
        'gemini-3.8-flash',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image-001',
        'gemini-2.0-flash-exp-image',
        'gemini-embedding-001',
      ])
    ).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(selectManagedGoogleFlashImage([])).toBeNull();
  });
});

describe('managedGoogleFlashImageChain', () => {
  it('puts the resolved image model first, then the static fallbacks', () => {
    expect(managedGoogleFlashImageChain('gemini-3.1-flash-image')).toEqual([
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
    ]);
  });

  it('does not duplicate the resolved model when it is already in the chain', () => {
    expect(managedGoogleFlashImageChain('gemini-2.5-flash-image')).toEqual([
      'gemini-2.5-flash-image',
    ]);
  });
});

describe('resolveManagedGoogleImageModel', () => {
  beforeEach(() => {
    clearManagedGoogleModelCache();
    jest.clearAllMocks();
  });

  it('resolves the newest stable Flash image model from the live list', async () => {
    mockedGet.mockResolvedValue({
      data: {
        models: [
          liveListEntry('gemini-3.8-flash'),
          liveListEntry('gemini-2.5-flash-image'),
          liveListEntry('gemini-3.1-flash-image'),
        ],
      },
    });
    await expect(resolveManagedGoogleImageModel('test-key')).resolves.toBe(
      'gemini-3.1-flash-image'
    );
  });

  it('falls back to the static image chain head when the live list fetch fails', async () => {
    mockedGet.mockRejectedValue(new Error('network down'));
    await expect(resolveManagedGoogleImageModel('test-key')).resolves.toBe(
      MANAGED_GOOGLE_FLASH_IMAGE_FALLBACKS[0]
    );
  });

  it('falls back to the static image chain head when the live list has no image model', async () => {
    mockedGet.mockResolvedValue({
      data: { models: [liveListEntry('gemini-3.8-flash')] },
    });
    await expect(resolveManagedGoogleImageModel('test-key')).resolves.toBe(
      MANAGED_GOOGLE_FLASH_IMAGE_FALLBACKS[0]
    );
  });
});
