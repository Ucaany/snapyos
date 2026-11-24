import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
      /** "staff" = sesi dari login PIN; hanya boleh mengakses membership staff. */
      scope?: "staff";
      /** Business penerbit PIN; sesi staff hanya sah untuk business ini. */
      pinBusiness?: string;
    } & DefaultSession["user"];
  }
}
