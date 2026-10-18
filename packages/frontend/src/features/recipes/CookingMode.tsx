import { useState, useEffect } from 'react';
import { Timer } from '@/components/Timer';
import { formatQuantity } from '@/utils/fractions';
import { ListIcon, AccessTimeIcon, RestaurantIcon, CelebrationIcon } from '@/components/icons/MaterialIcon';
import type { Recipe } from '@nommable/shared';

interface CookingModeProps {
  recipe: Recipe;
  servingMultiplier: number;
  onExit: () => void;
}

interface ActiveTimer {
  id: string;
  label: string;
  minutes: number;
}

export function CookingMode({ recipe, servingMultiplier, onExit }: CookingModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [showIngredients, setShowIngredients] = useState(false);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const toggleStep = (index: number) => {
    setCompletedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const nextStep = () => {
    if (currentStep < (recipe.instructions?.length || 0) - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const addTimer = (minutes: number) => {
    const newTimer: ActiveTimer = {
      id: Date.now().toString(),
      label: `Step ${currentStep + 1} Timer`,
      minutes,
    };
    setTimers([...timers, newTimer]);
  };

  const removeTimer = (id: string) => {
    setTimers(timers.filter(t => t.id !== id));
  };

  const totalSteps = recipe.instructions?.length || 0;
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-card border-b-2 border-border shadow-md z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-foreground">{recipe.title}</h1>
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2"
              aria-label="Exit cooking mode"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-background rounded-full h-3 overflow-hidden mb-2">
            <div
              className="h-full bg-secondary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Step {currentStep + 1} of {totalSteps}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setShowIngredients(!showIngredients)}
            className={`py-4 rounded-xl font-semibold text-lg transition-all inline-flex items-center justify-center gap-2 ${
              showIngredients
                ? 'bg-primary text-primary-foreground shadow-lg'
                : 'bg-card border-2 border-border text-foreground hover:bg-accent'
            }`}
          >
            <ListIcon size={20} />
            {showIngredients ? 'Hide' : 'Show'} Ingredients
          </button>
          <button
            onClick={() => addTimer(5)}
            className="py-4 rounded-xl font-semibold text-lg bg-card border-2 border-border text-foreground hover:bg-accent transition-all inline-flex items-center justify-center gap-2"
          >
            <AccessTimeIcon size={20} />
            Add 5min Timer
          </button>
        </div>

        {/* Ingredients Panel */}
        {showIngredients && (
          <div className="mb-6 bg-card rounded-2xl border-2 border-border p-6 animate-scale-in">
            <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
              <RestaurantIcon size={24} />
              Ingredients
            </h2>
            <ul className="space-y-3">
              {recipe.ingredients?.map((ing) => {
                const adjustedQuantity = ing.quantity ? ing.quantity * servingMultiplier : undefined;
                return (
                  <li key={ing.id} className="flex items-start gap-3 text-lg">
                    <span className="text-primary font-bold min-w-[4rem]">
                      {formatQuantity(adjustedQuantity, ing.unit)}
                      {adjustedQuantity && ' '}
                      {ing.unit}
                    </span>
                    <span className="font-medium text-foreground">{ing.name}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Active Timers */}
        {timers.length > 0 && (
          <div className="mb-6 grid gap-4 md:grid-cols-2" role="group" aria-label="Active cooking timers">
            {timers.map(timer => (
              <Timer
                key={timer.id}
                initialMinutes={timer.minutes}
                label={timer.label}
                onDelete={() => removeTimer(timer.id)}
              />
            ))}
          </div>
        )}

        {/* Current Step */}
        <div className="bg-card rounded-2xl border-2 border-primary p-5 sm:p-8 mb-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => toggleStep(currentStep)}
                className={`w-16 h-16 rounded-full font-bold text-2xl flex items-center justify-center transition-all ${
                  completedSteps.has(currentStep)
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-primary text-primary-foreground hover:shadow-lg'
                }`}
                aria-label={`Mark step ${currentStep + 1} as ${completedSteps.has(currentStep) ? 'incomplete' : 'complete'}`}
              >
                {completedSteps.has(currentStep) ? '✓' : currentStep + 1}
              </button>
              <h2 className="text-2xl font-bold text-foreground whitespace-nowrap">Step {currentStep + 1}</h2>
            </div>

            {/* Quick Timer Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => addTimer(1)}
                className="px-3 py-2 rounded-lg bg-background border border-border hover:bg-accent text-sm font-medium transition-colors"
                title="Add 1 minute timer"
              >
                1m
              </button>
              <button
                onClick={() => addTimer(5)}
                className="px-3 py-2 rounded-lg bg-background border border-border hover:bg-accent text-sm font-medium transition-colors"
                title="Add 5 minute timer"
              >
                5m
              </button>
              <button
                onClick={() => addTimer(10)}
                className="px-3 py-2 rounded-lg bg-background border border-border hover:bg-accent text-sm font-medium transition-colors"
                title="Add 10 minute timer"
              >
                10m
              </button>
            </div>
          </div>

          <p className="text-2xl leading-relaxed text-foreground mb-8">
            {recipe.instructions?.[currentStep]}
          </p>

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={previousStep}
              disabled={currentStep === 0}
              className="py-4 px-6 rounded-xl font-semibold text-lg bg-background border-2 border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <button
              onClick={nextStep}
              disabled={currentStep === totalSteps - 1}
              className="py-4 px-6 rounded-xl font-semibold text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              Next
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* All Steps Overview */}
        <div className="bg-card rounded-2xl border-2 border-border p-6">
          <h3 className="text-xl font-bold text-foreground mb-4">All Steps</h3>
          <div className="space-y-3" role="list" aria-label="Recipe steps">
            {recipe.instructions?.map((instruction, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                aria-current={index === currentStep ? 'step' : undefined}
                aria-label={`Step ${index + 1}${index === currentStep ? ' (current step)' : ''}${completedSteps.has(index) ? ' (completed)' : ''}`}
                className={`w-full text-left p-4 rounded-lg transition-all ${
                  index === currentStep
                    ? 'bg-primary/10 border-2 border-primary'
                    : completedSteps.has(index)
                    ? 'bg-secondary/10 border border-secondary/30'
                    : 'bg-background border border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    completedSteps.has(index)
                      ? 'bg-secondary text-secondary-foreground'
                      : index === currentStep
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {completedSteps.has(index) ? '✓' : index + 1}
                  </span>
                  <span className={`flex-1 ${
                    completedSteps.has(index) ? 'line-through text-muted-foreground' : 'text-foreground'
                  }`}>
                    {instruction}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Completion */}
        {currentStep === totalSteps - 1 && completedSteps.has(currentStep) && (
          <div className="mt-6 bg-secondary/10 border-2 border-secondary rounded-2xl p-8 text-center animate-scale-in">
            <div className="mb-4 flex justify-center">
              <CelebrationIcon size={64} className="text-secondary" />
            </div>
            <h3 className="text-3xl font-bold text-foreground mb-2">Recipe Complete!</h3>
            <p className="text-lg text-muted-foreground mb-6">Great job cooking {recipe.title}!</p>
            <button
              onClick={onExit}
              className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-colors"
            >
              Exit Cooking Mode
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
