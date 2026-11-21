import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/support: header + filter + tabel tiket. */
export default function AdminSupportLoading() {
  return <AdminListLoading rows={8} showFilter={true} showForm={false} showMetrics />;
}
