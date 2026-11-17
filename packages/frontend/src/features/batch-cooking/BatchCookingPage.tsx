import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { batchCookingApi } from '@/services/api';
import { Calendar, Package, Pencil, Refrigerator, Snowflake, Trash2, UtensilsCrossed } from 'lucide-react';
import { CreateBatchPlanModal } from './CreateBatchPlanModal';
import { CreateBatchSessionModal } from './CreateBatchSessionModal';
import { EditBatchPlanModal } from './EditBatchPlanModal';
import { BatchCookingAnalytics } from './BatchCookingAnalytics';
import { useConfirmStore } from '@/store/confirm.store';
import { useToastStore } from '@/store/toast.store';
import { parseLocalDate } from './batchCookingDates';
import { PageHeader } from '@/components/PageHeader';
import { SectionTabs } from '@/components/SectionTabs';

interface Recipe {
  id: string;
  title: string;
  imageUrl?: string;
  categories: string[];
  cookTime?: number;
  servings?: number;
}

interface BatchCookingSuggestion {
  recipe: Recipe;
  batchFriendlyScore: number;
  reasons: string[];
  suggestedBatches: number;
  storageRecommendation: 'refrigerate' | 'freeze' | 'pantry';
  storageDuration: number;
}

interface BatchCookingPlan {
  id: string;
  name: string;
  description?: string;
  cookingDate: string;
  batches: number;
  servingsPerBatch: number;
  storageMethod: 'refrigerate' | 'freeze' | 'pantry';
  storageDuration: number;
  reheatingInstructions: string;
  prepNotes?: string;
  status: 'planned' | 'in-progress' | 'completed';
  prepChecklist?: Array<{
    task: string;
    completed: boolean;
    order: number;
  }>;
  recipe: Recipe;
}

const STORAGE_ICONS = {
  refrigerate: Refrigerator,
  freeze: Snowflake,
  pantry: Package,
};

const STATUS_COLORS = {
  planned: 'bg-muted text-muted-foreground border-border',
  'in-progress': 'bg-muted text-muted-foreground border-border',
  completed: 'bg-muted text-muted-foreground border-border',
};

export default function BatchCookingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'plans' | 'suggestions' | 'analytics'>('plans');
  const confirm = useConfirmStore((s) => s.confirm);
  const toast = useToastStore();
  const [plans, setPlans] = useState<BatchCookingPlan[]>([]);
  const [suggestions, setSuggestions] = useState<BatchCookingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [createPrefillData, setCreatePrefillData] = useState<any>(null);
  const [editingPlan, setEditingPlan] = useState<BatchCookingPlan | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansResponse, suggestionsResponse] = await Promise.all([
        batchCookingApi.getAll(),
        batchCookingApi.getSuggestions(),
      ]);
      setPlans(plansResponse.data || []);
      setSuggestions(suggestionsResponse.data || []);
    } catch (error) {
      console.error('Failed to load batch cooking data:', error);
      setPlans([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromSuggestion = (suggestion: BatchCookingSuggestion) => {
    setCreatePrefillData({
      recipe: suggestion.recipe,
      suggestedBatches: suggestion.suggestedBatches,
      storageRecommendation: suggestion.storageRecommendation,
      storageDuration: suggestion.storageDuration,
    });
    setShowCreateModal(true);
  };

  const handleStatusUpdate = async (planId: string, status: 'planned' | 'in-progress' | 'completed') => {
    try {
      await batchCookingApi.updateStatus(planId, status);
      await loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleChecklistToggle = async (plan: BatchCookingPlan, taskIndex: number) => {
    try {
      const updatedChecklist = plan.prepChecklist?.map((item, index) =>
        index === taskIndex ? { ...item, completed: !item.completed } : item
      );

      await batchCookingApi.updateChecklist(plan.id, updatedChecklist);
      await loadData();
    } catch (error) {
      console.error('Failed to update checklist:', error);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    const ok = await confirm({
      title: 'Delete batch cooking plan?',
      message: `Permanently delete "${plan?.name ?? 'this plan'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await batchCookingApi.delete(planId);
      await loadData();
      toast.success('Batch cooking plan deleted.');
    } catch (error) {
      console.error('Failed to delete plan:', error);
      toast.error('Failed to delete plan. Please try again.');
    }
  };

  const handleCreateShoppingList = async (planId: string) => {
    try {
      const response = await batchCookingApi.createShoppingList(planId);
      const shoppingListId = response.data.id;
      navigate('/shopping-lists', { state: { selectedListId: shoppingListId } });
    } catch (error) {
      console.error('Failed to create shopping list:', error);
      toast.error('Failed to create shopping list. Please try again.');
    }
  };

  const togglePlanSelection = (planId: string) => {
    const newSelected = new Set(selectedPlans);
    if (newSelected.has(planId)) {
      newSelected.delete(planId);
    } else {
      newSelected.add(planId);
    }
    setSelectedPlans(newSelected);
  };

  const handleBulkMarkComplete = async () => {
    const ok = await confirm({
      title: 'Mark plans complete?',
      message: `Mark ${selectedPlans.size} plan(s) as complete?`,
      confirmLabel: 'Mark complete',
      danger: false,
    });
    if (!ok) return;

    try {
      await Promise.all(
        Array.from(selectedPlans).map(id => batchCookingApi.updateStatus(id, 'completed'))
      );
      setSelectedPlans(new Set());
      setBulkActionMode(false);
      await loadData();
    } catch (error) {
      console.error('Failed to update plans:', error);
      toast.error('Some plans failed to update. Please try again.');
    }
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Delete plans?',
      message: `Permanently delete ${selectedPlans.size} plan(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await Promise.all(
        Array.from(selectedPlans).map(id => batchCookingApi.delete(id))
      );
      setSelectedPlans(new Set());
      setBulkActionMode(false);
      await loadData();
    } catch (error) {
      console.error('Failed to delete plans:', error);
      toast.error('Some plans failed to delete. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    // cookingDate comes back as a 'YYYY-MM-DD' string from the backend `date`
    // column; parse it as a local calendar day so it doesn't shift to the
    // previous day behind UTC (same UTC-midnight bug as the modal validation).
    return parseLocalDate(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading batch cooking plans</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <SectionTabs
        label="Meal plans sections"
        tabs={[
          { path: '/meal-plans', label: 'Meal plans' },
          { path: '/batch-cooking', label: 'Batch cooking' },
        ]}
      />
      {/* Header — matches Recipes / Meal Plans / Shopping Lists */}
      <PageHeader
        title="Batch cooking & meal prep"
        subtitle={`${plans.length} batch cook${plans.length === 1 ? '' : 's'} — Cook once, eat multiple times`}
        primaryAction={
          <button
            onClick={() => setShowSessionModal(true)}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Create a batch cook"
          >
            Create a batch cook
          </button>
        }
      />

      {/* Tabs */}
      <div className="mb-6 border-b border-border">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('plans')}
            className={`px-4 py-2 font-medium tabular-nums transition-colors border-b ${
              activeTab === 'plans'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            My plans ({plans.length})
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`px-4 py-2 font-medium tabular-nums transition-colors border-b ${
              activeTab === 'suggestions'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Suggestions ({suggestions.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 font-medium tabular-nums transition-colors border-b ${
              activeTab === 'analytics'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Analytics
          </button>
        </div>
      </div>

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div className="space-y-6">

          {/* Bulk Actions Bar */}
          {plans.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg border border-border">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setBulkActionMode(!bulkActionMode);
                    setSelectedPlans(new Set());
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    bulkActionMode
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground border border-border hover:bg-accent'
                  }`}
                >
                  {bulkActionMode ? 'Cancel bulk mode' : 'Bulk actions'}
                </button>
                {bulkActionMode && selectedPlans.size > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedPlans.size} plan{selectedPlans.size !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              {bulkActionMode && selectedPlans.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkMarkComplete}
                    className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/90 transition-colors"
                  >
                    Mark complete
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Plans List */}
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No batch cooking plans yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Check out the suggestions tab for recipes perfect for batch cooking.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('suggestions')}
                className="mt-4 rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                View suggestions
              </button>
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                {/* Plan Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 flex-1">
                      {bulkActionMode && (
                        <input
                          type="checkbox"
                          checked={selectedPlans.has(plan.id)}
                          onChange={() => togglePlanSelection(plan.id)}
                          className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-base font-medium text-foreground">{plan.name}</h3>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${
                              STATUS_COLORS[plan.status]
                            }`}
                          >
                            {plan.status.replace('-', ' ')}
                          </span>
                        </div>
                        {plan.description && (
                          <p className="text-muted-foreground text-sm">{plan.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="text-muted-foreground hover:text-primary transition-colors p-2"
                        title="Edit plan"
                      >
                        <Pencil className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-2"
                        title="Delete plan"
                      >
                        <Trash2 className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Plan Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-medium tabular-nums text-foreground">{plan.batches}</div>
                      <div className="text-xs text-muted-foreground">Batches</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-medium tabular-nums text-foreground">{plan.servingsPerBatch}</div>
                      <div className="text-xs text-muted-foreground">Servings each</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="flex justify-center mb-1">
                        {(() => {
                          const IconComponent = STORAGE_ICONS[plan.storageMethod];
                          return <IconComponent className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />;
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{plan.storageMethod}</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-medium tabular-nums text-foreground">{plan.storageDuration}</div>
                      <div className="text-xs text-muted-foreground">Days storage</div>
                    </div>
                  </div>

                  {/* Cooking Date */}
                  <div className="mb-4 p-3 rounded-lg bg-muted border border-border">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                      Cooking date: <span className="font-mono tabular-nums">{formatDate(plan.cookingDate)}</span>
                    </span>
                  </div>

                  {/* Recipe Link */}
                  <Link
                    to={`/recipes/${plan.recipe.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-4"
                  >
                    {plan.recipe.imageUrl ? (
                      <img
                        src={plan.recipe.imageUrl}
                        alt={plan.recipe.title}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                        <UtensilsCrossed className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-foreground">{plan.recipe.title}</div>
                      {plan.recipe.categories && plan.recipe.categories.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          {plan.recipe.categories.join(', ')}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Status Actions */}
                  <div className="flex gap-2 mb-4">
                    {plan.status === 'planned' && (
                      <button
                        onClick={() => handleStatusUpdate(plan.id, 'in-progress')}
                        className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                      >
                        Start cooking
                      </button>
                    )}
                    {plan.status === 'in-progress' && (
                      <button
                        onClick={() => handleStatusUpdate(plan.id, 'completed')}
                        className="flex-1 py-2 px-4 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/90 transition-colors"
                      >
                        Mark complete
                      </button>
                    )}
                    <button
                      onClick={() => handleCreateShoppingList(plan.id)}
                      className="px-4 py-2 rounded-lg border border-border bg-background font-medium text-foreground hover:bg-accent transition-colors"
                      title="Create shopping list from this plan"
                    >
                      Shopping list
                    </button>
                    <button
                      onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                      className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                      {expandedPlan === plan.id ? 'Hide details' : 'Show details'}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {expandedPlan === plan.id && (
                    <div className="space-y-4 pt-4 border-t border-border">
                      {/* Prep Checklist */}
                      {plan.prepChecklist && plan.prepChecklist.length > 0 && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Prep checklist</h4>
                          <div className="space-y-2">
                            {plan.prepChecklist.map((item, index) => (
                              <label
                                key={index}
                                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={() => handleChecklistToggle(plan, index)}
                                  className="mt-1 w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                                />
                                <span
                                  className={`flex-1 ${
                                    item.completed
                                      ? 'line-through text-muted-foreground'
                                      : 'text-foreground'
                                  }`}
                                >
                                  {item.task}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reheating Instructions */}
                      {plan.reheatingInstructions && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Reheating instructions</h4>
                          <div className="p-4 rounded-lg bg-muted border border-border">
                            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                              {plan.reheatingInstructions}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Prep Notes */}
                      {plan.prepNotes && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Prep notes</h4>
                          <div className="p-4 rounded-lg bg-muted border border-border">
                            <p className="text-sm text-foreground">{plan.prepNotes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <div className="space-y-4">
          {suggestions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No batch cooking suggestions available.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add more recipes with tags like "Freezer-Friendly" or "One-Pot" to get suggestions.
              </p>
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <div
                key={suggestion.recipe.id}
                className="bg-card rounded-xl border border-border p-6 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Recipe Image */}
                  {suggestion.recipe.imageUrl ? (
                    <img
                      src={suggestion.recipe.imageUrl}
                      alt={suggestion.recipe.title}
                      className="w-32 h-32 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center">
                      <UtensilsCrossed className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Link
                          to={`/recipes/${suggestion.recipe.id}`}
                          className="text-base font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {suggestion.recipe.title}
                        </Link>
                        {suggestion.recipe.categories && suggestion.recipe.categories.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {suggestion.recipe.categories.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-medium tabular-nums text-foreground">
                          {suggestion.batchFriendlyScore}
                        </div>
                        <div className="text-xs text-muted-foreground">Batch score</div>
                      </div>
                    </div>

                    {/* Reasons */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-foreground mb-2">
                        Why this is great for batch cooking:
                      </h4>
                      <ul className="space-y-1">
                        {suggestion.reasons.map((reason, index) => (
                          <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-muted-foreground">•</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Recommendations */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-2 rounded-lg bg-muted">
                        <div className="text-xl font-medium tabular-nums text-foreground">{suggestion.suggestedBatches}</div>
                        <div className="text-xs text-muted-foreground">Suggested batches</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted">
                        <div className="flex justify-center mb-1">
                          {(() => {
                            const IconComponent = STORAGE_ICONS[suggestion.storageRecommendation];
                            return <IconComponent className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />;
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {suggestion.storageRecommendation}
                        </div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted">
                        <div className="text-xl font-medium tabular-nums text-foreground">{suggestion.storageDuration}</div>
                        <div className="text-xs text-muted-foreground">Days storage</div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleCreateFromSuggestion(suggestion)}
                      className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                    >
                      Create batch cooking plan
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && <BatchCookingAnalytics />}

      {/* Modals */}
      {showSessionModal && (
        <CreateBatchSessionModal
          onClose={() => setShowSessionModal(false)}
          onSuccess={loadData}
        />
      )}

      {showCreateModal && (
        <CreateBatchPlanModal
          onClose={() => {
            setShowCreateModal(false);
            setCreatePrefillData(null);
          }}
          onSuccess={loadData}
          prefillData={createPrefillData}
        />
      )}

      {editingPlan && (
        <EditBatchPlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

