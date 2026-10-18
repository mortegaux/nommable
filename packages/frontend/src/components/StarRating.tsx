import { useState } from 'react';

interface StarRatingProps {
  rating: number | null;
  onChange: (rating: number | null) => void;
  size?: 'sm' | 'md';
  readonly?: boolean;
}

export function StarRating({ rating, onChange, size = 'md', readonly = false }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  // 44px touch targets (WCAG 2.5.8); the SVG star stays 24px, centered by padding.
  const buttonSize = size === 'sm' ? 'w-9 h-9 p-1.5' : 'w-11 h-11 p-2.5';

  return (
    <div role="radiogroup" aria-label="Star rating" className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={rating === star}
          aria-label={`Rate ${star} of 5 stars`}
          disabled={readonly}
          onClick={() => !readonly && onChange(rating === star ? null : star)}
          onMouseEnter={() => !readonly && setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onFocus={() => !readonly && setHovered(star)}
          onBlur={() => setHovered(0)}
          className={`${buttonSize} ${readonly ? 'cursor-default' : 'cursor-pointer'} rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
        >
          <svg
            viewBox="0 0 24 24"
            fill={(hovered || rating || 0) >= star ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
            className={`w-full h-full ${(hovered || rating || 0) >= star ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
