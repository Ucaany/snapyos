import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/add-ons: header + form + daftar panel add-on. */
export default function AdminAddOnsLoading() {
  return <AdminListLoading rows={6} showFilter={false} showForm={true} showMetrics />;
}
