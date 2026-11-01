/**
 * Admin platform — docs/10-admin-platform.md (data layer).
 * Barrel re-export: backward compat untuk `import { ... } from "@/server/admin"`.
 */

export { adminEmails, isAdminEmail, isAdminUser, requireAdmin, getAdminUser } from "./guard";
export {
  type AdminOverview,
  getAdminOverviewGuarded,
  type AdminPaymentRow,
  type AdminPaymentQuery,
  type AdminPaymentSummary,
  type AdminAnalytics,
  type DatabaseHealth,
  type UserBreakdown,
  listPayments,
  getPaymentsSummary,
  getAdminAnalytics,
  getDatabaseHealth,
} from "./overview";
export {
  type AdminUserRow,
  type UserDetail,
  listUsers,
  getUserDetail,
  updateUser,
  createUser,
  deleteUser,
} from "./users";
export {
  type AdminBusinessRow,
  listBusinesses,
  getBusinessUsage,
  updateBusiness,
  deleteBusiness,
} from "./businesses";
export { type AdminPlanRow, listPlans, createPlan, updatePlan } from "./plans";
export { type AdminAddOnRow, listAddOns, createAddOn, updateAddOn } from "./addons";
export {
  type AdminSubscriptionRow,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  attachSubscriptionAddOn,
  updateSubscriptionAddOn,
  cancelSubscriptionAddOn,
} from "./subscriptions";
export {
  type AdminIntentFailureRow,
  type IntentFailureStatus,
  listIntentFailures,
  activateManually,
  markRefunded,
  dismissFailure,
} from "./subscription-failures";
export { type PlatformSettings, getPlatformSettings, updatePlatformSettings } from "./settings";
export {
  type AdminTemplateCategoryRow,
  type AdminTemplateRow,
  listTemplateCategories,
  createTemplateCategory,
  deleteTemplateCategory,
  listGlobalTemplates,
  createGlobalTemplate,
  updateGlobalTemplate,
  setGlobalTemplateActive,
  uploadGlobalTemplateFile,
  type AdminTemplateBuilderRow,
  getGlobalTemplate,
  updateGlobalTemplateLayout,
  uploadGlobalTemplateThumbnail,
  replaceGlobalTemplateFrame,
  deleteGlobalTemplate,
  listTemplatePurchases,
  type AdminTemplatePurchaseRow,
} from "./templates";
export { adminPosRevenueSummary } from "./pos";
export { type AdminPromoRow, listPromos, createPromo, updatePromo } from "./promos";
export { type AdminAuditRow, listAuditLogs, deleteAuditLogs } from "./audit";
export {
  type AdminGatewayCredentialRow,
  type AdminGatewayState,
  type GatewayProviderKey,
  GATEWAY_PROVIDERS,
  getGatewayState,
  setGatewayEnabled,
} from "./gateways";
export {
  type AdminSupportTicketRow,
  listSupportTicketsAdmin,
  updateSupportTicketStatus,
} from "./support";
export {
  type AdminBroadcastRow,
  type AdminBroadcastStats,
  type AdminBroadcastRecipientRow,
  type BroadcastAudience,
  type BroadcastStatus,
  type BroadcastTemplateKey,
  listBroadcasts,
  getBroadcastStats,
  listBroadcastRecipients,
  createBroadcast,
  sendBroadcast,
  resendBroadcast,
} from "./broadcast";
