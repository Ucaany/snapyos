import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/subscriptions: header + panel langganan. */
export default function AdminSubscriptionsLoading() {
  return <AdminListLoading rows={4} showFilter={false} showForm={false} showMetrics />;
}
