interface PortionCalculatorProps {
  batches: number;
  servingsPerBatch: number;
  recipeServings?: number;
  onChange: (batches: number, servingsPerBatch: number) => void;
}

export function PortionCalculator({
  batches,
  servingsPerBatch,
  recipeServings,
  onChange,
}: PortionCalculatorProps) {
  const totalServings = batches * servingsPerBatch;
  const ingredientMultiplier = recipeServings
    ? (totalServings / recipeServings).toFixed(2)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Batches Input */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Number of batches
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={batches}
            onChange={(e) => onChange(parseInt(e.target.value) || 1, servingsPerBatch)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Min: 1, Max: 20</p>
        </div>

        {/* Servings per batch Input */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Servings per batch
          </label>
          <input
            type="number"
            min="1"
            value={servingsPerBatch}
            onChange={(e) => onChange(batches, parseInt(e.target.value) || 1)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Min: 1</p>
        </div>
      </div>

      {/* Calculation Display */}
      <div className="bg-muted border border-border rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-3xl font-medium tabular-nums text-foreground">{totalServings}</div>
            <div className="text-sm text-muted-foreground">Total servings</div>
          </div>
          {ingredientMultiplier && (
            <div>
              <div className="text-3xl font-medium tabular-nums text-foreground">{ingredientMultiplier}x</div>
              <div className="text-sm text-muted-foreground">Ingredient multiplier</div>
            </div>
          )}
        </div>
        {recipeServings && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Recipe makes {recipeServings} servings. You'll make {totalServings} servings total.
          </p>
        )}
      </div>
    </div>
  );
}
