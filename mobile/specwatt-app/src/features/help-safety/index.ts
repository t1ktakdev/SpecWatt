/**
 * SpecWATT Help / Safety / Privacy module.
 *
 * Everything lives inside src/features/help-safety; the only shared-app
 * touchpoints are three thin route wrappers in src/app (help, safety,
 * privacy) following the existing one-line re-export convention. Shared
 * navigation and screens are not modified.
 */
export { HelpCenterScreen } from "./HelpCenterScreen";
export { SafetyCenterScreen } from "./SafetyCenterScreen";
export { PrivacyCenterScreen } from "./PrivacyCenterScreen";
export {
  articlesInCategory,
  helpArticles,
  helpCategories,
  moduleString,
  normalizeQuery,
  policyDraft,
  privacySections,
  resultCount,
  safetyRules,
  searchHelp,
  tokenize,
} from "./content";
