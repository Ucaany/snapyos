import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk antrian review: header + tab status + panel kasus. */
export default function AdminPendingReviewLoading() {
  return <AdminListLoading rows={4} showFilter={false} showForm={false} showMetrics />;
}
