import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Callout } from './Callout';

describe('Callout (issue #27)', () => {
  it.each([
    ['info', 'bg-info-soft'],
    ['success', 'bg-success-soft'],
    ['warning', 'bg-warning-soft'],
    ['error', 'bg-destructive-soft'],
  ] as const)('tone %s uses its semantic soft token', (tone, cls) => {
    const { container } = render(<Callout tone={tone}>Body</Callout>);
    expect(container.firstChild).toHaveClass(cls);
  });

  it('renders title and children', () => {
    render(<Callout tone="error" title="Couldn't load analytics">Details here</Callout>);
    expect(screen.getByText("Couldn't load analytics")).toBeInTheDocument();
    expect(screen.getByText('Details here')).toBeInTheDocument();
  });

  it('passes through role for announcements', () => {
    render(<Callout tone="error" role="alert">Boom</Callout>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
