import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/broadcasts: header + form draft + daftar kampanye. */
export default function AdminBroadcastsLoading() {
  return <AdminListLoading rows={3} showFilter={false} showForm={true} showMetrics />;
}
