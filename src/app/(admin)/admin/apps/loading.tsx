import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/apps: header + form rilis + daftar rilis. */
export default function AdminAppsLoading() {
  return <AdminListLoading rows={2} showFilter={false} showForm={true} />;
}
