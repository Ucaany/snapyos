import test from "node:test";
import assert from "node:assert/strict";

import { turnstileDisabled, turnstileEnabled, verifyTurnstile } from "./turnstile.ts";

/**
 * Semua kasus di bawah sengaja tidak mengirim token, jadi tidak ada request
 * jaringan ke siteverify: jalur yang diuji adalah keputusan gate, bukan HTTP.
 */

const KEYS = [
  "TURNSTILE_DISABLED",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_ALLOWED_HOSTNAMES",
  "NODE_ENV",
] as const;

/** NODE_ENV bertipe readonly di @types/node; tes butuh menulisnya. */
const envStore = process.env as Record<string, string | undefined>;

function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>, fn: () => Promise<void>) {
  return async () => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, envStore[k]]));
    for (const k of KEYS) delete envStore[k];
    Object.assign(envStore, env);
    try {
      await fn();
    } finally {
      for (const k of KEYS) {
        const value = saved[k];
        if (value === undefined) delete envStore[k];
        else envStore[k] = value;
      }
    }
  };
}

void test(
  "kill switch: TURNSTILE_DISABLED melewati gate walau production tanpa secret",
  withEnv({ NODE_ENV: "production", TURNSTILE_DISABLED: "1" }, async () => {
    assert.equal(turnstileDisabled(), true);
    assert.equal(await verifyTurnstile(""), true);
    assert.equal(await verifyTurnstile(null), true);
    assert.equal(await verifyTurnstile(undefined), true);
  })
);

void test(
  "kill switch: varian nilai yang dianggap aktif dan tidak aktif",
  withEnv({}, async () => {
    for (const value of ["1", "true", "TRUE", "yes", " on "]) {
      process.env.TURNSTILE_DISABLED = value;
      assert.equal(turnstileDisabled(), true, `"${value}" harus dianggap aktif`);
    }
    for (const value of ["", "0", "false", "off", "no", "2"]) {
      process.env.TURNSTILE_DISABLED = value;
      assert.equal(turnstileDisabled(), false, `"${value}" tidak boleh mengaktifkan kill switch`);
    }
  })
);

void test(
  "tanpa kill switch: production + secret kosong tetap fail-closed",
  withEnv({ NODE_ENV: "production" }, async () => {
    assert.equal(turnstileDisabled(), false);
    assert.equal(await verifyTurnstile("token-apa-saja"), false);
  })
);

void test(
  "tanpa kill switch: non-production + secret kosong dilewati (dev)",
  withEnv({ NODE_ENV: "development" }, async () => {
    assert.equal(await verifyTurnstile(""), true);
  })
);

void test(
  "tanpa kill switch: production + secret ada tapi token kosong ditolak",
  withEnv(
    {
      NODE_ENV: "production",
      TURNSTILE_SECRET_KEY: "secret-dummy",
      TURNSTILE_ALLOWED_HOSTNAMES: "snapyos.site",
    },
    async () => {
      assert.equal(await verifyTurnstile(""), false);
      assert.equal(await verifyTurnstile(null), false);
    }
  )
);

void test(
  "tanpa kill switch: production + secret ada tapi hostname belum dikonfigurasi ditolak",
  withEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret-dummy" }, async () => {
    assert.equal(await verifyTurnstile("token-apa-saja"), false);
  })
);

void test(
  "turnstileEnabled: false saat kill switch aktif walau secret terisi",
  withEnv({ TURNSTILE_DISABLED: "1", TURNSTILE_SECRET_KEY: "secret-dummy" }, async () => {
    assert.equal(turnstileEnabled(), false);
  })
);

void test(
  "turnstileEnabled: mengikuti secret saat kill switch tidak aktif",
  withEnv({}, async () => {
    assert.equal(turnstileEnabled(), false);
    process.env.TURNSTILE_SECRET_KEY = "secret-dummy";
    assert.equal(turnstileEnabled(), true);
    process.env.TURNSTILE_DISABLED = "0";
    assert.equal(turnstileEnabled(), true);
  })
);
