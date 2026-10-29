import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk detail user: header + strip metrik + panel riwayat. */
export default function AdminUserDetailLoading() {
  return <AdminListLoading rows={3} showFilter={false} showForm={false} />;
}
