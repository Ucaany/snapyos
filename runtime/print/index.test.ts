import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyCupsState,
  classifyWindowsStatus,
  parseCupsJobs,
  parseCupsMedia,
  parseCupsPrinters,
  parseWindowsJobs,
  parseWindowsPrinters,
} from "./index.ts";

test("parseCupsPrinters menandai default dan mengurutkan nama", () => {
  const output = [
    "printer DNP is idle. enabled since Thu",
    "printer Selphy is idle. enabled since Thu",
    "system default destination: Selphy",
  ].join("\n");
  assert.deepEqual(parseCupsPrinters(output), [
    { name: "DNP", default: false },
    { name: "Selphy", default: true },
  ]);
});

test("parseWindowsPrinters memakai format Name|True", () => {
  assert.deepEqual(parseWindowsPrinters("DNP|False\r\nSelphy|True\r\n"), [
    { name: "DNP", default: false },
    { name: "Selphy", default: true },
  ]);
});

test("classifyCupsState membedakan disabled/offline/busy/ok", () => {
  assert.equal(classifyCupsState("printer X is X disabled since now"), "disabled");
  assert.equal(classifyCupsState("printer X is X, accepting requests\nThe printer is offline."), "offline");
  assert.equal(classifyCupsState("printer X now printing X-1"), "busy");
  assert.equal(classifyCupsState("printer X is idle. enabled since Thu"), "ok");
  assert.equal(classifyCupsState("unknown"), "unknown");
});

test("classifyWindowsStatus memetakan PrinterStatus", () => {
  assert.equal(classifyWindowsStatus("Normal"), "ok");
  assert.equal(classifyWindowsStatus("Processing"), "busy");
  assert.equal(classifyWindowsStatus("Paused"), "disabled");
  assert.equal(classifyWindowsStatus("Offline"), "offline");
  assert.equal(classifyWindowsStatus(""), "unknown");
});

test("parseCupsJobs membaca id, ukuran, dan printer", () => {
  assert.deepEqual(parseCupsJobs("DNP-42 alice 1024 Wed 11 Nov 2026", "DNP"), [
    { id: "DNP-42", printer: "DNP", state: "queued", size: 1024 },
  ]);
});

test("parseWindowsJobs membaca id dan state", () => {
  assert.deepEqual(parseWindowsJobs("7|struk.pdf|Printing|2048", "Selphy"), [
    { id: "7", printer: "Selphy", state: "printing", size: 2048 },
  ]);
});

test("parseCupsMedia mengambil baris media/form", () => {
  assert.equal(parseCupsMedia("  media: Custom.100x150mm"), "Custom.100x150mm");
  assert.equal(parseCupsMedia("printer X is idle"), null);
});
