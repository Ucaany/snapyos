import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk /admin/gateways: header + metrik + filter + tabel credential. */
export default function AdminGatewaysLoading() {
  return <AdminListLoading rows={8} showFilter={true} showForm={false} showMetrics />;
}
