import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/templates: header + kartu kategori + daftar template. */
export default function AdminTemplatesLoading() {
  return <AdminListLoading rows={3} showFilter={false} showForm={true} />;
}
