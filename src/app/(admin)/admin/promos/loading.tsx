import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/promos: header + form promo + daftar promo. */
export default function AdminPromosLoading() {
  return <AdminListLoading rows={3} showFilter={false} showForm={true} showMetrics />;
}
