import { useState, useEffect } from 'react';
import { gamificationApi } from '@/services/api';
import { LocalFireDepartmentIcon, RestaurantIcon, DescriptionIcon, EmojiEventsIcon } from '@/components/icons/MaterialIcon';
import { InfoTooltip, InfoBanner } from '@/components/InfoTooltip';
import { PageHeader } from '@/components/PageHeader';
import { Link } from 'react-router-dom';

interface UserStats {
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  recipesCreated: number;
  mealsCooked: number;
  mealPlansCreated: number;
  level: number;
}

interface Achievement {
  id: string;
  achievementKey: string;
  points: number;
  progress: number;
  target: number;
  completed: boolean;
  completedAt?: string;
}

interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: string;
  target: number;
}

const CATEGORY_COLORS = {
  cooking: 'bg-coral-100 text-coral-800 border-coral-300',
  recipes: 'bg-herb-100 text-herb-800 border-herb-300',
  streaks: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  social: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700',
  milestones: 'bg-secondary/10 text-secondary-foreground border-secondary/20',
};

export default function GamificationPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [completed, setCompleted] = useState<Achievement[]>([]);
  const [inProgress, setInProgress] = useState<Achievement[]>([]);
  const [available, setAvailable] = useState<AchievementDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, progressRes] = await Promise.all([
        gamificationApi.getStats(),
        gamificationApi.getAchievementProgress(),
      ]);
      setStats(statsRes.data);
      setCompleted(progressRes.data.completed);
      setInProgress(progressRes.data.inProgress);
      setAvailable(progressRes.data.available);
    } catch (error) {
      console.error('Failed to load gamification data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (progress: number, target: number) => {
    return Math.min((progress / target) * 100, 100);
  };

  const getLevelProgress = () => {
    if (!stats) return 0;
    const pointsInCurrentLevel = stats.totalPoints % 100;
    return (pointsInCurrentLevel / 100) * 100;
  };

  const getPointsToNextLevel = () => {
    if (!stats) return 100;
    return 100 - (stats.totalPoints % 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading achievements...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load stats.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Achievements & Progress"
        titleAdornment={
          <InfoTooltip content="Earn points and level up by completing achievements. Each achievement rewards you with points that count toward your level." />
        }
        subtitle="Track your cooking journey and earn rewards"
      />

      {/* Info Banner */}
      <InfoBanner
        type="info"
        title="How Achievements Work"
        description={
          <div className="space-y-1">
            <p>Complete cooking activities to unlock achievements and earn points.</p>
            <p className="text-xs mt-1">
              <strong>Level Formula:</strong> Level = (Total Points ÷ 100) + 1 • <strong>Categories:</strong> Cooking • Recipes • Streaks • Milestones
            </p>
          </div>
        }
        className="mb-6"
      />

      {/* Tabs */}
      <div className="mb-6 border-b border-border">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('achievements')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'achievements'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Achievements ({completed.length}/{completed.length + inProgress.length + available.length})
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Getting Started Tip */}
          {stats.level === 1 && stats.totalPoints === 0 && (
            <InfoBanner
              type="tip"
              title="Start Your Journey!"
              description={
                <div>
                  <p className="mb-2">Earn your first achievement to start leveling up!</p>
                  <ul className="text-sm list-disc list-inside ml-2 space-y-1">
                    <li>Create your first recipe (10 points)</li>
                    <li>Plan your first meal (15 points)</li>
                    <li>Cook 10 meals (20 points)</li>
                    <li>Build a 3-day cooking streak (20 points)</li>
                  </ul>
                  <Link
                    to="/recipes/new"
                    className="inline-block mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors text-sm"
                  >
                    Create Your First Recipe
                  </Link>
                </div>
              }
            />
          )}

          {/* Level Card */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl border-2 border-primary/20 p-8 text-center">
            <div className="text-6xl font-bold text-primary mb-2">Level {stats.level}</div>
            <div className="text-sm text-muted-foreground mb-4">{stats.totalPoints} Total Points</div>
            <div className="max-w-md mx-auto">
              <div
                className="w-full bg-background rounded-full h-4 overflow-hidden mb-2"
                role="progressbar"
                aria-label={`Progress to level ${stats.level + 1}`}
                aria-valuenow={Math.round(getLevelProgress())}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${Math.round(getLevelProgress())}% to level ${stats.level + 1}`}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${getLevelProgress()}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {getPointsToNextLevel()} points to Level {stats.level + 1} ({Math.round(getLevelProgress())}%)
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-card rounded-xl border border-border p-6 text-center">
              <div className="mb-2 flex justify-center items-center gap-2">
                <LocalFireDepartmentIcon size={40} className="text-primary" />
                <InfoTooltip content={
                  <div>
                    <p className="mb-2">Streaks track consecutive days of cooking activity.</p>
                    <p className="text-xs">Cook or plan meals on consecutive days to build your streak. Skip a day and it resets!</p>
                  </div>
                } />
              </div>
              <div className="text-3xl font-bold text-primary">{stats.currentStreak}</div>
              <div className="text-sm text-muted-foreground">Day Streak</div>
              <div className="text-xs text-muted-foreground mt-1">
                Best: {stats.longestStreak} days
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-6 text-center">
              <div className="mb-2 flex justify-center">
                <RestaurantIcon size={40} className="text-primary" />
              </div>
              <div className="text-3xl font-bold text-primary">{stats.mealsCooked}</div>
              <div className="text-sm text-muted-foreground">Meals Cooked</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-6 text-center">
              <div className="mb-2 flex justify-center">
                <DescriptionIcon size={40} className="text-primary" />
              </div>
              <div className="text-3xl font-bold text-primary">{stats.recipesCreated}</div>
              <div className="text-sm text-muted-foreground">Recipes Created</div>
            </div>
          </div>

          {/* Recent Achievements */}
          {completed.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-bold text-foreground mb-4">Recent Achievements</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {completed.slice(0, 4).map((achievement) => {
                  const def = available.find((a) => a.key === achievement.achievementKey);
                  if (!def) return null;
                  return (
                    <div
                      key={achievement.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/5 border border-secondary/20"
                    >
                      <div className="text-3xl">{def.icon}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">{def.name}</div>
                        <div className="text-xs text-muted-foreground">{def.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-secondary">+{def.points}</div>
                        <div className="text-xs text-muted-foreground">points</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Achievement Categories Explanation */}
          <InfoBanner
            type="tip"
            title="Achievement Categories"
            description={
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="font-semibold mb-1">🍳 Cooking</div>
                  <div className="opacity-80">Meal plans & cooking activities</div>
                </div>
                <div>
                  <div className="font-semibold mb-1">📚 Recipes</div>
                  <div className="opacity-80">Recipe creation & variety</div>
                </div>
                <div>
                  <div className="font-semibold mb-1">🔥 Streaks</div>
                  <div className="opacity-80">Consecutive days cooking</div>
                </div>
                <div>
                  <div className="font-semibold mb-1">🏆 Milestones</div>
                  <div className="opacity-80">Level progression rewards</div>
                </div>
              </div>
            }
          />

          {/* Completed Achievements */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-foreground mb-4">Completed ({completed.length})</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {completed.map((achievement) => {
                  const def = available.find((a) => a.key === achievement.achievementKey) ||
                    inProgress.find((a) => a.achievementKey === achievement.achievementKey);
                  if (!def) return null;
                  return (
                    <div
                      key={achievement.id}
                      className="bg-card rounded-xl border-2 border-secondary p-6"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex justify-center">
                            <EmojiEventsIcon size={40} className="text-primary" />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{(def as any).name || achievement.achievementKey}</div>
                            <div className="text-sm text-muted-foreground">
                              {(def as any).description || 'Achievement unlocked!'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-secondary">+{achievement.points}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className={`px-2 py-1 rounded-full ${
                          CATEGORY_COLORS[(def as any).category as keyof typeof CATEGORY_COLORS] || ''
                        }`}>
                          {(def as any).category}
                        </span>
                        <span>✓ Completed</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* In Progress */}
          {inProgress.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-foreground mb-4">In Progress ({inProgress.length})</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {inProgress.map((achievement) => {
                  const def = available.find((a) => a.key === achievement.achievementKey);
                  if (!def) return null;
                  return (
                    <div
                      key={achievement.id}
                      className="bg-card rounded-xl border border-border p-6"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-4xl opacity-60">{def.icon}</div>
                          <div>
                            <div className="font-bold text-foreground">{def.name}</div>
                            <div className="text-sm text-muted-foreground">{def.description}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">+{def.points}</div>
                        </div>
                      </div>
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{achievement.progress}/{achievement.target}</span>
                          <span>{getProgressPercentage(achievement.progress, achievement.target).toFixed(0)}%</span>
                        </div>
                        <div
                          className="w-full bg-background rounded-full h-2 overflow-hidden"
                          role="progressbar"
                          aria-label={`${def.name} progress`}
                          aria-valuenow={achievement.progress}
                          aria-valuemin={0}
                          aria-valuemax={achievement.target}
                          aria-valuetext={`${getProgressPercentage(achievement.progress, achievement.target).toFixed(0)}% complete`}
                        >
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${getProgressPercentage(achievement.progress, achievement.target)}%` }}
                          />
                        </div>
                      </div>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs ${
                        CATEGORY_COLORS[def.category as keyof typeof CATEGORY_COLORS] || ''
                      }`}>
                        {def.category}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available */}
          {available.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-foreground mb-4">Available ({available.length})</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {available.map((def) => (
                  <div
                    key={def.key}
                    className="bg-card rounded-xl border border-border p-6 opacity-75"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-4xl opacity-40">{def.icon}</div>
                        <div>
                          <div className="font-bold text-foreground">{def.name}</div>
                          <div className="text-sm text-muted-foreground">{def.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-muted-foreground">+{def.points}</div>
                      </div>
                    </div>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs ${
                      CATEGORY_COLORS[def.category as keyof typeof CATEGORY_COLORS] || ''
                    }`}>
                      {def.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
