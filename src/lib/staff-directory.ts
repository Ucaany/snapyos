/**
 * Pure builder direktori staff (owner) — member + akses booth + transaksi hari ini.
 * Dipakai src/server/staff.ts; tanpa "server-only" supaya bisa dites terpisah.
 * Transaksi hari ini = status PAID, sudah diagregasi per booth di database
 * (RPC staff_directory_today, migrasi 0037). Builder ini hanya menggabungkan
 * agregat per booth ke setiap staff sesuai member_photoboxes (0018) —
 * transactions tidak punya kolom aktor, jadi atribusi via booth ter-assign.
 */

export type BoothLite = { id: string; name: string; status: string };

export type StaffDirectoryMember = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  joinedAt: string;
};

export type StaffDirectoryRow = StaffDirectoryMember & {
  booths: BoothLite[];
  todayCount: number;
  todayRevenue: number;
};

export type StaffDirectoryResult = {
  rows: StaffDirectoryRow[];
  totals: { count: number; revenue: number };
};

/** Baris agregat per booth dari RPC staff_directory_today. */
export type StaffDirectoryBoothAgg = {
  photobox_id: string;
  revenue: number;
  tx_count: number;
};

export function buildStaffDirectory(input: {
  members: StaffDirectoryMember[];
  assignments: { user_id: string; photobox_id: string }[];
  photoboxes: BoothLite[];
  todayTx: StaffDirectoryBoothAgg[];
}): StaffDirectoryResult {
  const perBooth = new Map<string, { count: number; revenue: number }>();
  let totalCount = 0;
  let totalRevenue = 0;
  for (const agg of input.todayTx) {
    const count = Number(agg.tx_count ?? 0);
    const revenue = Number(agg.revenue ?? 0);
    perBooth.set(agg.photobox_id, { count, revenue });
    totalCount += count;
    totalRevenue += revenue;
  }

  const boothsById = new Map(input.photoboxes.map((booth) => [booth.id, booth]));
  const assignedIds = new Map<string, string[]>();
  for (const assignment of input.assignments) {
    if (!boothsById.has(assignment.photobox_id)) continue;
    const ids = assignedIds.get(assignment.user_id) ?? [];
    ids.push(assignment.photobox_id);
    assignedIds.set(assignment.user_id, ids);
  }

  const rows = input.members.map((member) => {
    const booths = (assignedIds.get(member.userId) ?? [])
      .map((id) => boothsById.get(id))
      .filter((booth): booth is BoothLite => Boolean(booth));
    let todayCount = 0;
    let todayRevenue = 0;
    for (const booth of booths) {
      const agg = perBooth.get(booth.id);
      if (agg) {
        todayCount += agg.count;
        todayRevenue += agg.revenue;
      }
    }
    return { ...member, booths, todayCount, todayRevenue };
  });

  return { rows, totals: { count: totalCount, revenue: totalRevenue } };
}
