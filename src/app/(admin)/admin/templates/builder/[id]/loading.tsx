import { AdminListLoading } from "@/components/admin/AdminListLoading";

/** Bentuk builder template: header + kanvas editor. */
export default function AdminTemplateBuilderLoading() {
  return <AdminListLoading rows={2} showFilter={false} showForm={false} />;
}
