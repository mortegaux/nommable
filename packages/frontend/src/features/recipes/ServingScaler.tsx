/**
 * ServingScaler — the recipe servings scaler (issue #13).
 *
 * Extracted from RecipeDetailPage so the scaler is a self-contained,
 * testable unit. It renders as its own block inside the ingredients
 * section (heading → scaler → ingredient list) instead of wedged beside
 * the "Ingredients" heading, where it read as an afterthought.
 *
 * Behavior is identical to the original inline control: the same five
 * scale options, the same serving-count labels, and the same
 * "Adjusted for N servings" readout shown only when the scale changes
 * the serving count. All scaling math still lives in the parent via
 * `multiplier` / `onMultiplierChange`.
 */
interface ServingScalerProps {
  /** The recipe's base serving count (1x). */
  servings: number;
  /** Current scale multiplier (0.5, 1, 1.5, 2, or 3). */
  multiplier: number;
  onMultiplierChange: (multiplier: number) => void;
}

export function ServingScaler({ servings, multiplier, onMultiplierChange }: ServingScalerProps) {
  const adjustedServings = servings * multiplier;

  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="serving-scaler" className="text-sm font-medium text-foreground">
          Adjust servings
        </label>
        <select
          id="serving-scaler"
          value={multiplier}
          onChange={(e) => onMultiplierChange(parseFloat(e.target.value))}
          className="px-2 py-1 rounded border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Adjust servings"
        >
          <option value={0.5}>0.5x ({Math.round(servings * 0.5)})</option>
          <option value={1}>1x ({servings})</option>
          <option value={1.5}>1.5x ({Math.round(servings * 1.5)})</option>
          <option value={2}>2x ({servings * 2})</option>
          <option value={3}>3x ({servings * 3})</option>
        </select>
        {adjustedServings !== servings && (
          <p className="text-sm text-muted-foreground">
            Adjusted for <span className="font-semibold text-foreground">{adjustedServings}</span> servings
          </p>
        )}
      </div>
    </div>
  );
}
