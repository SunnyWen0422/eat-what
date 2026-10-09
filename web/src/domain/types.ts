export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type DishType = 'meat' | 'vegetable' | 'staple' | 'soup' | 'breakfastSnack';
export type LocalDate = string & { readonly __localDate: unique symbol };
export type UtcIso = string & { readonly __utcIso: unique symbol };
export type TimeZone = string & { readonly __timeZone: unique symbol };
export type ErrorCode = 'INVALID' | 'LIMIT' | 'UNAVAILABLE' | 'QUOTA' | 'CONFLICT' | 'DUPLICATE' | 'FUTURE_DATE' | 'BLOCKED' | 'NEWER_SCHEMA' | 'CATALOG' | 'ABORTED';
export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string; retryable?: boolean } };
export type Quantity = { kind: 'exact'; value: number; unit: string } | { kind: 'range'; min: number; max: number; unit: string };
export interface Ingredient {
  ingredientId: string | null; form: string; part: string | null; raw: string;
  quantity: Quantity | null; trust: 'reviewed' | 'unknown'; compoundResolved: boolean;
}
export interface RecipeSnapshot {
  recipeId: string; familyId: string; variantId: string | null; name: string;
  types: DishType[]; ingredients: Ingredient[]; steps: string[];
  source: { url: string | null; commit: string | null; license: string | null };
  catalogVersion: string | null; baseServings: number | null; contentVersion?: string | null;
}
export type PublicReviewStatus = 'VERIFIED' | 'UNREVIEWED' | 'UNKNOWN' | 'BROWSE_ONLY' | 'REJECTED';
export type QualityStatus = 'VERIFIED' | 'UNKNOWN';
export interface CatalogRecipe extends RecipeSnapshot {
  meals: Meal[]; reviewStatus: PublicReviewStatus; generationEligible: boolean;
  reviewedAt: LocalDate | null; issues: string[];
  stepStatus: QualityStatus; servingsStatus: QualityStatus;
  familyIdentity: 'database-id-fallback'; mealEligibility: 'local-convention';
}
export interface Slot { id: string; type: DishType }
export interface MealDraft {
  id: 'current'; servings: number; meal: Meal; slots: Slot[];
  dishes: { slotId: string; recipe: RecipeSnapshot; locked: boolean }[];
  countsConfirmed: boolean; updatedAt: UtcIso; revision: number; requestId?: string;
}
export interface Plan {
  id: string; date: LocalDate; meal: Meal; servings: number; snapshots: RecipeSnapshot[];
  createdAt: UtcIso; updatedAt: UtcIso; timeZone: TimeZone; revision: number; requestId: string;
}
export type PlanInput = Pick<Plan, 'date' | 'meal' | 'servings' | 'snapshots' | 'timeZone'> & { id?: string };
/** Unimplemented object stores remain fail-closed until their dedicated tasks. */
export interface PersonalRecord { id: string; revision: number; requestId: string; [field: string]: unknown }
export interface PersonalData {
  meta: { schemaVersion: number; appVersion: string; revision: number; lastSuccessfulWriteAt: UtcIso | null; lastBackupRequestedAt: UtcIso | null };
  preferences: { servings: number; meal: Meal; slots: Slot[]; hardExclusions: { ingredientId: string | null; raw: string }[]; softPreferences: string[]; revision: number; requestId?: string };
  draft: MealDraft | null;
  customRecipes: CustomRecipe[]; favorites: Favorite[]; menuTemplates: MenuTemplate[];
  plans: Plan[]; actualMeals: ActualMeal[]; shoppingLists: ShoppingList[]; trash: TrashEntry[];
}
export interface GenerationAvailability { familyCount: number; enabled: boolean }
export interface Catalog {
  origin: 'online-provider'; version: null; recipes: CatalogRecipe[]; aliases: Record<string, string>;
  recipeAliases: Record<string, string>;
  availability: Record<Meal, Record<DishType, GenerationAvailability>>;
}
export type PublicDishType = 'meat' | 'veg' | 'soup' | 'staple' | 'dessert';
export interface PublicIngredient {
  name: string | null; unit: string | null; rawText: string | null;
  rawQuantity: string | null; rawUnit: string | null; displayQuantity: string | null;
  quantityValue: number | null; preparation: string | null; role: string | null;
  identityStatus: QualityStatus; quantityStatus: QualityStatus;
}
export interface PublicDishQuality {
  reviewStatus: PublicReviewStatus; basePeople: number | null;
  servingsStatus: QualityStatus; stepStatus: QualityStatus; timeStatus: QualityStatus;
  issueCodes: string[]; ingredients: PublicIngredient[];
}
/** Minimal whitelist. Actual database text fields remain text, not executable media. */
export interface PublicDish {
  id: number; name: string; type: string | null;
  cl: string | null; fl: string | null; step: string | null; steps: string | null;
  tips: string | null; ingredientsAmounts: string | null; contentVersion: string | null;
  quality: PublicDishQuality | null;
}
export interface PublicDishQuery { page: number; pageSize: number; type?: PublicDishType }
export interface PublicDishPage { list: PublicDish[]; total: number; page: number; pageSize: number }
/** Transport has no implementation/URL until endpoint access and release scope are approved. */
export type PublicCatalogTransport = (query: Readonly<PublicDishQuery>) => Promise<unknown>;
export interface PublicCatalogProvider { list(query: PublicDishQuery): Promise<Result<PublicDishPage>> }

/** Actual persistence belongs to the history task; generation reads date and snapshots only. */
export interface ActualMeal {
  id: string; date: LocalDate; meal: Meal; snapshots: RecipeSnapshot[]; planId: string | null; note: string;
  createdAt: UtcIso; updatedAt: UtcIso; timeZone: TimeZone; revision: number; requestId: string;
}
export interface GenerateInput {
  catalog: Catalog; draft: MealDraft; hardExclusions: string[]; unresolvedExclusions: string[];
  favoriteIds: string[]; actualMeals: ActualMeal[]; today: LocalDate; seed: number;
}
export interface GenerationResult {
  draft: MealDraft; missing: { slotId: string; reason: string }[]; conflicts: { slotId: string; reason: string }[];
}

export type ActualMealInput = Pick<ActualMeal, 'date' | 'meal' | 'snapshots' | 'planId' | 'note' | 'timeZone'> & { id?: string };
export interface CustomRecipe {
  id: string; snapshot: RecipeSnapshot; createdAt: UtcIso; updatedAt: UtcIso; revision: number; requestId: string;
}
export interface CustomRecipeInput { id?: string; name: string; types: DishType[]; ingredients: Ingredient[]; steps: string[]; baseServings: number | null }
export interface Favorite {
  id: string; recipeId: string; snapshot: RecipeSnapshot; createdAt: UtcIso; updatedAt: UtcIso; revision: number; requestId: string;
}
export interface MenuTemplate {
  id: string; name: string; servings: number; snapshots: RecipeSnapshot[]; createdAt: UtcIso; updatedAt: UtcIso; revision: number; requestId: string;
}
export type MenuTemplateInput = Pick<MenuTemplate, 'name' | 'servings' | 'snapshots'> & { id?: string };
export type PersonalStore = 'customRecipes' | 'favorites' | 'menuTemplates' | 'plans' | 'actualMeals' | 'shoppingLists';
export type TrashEntry = { id: string; originalId: string; deletedAt: UtcIso; expiresAt: UtcIso; revision: number; requestId: string } & (
  { store: 'customRecipes'; data: CustomRecipe } | { store: 'favorites'; data: Favorite } | { store: 'menuTemplates'; data: MenuTemplate } | { store: 'plans'; data: Plan } | { store: 'actualMeals'; data: ActualMeal } | { store: 'shoppingLists'; data: ShoppingList }
);
export interface Recap {
  days: { date: LocalDate; status: 'recorded' | 'unrecorded'; recordCount: number }[];
  dishCounts: { recipeId: string; count: number }[]; mealCounts: Record<Meal, number>; categoryCounts: Partial<Record<DishType, number>>;
}

export interface ScaledIngredient {
  ingredient: Ingredient; originalQuantity: Quantity | null; quantity: Quantity | null;
  baseServings: number | null; factor: number | null; reason: string | null;
}
export interface ShoppingSource {
  kind: 'plan' | 'draft'; id: string; revision: number | null; digest: string;
  snapshots: RecipeSnapshot[]; servings: number;
}
export interface ShoppingFragment {
  sourceKind: ShoppingSource['kind']; sourceId: string; sourceRevision: number | null; sourceDigest: string;
  recipeIndex: number; ingredientIndex: number; snapshot: RecipeSnapshot; scaled: ScaledIngredient;
}
export interface ShoppingItem {
  key: string; name: string; ingredientId: string | null; form: string; part: string | null;
  quantity: Quantity | null; unknownEntries: ShoppingFragment[]; sources: ShoppingFragment[];
  userQuantity: string | null; purchased: boolean; manual: boolean;
}
export interface ShoppingListInput { sources: ShoppingSource[]; items: ShoppingItem[] }
export type ShoppingListEditInput = ShoppingListInput & { id?: string };
export interface ShoppingList extends ShoppingListInput {
  id: string; createdAt: UtcIso; updatedAt: UtcIso; revision: number; requestId: string;
}
export interface ShoppingDiff {
  added: ShoppingItem[]; removed: ShoppingItem[]; changed: { previous: ShoppingItem; next: ShoppingItem }[];
  previousEdits: ShoppingItem[];
}
