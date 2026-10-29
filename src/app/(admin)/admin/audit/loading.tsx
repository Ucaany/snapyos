import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/audit: header + filter + tabel log. */
export default function AdminAuditLoading() {
  return <AdminListLoading rows={10} showFilter={true} showForm={false} />;
}
