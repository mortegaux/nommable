# Analytics and Achievements System

This document explains how Nommable's Analytics and Achievements (Gamification) features work.

## Table of Contents
- [Analytics Overview](#analytics-overview)
- [Achievements & Gamification](#achievements--gamification)
- [User Interface](#user-interface)
- [Technical Implementation](#technical-implementation)

---

## Analytics Overview

The Analytics system provides users with insights into their cooking habits, meal planning patterns, and nutritional trends.

### Data Tracked

Analytics tracks all meal plan data to provide comprehensive insights:

1. **Meal Plans & Meals**
   - Total number of meal plans created
   - Total number of meals planned
   - Date range of meal planning activity

2. **Recipe Usage**
   - Most frequently cooked recipes (top 10)
   - Recipe variety score (unique recipes / total meals)
   - Most repeated recipe

3. **Meal Distribution**
   - Breakdown by meal type (breakfast, lunch, dinner, snack)
   - Shows which meals you plan most often

4. **Cooking Frequency**
   - Tracks meals planned per day over time
   - Helps identify cooking patterns and trends

5. **Nutrition Trends**
   - Average calories, protein, carbs, fat, and fiber
   - Based on recipes that have nutrition data
   - Shows total meals analyzed for accuracy

6. **Category Popularity**
   - Top 10 recipe categories you cook most
   - Percentage breakdown of category usage
   - Examples: Italian, Mexican, Soup, Salad, etc.

7. **AI Usage**
   - Ratio of AI-generated meal plans vs. manual plans
   - Tracks adoption of AI features

8. **Meal History**
   - Chronological list of recent meals (last 50)
   - Includes recipe details, servings, notes
   - Organized by date and meal type

### How Analytics Are Calculated

**Real-Time Aggregation:**
- Analytics are calculated on-demand when you view the Analytics page
- Data is aggregated from your meal plans and meal plan recipes
- No data is pre-cached; always shows current state

**Data Sources:**
- `meal_plans` table - Overall meal plan data
- `meal_plan_recipes` table - Individual meal entries
- `recipes` table - Recipe details, categories, nutrition

**Example Calculations:**

**Recipe Variety Score:**
```
Variety Score = Unique Recipes Cooked / Total Meals Planned

Example:
- You've planned 50 meals
- Using 25 different recipes
- Variety Score = 25/50 = 0.50 (50%)
```

**Nutrition Trends:**
```
Average Calories = SUM(calories from all meals) / Total Meals

Only meals with nutrition data are included in calculations
```

**Category Popularity:**
```
Categories are extracted from all recipes used in meal plans
Each category occurrence is counted
Percentages show: (category count / total categories) × 100
```

### When Analytics Update

Analytics update **immediately** when you:
- Create a new meal plan
- Add meals to an existing plan
- Delete meal plans or meals
- Update recipe information

### Empty State

If you haven't created any meal plans yet, analytics will show:
- Zero counts for all metrics
- Empty graphs and lists
- Prompts to create your first meal plan

---

## Achievements & Gamification

The gamification system rewards users for cooking activities with points, levels, and achievements.

### Core Concepts

#### **Points**
- Earned by completing achievements
- Accumulate over time (never decrease)
- Used to calculate your level

#### **Levels**
- Based on total points earned
- Formula: `Level = (Total Points ÷ 100) + 1`
- Examples:
  - 0-99 points = Level 1
  - 100-199 points = Level 2
  - 1000-1099 points = Level 11
- No level cap

#### **Streaks**
- Tracks consecutive days of cooking
- Cooking = creating/completing a meal plan for that day
- Breaks if you skip a day
- Current streak and longest streak are both tracked

#### **Stats Tracked**

Your profile tracks:
- Total points
- Current level
- Current cooking streak
- Longest cooking streak
- Total recipes created
- Total meals cooked
- Total meal plans created
- Cooking mode usage count
- Recipes shared

### Achievement Categories

#### 🍳 **Cooking Achievements**
Track meal planning and cooking activities:

- **Meal Planner** (15 pts) - Create your first meal plan
- **Week Planner** (30 pts) - Plan a full week of meals (21+ meals)
- **Getting Started** (20 pts) - Cook 10 meals
- **Home Chef** (75 pts) - Cook 50 meals
- **Culinary Expert** (150 pts) - Cook 100 meals
- **Batch Cooker** (40 pts) - Complete a batch cooking plan

#### 📚 **Recipe Achievements**
Reward recipe creation and variety:

- **First Recipe** (10 pts) - Create your first recipe
- **Recipe Collector** (25 pts) - Create 5 recipes
- **Recipe Master** (100 pts) - Create 25 recipes
- **Variety Chef** (50 pts) - Cook 10 different recipes

#### 🔥 **Streak Achievements**
Encourage consistent cooking:

- **3-Day Streak** (20 pts) - Cook for 3 consecutive days
- **Week Warrior** (50 pts) - Cook for 7 consecutive days
- **Month Master** (200 pts) - Cook for 30 consecutive days

#### 🏆 **Milestone Achievements**
Celebrate progression milestones:

- **Rising Star** (25 pts) - Reach level 5
- **Experienced Cook** (50 pts) - Reach level 10
- **Master Chef** (150 pts) - Reach level 25

### How Achievements Are Earned

**Automatic Tracking:**
Achievements are checked and awarded automatically when you:

1. **Create a Recipe**
   - Triggers: First Recipe, Recipe Collector, Recipe Master
   - Updates: Recipes Created stat

2. **Create a Meal Plan**
   - Triggers: Meal Planner, Week Planner (if 21+ meals)
   - Updates: Meal Plans Created stat

3. **Cook/Complete a Meal**
   - Triggers: Getting Started, Home Chef, Culinary Expert, Variety Chef
   - Updates: Meals Cooked stat, Cooking Streak

4. **Complete Batch Cooking**
   - Triggers: Batch Cooker
   - Updates: Related cooking stats

5. **Level Up**
   - Triggers: Rising Star, Experienced Cook, Master Chef
   - Checks when points are awarded

**Achievement States:**

- **Available** - Not started, shows requirements
- **In Progress** - Started but not completed, shows progress bar
- **Completed** - Achievement earned, shows completion date

**Progress Tracking:**

Achievements track your progress toward completion:
```
Progress: 7/10 meals cooked
Progress Bar: 70% filled
```

### Point & Level Progression

**Sample Progression:**

| Total Points | Level | Notable Achievement |
|--------------|-------|-------------------|
| 0-99 | 1 | Starting out |
| 100-199 | 2 | - |
| 400-499 | 5 | Rising Star ⭐ |
| 900-999 | 10 | Experienced Cook 🌟 |
| 2400-2499 | 25 | Master Chef 👑 |

**Fastest Path to Level 10:**

One possible route (requires 900+ points):
1. Recipe Master (25 recipes) - 100 pts
2. Culinary Expert (100 meals) - 150 pts
3. Month Master (30-day streak) - 200 pts
4. Week Planner - 30 pts
5. Variety Chef - 50 pts
6. Home Chef - 75 pts
7. Recipe Collector - 25 pts
8. Week Warrior - 50 pts
9. Batch Cooker - 40 pts
10. Meal Planner - 15 pts
11. Getting Started - 20 pts
12. 3-Day Streak - 20 pts
13. Rising Star (level 5) - 25 pts
14. Experienced Cook (level 10) - 50 pts
15. First Recipe - 10 pts
**Total: 860+ points**

### Leaderboard

The leaderboard shows top users by points:
- Displays top 10 users (configurable)
- Shows: Username, Level, Total Points, Current Streak
- Sorted by total points (descending)
- Updated in real-time

---

## User Interface

### Analytics Page (`/analytics`)

**Overview Tab:**
Displays visual analytics including:

1. **Summary Cards** (Top row)
   - Total Meal Plans
   - Total Meals
   - Most Repeated Recipe
   - AI Usage Percentage

2. **Most Cooked Recipes** (Grid)
   - Top 10 recipes with images
   - Shows cook count for each

3. **Meal Type Distribution** (Pie chart)
   - Visual breakdown of breakfast/lunch/dinner/snack

4. **Recipe Variety** (Score card)
   - Variety score percentage
   - Unique vs. total recipes

5. **Nutrition Trends** (Cards)
   - Average macros across all meals
   - Color-coded cards for each nutrient

6. **Category Popularity** (Bar chart)
   - Top 10 categories you cook
   - Percentage bars

7. **Cooking Frequency** (Line graph)
   - Meals per day over time
   - Shows cooking patterns

**History Tab:**
- Chronological list of recent meals
- Meal type badges with colors
- Recipe links
- Date grouping
- Shows last 50 meals

### Achievements Page (`/achievements`)

**Overview Tab:**
User stats and progress:

1. **Level Card** (Hero section)
   - Current level (large number)
   - Total points
   - Progress bar to next level
   - Points needed for next level

2. **Stats Grid** (4 cards)
   - Current Streak 🔥
   - Longest Streak ⚡
   - Recipes Created 📚
   - Meals Cooked 🍳

3. **Quick Stats** (Additional row)
   - Meal Plans Created
   - Total Points
   - Level

**Achievements Tab:**

Achievement sections with visual organization:

1. **Completed Achievements**
   - Green checkmark badges
   - Shows completion date
   - Points earned
   - Sorted by most recent first

2. **In Progress Achievements**
   - Progress bars showing completion percentage
   - Current progress vs. target (e.g., "7/10")
   - Points available upon completion
   - Updates in real-time

3. **Available Achievements**
   - Not yet started
   - Shows requirements clearly
   - Potential points displayed
   - Grouped by category

**Category Color Coding:**
- 🍳 Cooking - Coral
- 📚 Recipes - Green (Herb)
- 🔥 Streaks - Amber
- 👥 Social - Purple
- 🏆 Milestones - Secondary accent

---

## Technical Implementation

### Backend Architecture

#### Analytics Service
**File:** `packages/backend/src/services/analytics/analytics.service.ts`

**Key Methods:**
- `getAnalyticsSummary(userId)` - Returns all analytics data
- `getMealHistory(userId, limit)` - Returns recent meal history
- Private calculation methods for each metric

**Performance:**
- Uses SQLite aggregation functions
- Efficient queries with JOINs
- Parallel data fetching with `Promise.all()`

#### Gamification Service
**File:** `packages/backend/src/services/gamification/gamification.service.ts`

**Key Methods:**
- `getUserStats(userId)` - Get/create user stats
- `recordRecipeCreated(userId)` - Trigger recipe achievements
- `recordMealPlanCreated(userId, mealCount)` - Trigger meal plan achievements
- `recordMealCooked(userId)` - Trigger cooking achievements, update streaks
- `getAchievementProgress(userId)` - Get achievement status
- `getLeaderboard(limit)` - Get top users

**Achievement Definitions:**
- Stored as constants in `ACHIEVEMENTS` object
- Each has: key, name, description, icon, points, category, target

**Streak Calculation:**
```typescript
// Compares dates to determine if streak continues
const daysDiff = (today - lastCookingDate) / (1000 * 60 * 60 * 24)

if (daysDiff === 1) {
  // Consecutive day - increment streak
  currentStreak++
} else if (daysDiff > 1) {
  // Streak broken - reset to 1
  currentStreak = 1
}
// daysDiff === 0 means cooking again same day - no change
```

### Database Schema

#### UserStats Entity
```typescript
userId: string (UUID, FK to users)
totalPoints: number (default 0)
currentStreak: number (default 0)
longestStreak: number (default 0)
recipesCreated: number (default 0)
mealsCooked: number (default 0)
mealPlansCreated: number (default 0)
cookingModeUsed: number (default 0)
recipesShared: number (default 0)
level: number (default 1)
lastCookingDate: Date (nullable)
```

#### UserAchievement Entity
```typescript
id: string (UUID, PK)
userId: string (UUID, FK to users)
achievementKey: string (e.g., 'first_recipe')
points: number
progress: number (current progress)
target: number (goal to reach)
completed: boolean (default false)
completedAt: Date (nullable)
```

### API Endpoints

#### Analytics
- `GET /api/analytics/summary` - Get all analytics
- `GET /api/analytics/history?limit=50` - Get meal history

#### Gamification
- `GET /api/gamification/stats` - Get user stats
- `GET /api/gamification/achievements` - Get user's achievements
- `GET /api/gamification/achievements/progress` - Get organized achievement data
- `GET /api/gamification/achievements/all` - Get all achievement definitions
- `GET /api/gamification/leaderboard?limit=10` - Get leaderboard
- `POST /api/gamification/record-meal` - Manually record a meal (triggers achievements)

### Frontend Integration

#### API Calls
```typescript
// Analytics
import { analyticsApi } from '@/services/api'

const summary = await analyticsApi.getSummary()
const history = await analyticsApi.getHistory(50)

// Gamification
import { gamificationApi } from '@/services/api'

const stats = await gamificationApi.getStats()
const progress = await gamificationApi.getAchievementProgress()
const leaderboard = await gamificationApi.getLeaderboard(10)
```

#### Components
- `AnalyticsPage.tsx` (473 lines) - Full analytics dashboard
- `GamificationPage.tsx` (345 lines) - Full achievements dashboard

### Integration Points

**Achievements trigger when:**

1. Recipe created → `POST /api/recipes`
   - Backend calls `gamificationService.recordRecipeCreated(userId)`

2. Meal plan created → `POST /api/meal-plans`
   - Backend calls `gamificationService.recordMealPlanCreated(userId, mealCount)`

3. Meal cooked/completed → Manual trigger or batch cooking completion
   - Backend calls `gamificationService.recordMealCooked(userId)`

**Return value:**
All `record*` methods return `UserAchievement[]` - newly earned achievements that can be displayed to the user as toast notifications.

### Performance Considerations

**Analytics:**
- All queries filtered by `userId` for security and performance
- Database indexes on `userId` and `date` columns
- Limit expensive queries (e.g., meal history limited to 50)
- Use COUNT, AVG, SUM at database level

**Gamification:**
- UserStats initialized on first access (lazy creation)
- Achievement checks only run when triggered by actions
- Leaderboard uses database ordering (no in-memory sorting)
- Achievement progress cached in database

### Future Enhancements

**Analytics:**
- Caching frequently accessed analytics
- Export analytics to PDF/CSV
- More detailed nutrition breakdowns
- Weekly/monthly comparison views
- Goal setting and tracking

**Achievements:**
- Achievement notifications/toasts when earned
- Social features (share achievements)
- Seasonal/limited-time achievements
- Custom user goals
- Rewards/badges for display
- Weekly challenges

---

## Troubleshooting

### Analytics Not Showing Data

**Check:**
1. Have you created any meal plans?
2. Do your meal plans have meals added to them?
3. Check browser console for API errors
4. Verify backend is running and accessible

**Solution:** Create a meal plan with some meals to see data populate.

### Achievements Not Unlocking

**Check:**
1. Are you meeting the exact requirements? (e.g., 10 different recipes for Variety Chef)
2. Check your stats on the Overview tab
3. Look at the In Progress section to see current progress

**Common Issue:** Streaks require cooking on consecutive days. Cooking multiple meals on the same day doesn't increase the streak.

### Level Not Increasing

**Check:**
1. Your total points on the Overview tab
2. Formula: Level = (Total Points ÷ 100) + 1
3. Earn more achievements to get more points

**Example:** At 850 points, you're level 9. You need 100 more points (950 total) to reach level 10.

---

## Summary

The Analytics and Achievements system provides:

**Analytics:**
- Comprehensive cooking insights
- Visual data representations
- Nutrition tracking
- Historical meal records

**Achievements:**
- Gamified progression system
- Reward-based engagement
- Streak tracking for consistency
- Social leaderboard competition

Both systems work together to help users track their cooking journey, stay motivated, and build better cooking habits.
