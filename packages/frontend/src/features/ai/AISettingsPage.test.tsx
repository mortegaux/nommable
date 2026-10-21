import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aiApi } from '@/services/api';
import AISettingsPage from './AISettingsPage';

vi.mock('@/services/api', () => ({
  aiApi: {
    getConfig: vi.fn(),
    getModels: vi.fn(),
    updateConfig: vi.fn(),
    createConfig: vi.fn(),
    testConnection: vi.fn(),
  },
}));

vi.mock('@/hooks/useAIStatus', () => ({
  invalidateAIStatus: vi.fn(),
}));

const mockedGetConfig = aiApi.getConfig as unknown as ReturnType<typeof vi.fn>;
const mockedGetModels = aiApi.getModels as unknown as ReturnType<typeof vi.fn>;

const openRouterImageModels = [
  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    description: 'Fast image generation',
    isDefault: true,
  },
  {
    id: 'black-forest-labs/flux-2-dev',
    name: 'FLUX 2 Dev',
    description: 'Crisp detail',
  },
];

function mockModels() {
  mockedGetModels.mockImplementation((params: any) => {
    if (params?.type === 'image') {
      return Promise.resolve({ data: { models: openRouterImageModels } });
    }
    return Promise.resolve({ data: { models: [] } });
  });
}

async function renderPage() {
  render(<AISettingsPage />);
  await waitFor(() => {
    expect(screen.getByLabelText('AI Provider')).toBeInTheDocument();
  });
}

async function selectProvider(user: ReturnType<typeof userEvent.setup>, value: string) {
  const select = screen.getByLabelText('AI Provider');
  await user.selectOptions(select, value);
  await waitFor(() => {
    expect((select as HTMLSelectElement).value).toBe(value);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // No saved config -> fresh form, defaults to the OpenAI text model list.
  mockedGetConfig.mockRejectedValue({ response: { status: 404 } });
  mockModels();
});

describe('AISettingsPage — OpenRouter (issue #61)', () => {
  it('offers OpenRouter in the provider dropdown', async () => {
    await renderPage();
    const select = screen.getByLabelText('AI Provider');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('OpenRouter (one key, many models)');
  });

  it('shows OpenRouter setup help and key coverage when selected', async () => {
    const user = userEvent.setup();
    await renderPage();
    await selectProvider(user, 'openrouter');

    await waitFor(() => {
      expect(screen.getByText('OpenRouter Setup')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/all from this one key\. Billing stays on your OpenRouter account\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/openrouter\.ai\/keys/)).toBeInTheDocument();
  });

  it('discovers OpenRouter image models from the live catalog', async () => {
    const user = userEvent.setup();
    await renderPage();
    await selectProvider(user, 'openrouter');

    // The image catalog is fetched with type: 'image'
    await waitFor(() => {
      expect(mockedGetModels).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'openrouter', type: 'image' })
      );
    });

    const imageSelect = screen.getByLabelText('Image Generation Model (Optional)');
    await waitFor(() => {
      expect(within(imageSelect).getByRole('option', { name: /FLUX 2 Dev/ })).toBeInTheDocument();
    });
    // Default option label reflects the OpenRouter image default
    expect(
      within(imageSelect).getByRole('option', { name: /Default \(OpenRouter recommended image model\)/ })
    ).toBeInTheDocument();
  });

  it('shows the OpenRouter image-key box when an OpenRouter image model is picked under another provider', async () => {
    const user = userEvent.setup();
    await renderPage();

    // Stay on OpenAI (default) but type an OpenRouter slug as a custom image model
    const imageSelect = screen.getByLabelText('Image Generation Model (Optional)');
    await user.selectOptions(imageSelect, '__custom__');
    const customInput = screen.getByPlaceholderText(/gpt-image-1\.5, gemini-2\.0-flash/);
    await user.clear(customInput);
    await user.type(customInput, 'google/gemini-2.5-flash-image');

    await waitFor(() => {
      expect(screen.getByText('OpenRouter API Key for Images (Optional)')).toBeInTheDocument();
    });
  });

  it('keeps the OpenAI image catalog static (no regression)', async () => {
    const user = userEvent.setup();
    await renderPage();
    await selectProvider(user, 'openai');

    const imageSelect = screen.getByLabelText('Image Generation Model (Optional)');
    expect(
      within(imageSelect).getByRole('option', { name: /GPT-Image 1\.5 \(Recommended \/ Fast\)/ })
    ).toBeInTheDocument();
    // No live image-catalog fetch for OpenAI (static optgroups)
    expect(mockedGetModels).not.toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', type: 'image' })
    );
  });
});

describe('AISettingsPage — managed instance', () => {
  it('shows the managed panel and no key form when the instance uses the managed key', async () => {
    mockedGetConfig.mockResolvedValue({
      data: {
        managed: true,
        envProviders: ['openai'],
        provider: null,
        model: null,
        imageModel: null,
        baseUrl: null,
        enabled: true,
        aiMode: 'shared',
        hasApiKey: false,
        hasImageApiKey: false,
      },
    });

    render(<AISettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /managed ai/i })).toBeInTheDocument();
    });
    // No key-mode radios, provider/key form, or save/test actions.
    expect(screen.queryByText('Key mode')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('AI Provider')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API Key/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    // The operator-configured provider is named.
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/credits/i)).toBeInTheDocument();
  });
});
