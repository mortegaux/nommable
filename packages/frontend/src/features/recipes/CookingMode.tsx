import { useState, useEffect } from 'react';
import { Timer } from '@/components/Timer';
import { formatQuantity } from '@/utils/fractions';
import { Check, ChevronLeft, ChevronRight, Clock, List, PartyPopper, UtensilsCrossed, X } from 'lucide-react';
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
      <div className="sticky top-0 bg-card border-b border-border shadow-md z-10">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-medium leading-tight text-balance text-foreground">{recipe.title}</h1>
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2"
              aria-label="Exit cooking mode"
            >
              <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              Exit
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-background rounded-full h-3 overflow-hidden mb-2">
            <div
              className="h-full bg-secondary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm font-mono tabular-nums text-muted-foreground text-center">
            Step {currentStep + 1} of {totalSteps}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-16">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setShowIngredients(!showIngredients)}
            className={`py-4 rounded-xl font-medium text-lg transition-colors inline-flex items-center justify-center gap-2 ${
              showIngredients
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-foreground hover:bg-accent'
            }`}
          >
            <List className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            {showIngredients ? 'Hide' : 'Show'} ingredients
          </button>
          <button
            onClick={() => addTimer(5)}
            className="py-4 rounded-xl font-medium text-lg bg-card border border-border text-foreground hover:bg-accent transition-colors inline-flex items-center justify-center gap-2"
          >
            <Clock className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            Add 5 min timer
          </button>
        </div>

        {/* Ingredients Panel */}
        {showIngredients && (
          <div className="mb-6 bg-card rounded-2xl border border-border p-6 animate-scale-in">
            <h2 className="text-xl font-medium text-foreground mb-4 flex items-center gap-2">
              <UtensilsCrossed className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              Ingredients
            </h2>
            <ul className="space-y-3">
              {recipe.ingredients?.map((ing) => {
                const adjustedQuantity = ing.quantity ? ing.quantity * servingMultiplier : undefined;
                return (
                  <li key={ing.id} className="flex items-start gap-3 text-lg">
                    <span className="text-primary font-semibold tabular-nums min-w-[4rem]">
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
        <div className="bg-card rounded-2xl border border-primary p-5 sm:p-8 mb-6 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => toggleStep(currentStep)}
                className={`h-16 w-16 rounded-full font-medium text-2xl flex items-center justify-center transition-colors ${
                  completedSteps.has(currentStep)
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}
                aria-label={`Mark step ${currentStep + 1} as ${completedSteps.has(currentStep) ? 'incomplete' : 'complete'}`}
              >
                {completedSteps.has(currentStep) ? <Check className="h-8 w-8" strokeWidth={2} aria-hidden="true" /> : currentStep + 1}
              </button>
              <h2 className="text-xl font-medium tabular-nums text-foreground whitespace-nowrap">Step {currentStep + 1}</h2>
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
              className="py-4 px-6 rounded-xl font-medium text-lg bg-background border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
              Previous
            </button>
            <button
              onClick={nextStep}
              disabled={currentStep === totalSteps - 1}
              className="py-4 px-6 rounded-xl font-medium text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              Next
              <ChevronRight className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* All Steps Overview */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-xl font-medium text-foreground mb-4">All steps</h3>
          <div className="space-y-3" role="list" aria-label="Recipe steps">
            {recipe.instructions?.map((instruction, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                aria-current={index === currentStep ? 'step' : undefined}
                aria-label={`Step ${index + 1}${index === currentStep ? ' (current step)' : ''}${completedSteps.has(index) ? ' (completed)' : ''}`}
                className={`w-full text-left p-4 rounded-lg transition-colors ${
                  index === currentStep
                    ? 'bg-primary/10 border border-primary'
                    : completedSteps.has(index)
                    ? 'bg-secondary/10 border border-secondary/30'
                    : 'bg-background border border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-medium tabular-nums ${
                    completedSteps.has(index)
                      ? 'bg-secondary text-secondary-foreground'
                      : index === currentStep
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {completedSteps.has(index) ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : index + 1}
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
          <div className="mt-6 bg-secondary/10 border border-secondary rounded-2xl p-8 text-center animate-scale-in">
            <div className="mb-4 flex justify-center">
              <PartyPopper className="h-16 w-16 text-secondary" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h3 className="text-3xl font-medium leading-tight text-balance text-foreground mb-2">Recipe complete</h3>
            <p className="text-lg text-muted-foreground mb-6">Great job cooking {recipe.title}.</p>
            <button
              onClick={onExit}
              className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-medium text-lg hover:bg-primary/90 transition-colors"
            >
              Exit cooking mode
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
