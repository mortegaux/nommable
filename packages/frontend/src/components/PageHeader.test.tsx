import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader (issue #27)', () => {
  it('renders the title with the page-title type style', () => {
    render(<PageHeader title="Collections" />);
    const heading = screen.getByRole('heading', { name: 'Collections' });
    expect(heading.tagName).toBe('H1');
    expect(heading.className).toContain('text-3xl');
    expect(heading.className).toContain('font-bold');
  });

  it('renders the subtitle (entity count / purpose) under the title', () => {
    render(<PageHeader title="Collections" subtitle="12 collections" />);
    expect(screen.getByText('12 collections')).toBeInTheDocument();
  });

  it('renders primary and secondary actions', () => {
    render(
      <PageHeader
        title="Collections"
        primaryAction={<button>Create Collection</button>}
        secondaryActions={<button>Templates</button>}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Create Collection' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeInTheDocument();
  });

  it('renders no action container when no actions are given', () => {
    const { container } = render(<PageHeader title="Categories & Tags" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a title adornment inside the heading', () => {
    render(
      <PageHeader
        title="Meal Analytics"
        titleAdornment={<span data-testid="adornment">?</span>}
      />
    );
    expect(screen.getByTestId('adornment')).toBeInTheDocument();
  });
});
