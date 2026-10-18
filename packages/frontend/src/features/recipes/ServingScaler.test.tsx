import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServingScaler } from './ServingScaler';

describe('ServingScaler (issue #13)', () => {
  it('renders the five scale options with serving counts', () => {
    render(<ServingScaler servings={4} multiplier={1} onMultiplierChange={vi.fn()} />);
    const select = screen.getByLabelText('Adjust servings');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '0.5x (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1x (4)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1.5x (6)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2x (8)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '3x (12)' })).toBeInTheDocument();
  });

  it('reports the chosen multiplier on change', () => {
    const onChange = vi.fn();
    render(<ServingScaler servings={4} multiplier={1} onMultiplierChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Adjust servings'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('hides the adjusted-servings readout at 1x', () => {
    render(<ServingScaler servings={4} multiplier={1} onMultiplierChange={vi.fn()} />);
    expect(screen.queryByText(/Adjusted for/)).toBeNull();
  });

  it('shows the adjusted-servings readout when scaled', () => {
    render(<ServingScaler servings={4} multiplier={2} onMultiplierChange={vi.fn()} />);
    expect(screen.getByText(/Adjusted for/)).toHaveTextContent('8');
  });

  it('rounds half-serving counts the same way the old inline control did', () => {
    // 5 servings at 0.5x → Math.round(2.5) = 3, matching the original labels.
    render(<ServingScaler servings={5} multiplier={0.5} onMultiplierChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: '0.5x (3)' })).toBeInTheDocument();
    expect(screen.getByText(/Adjusted for/)).toHaveTextContent('2.5');
  });
});
