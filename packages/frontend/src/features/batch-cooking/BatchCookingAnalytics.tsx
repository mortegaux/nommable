import { useState, useEffect } from 'react';
import { Package, Refrigerator, Snowflake, UtensilsCrossed } from 'lucide-react';
import { batchCookingApi } from '@/services/api';

interface BatchCookingStats {
  totalPlans: number;
  completedPlans: number;
  totalBatches: number;
  totalServings: number;
  mostBatchedRecipes: Array<{
    recipeId: string;
    recipeTitle: string;
    timesCooked: number;
    totalBatches: number;
  }>;
  storageMethodBreakdown: {
    refrigerate: number;
    freeze: number;
    pantry: number;
  };
  estimatedMoneySaved: number;
  estimatedTimeSaved: number;
}

export function BatchCookingAnalytics() {
  const [stats, setStats] = useState<BatchCookingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await batchCookingApi.getAnalytics();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading analytics</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <div className="text-4xl font-medium tabular-nums text-foreground mb-2">{stats.totalPlans}</div>
          <div className="text-sm text-muted-foreground">Total plans</div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.completedPlans} completed
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <div className="text-4xl font-medium tabular-nums text-foreground mb-2">{stats.totalBatches}</div>
          <div className="text-sm text-muted-foreground">Total batches</div>
          <div className="text-xs text-muted-foreground mt-1">
            Cooked across all plans
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <div className="text-4xl font-medium tabular-nums text-foreground mb-2">
            ${stats.estimatedMoneySaved.toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground">Money saved</div>
          <div className="text-xs text-muted-foreground mt-1">
            vs. restaurant/takeout
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <div className="text-4xl font-medium tabular-nums text-foreground mb-2">
            {stats.estimatedTimeSaved}h
          </div>
          <div className="text-sm text-muted-foreground">Time saved</div>
          <div className="text-xs text-muted-foreground mt-1">
            Through batch cooking
          </div>
        </div>
      </div>

      {/* Total Servings Card */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Total servings prepared
            </div>
            <div className="text-5xl font-medium tabular-nums text-foreground">
              {stats.totalServings.toLocaleString()}
            </div>
          </div>
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Most Batched Recipes */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-base font-medium text-foreground mb-4">
            Most batched recipes
          </h3>
          {stats.mostBatchedRecipes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No recipes batched yet
            </p>
          ) : (
            <div className="space-y-3">
              {stats.mostBatchedRecipes.map((recipe, index) => (
                <div
                  key={recipe.recipeId}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-medium tabular-nums">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        {recipe.recipeTitle}
                      </div>
                      <div className="font-mono text-[13px] tabular-nums text-muted-foreground">
                        {recipe.totalBatches} batches
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-medium tabular-nums text-foreground">
                      {recipe.timesCooked}x
                    </div>
                    <div className="text-xs text-muted-foreground">cooked</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Storage Method Breakdown */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-base font-medium text-foreground mb-4">
            Storage method breakdown
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Snowflake className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">Freeze</span>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {stats.storageMethodBreakdown.freeze}
                </span>
              </div>
              <div className="w-full bg-accent rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-[width]"
                  style={{
                    width: `${
                      stats.totalPlans > 0
                        ? (stats.storageMethodBreakdown.freeze / stats.totalPlans) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Refrigerator className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">Refrigerate</span>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {stats.storageMethodBreakdown.refrigerate}
                </span>
              </div>
              <div className="w-full bg-accent rounded-full h-2">
                <div
                  className="bg-secondary h-2 rounded-full transition-[width]"
                  style={{
                    width: `${
                      stats.totalPlans > 0
                        ? (stats.storageMethodBreakdown.refrigerate / stats.totalPlans) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">Pantry</span>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {stats.storageMethodBreakdown.pantry}
                </span>
              </div>
              <div className="w-full bg-accent rounded-full h-2">
                <div
                  className="bg-accent-foreground h-2 rounded-full transition-[width]"
                  style={{
                    width: `${
                      stats.totalPlans > 0
                        ? (stats.storageMethodBreakdown.pantry / stats.totalPlans) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-muted border border-border">
            <p className="text-xs text-muted-foreground text-center">
              Money saved estimate assumes $8/serving vs restaurant. Time saved assumes 30% efficiency gain per additional batch.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
