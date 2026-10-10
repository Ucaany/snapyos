/**
 * Server component helper — render hidden `<input>` untuk semua field query
 * yang TIDAK di-list di `except`. Dipakai di form filter GET agar param
 * lain (mis. `from`, `to`, `page`) tetap tersisip saat user mengubah satu filter.
 */
type Props = {
  current: Record<string, string | string[] | undefined>;
  except: string[];
};

export function PreserveSearchParams({ current, except }: Props) {
  const skip = new Set(except);
  const inputs: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(current)) {
    if (skip.has(key)) continue;
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      raw.forEach((entry, index) => {
        if (entry === undefined || entry === null || entry === "") return;
        inputs.push({ key: `${key}-${index}`, value: entry });
      });
    } else {
      inputs.push({ key, value: raw });
    }
  }
  return (
    <>
      {inputs.map((input) => (
        <input
          key={input.key}
          type="hidden"
          name={input.key.replace(/-\d+$/, "")}
          value={input.value}
        />
      ))}
    </>
  );
}
