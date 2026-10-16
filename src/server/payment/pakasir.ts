import "server-only"
import { createPakasirGateway } from "@/server/payment/providers/pakasir"

/**
 * Gateway Pakasir agregator (env platform), dipakai HANYA untuk memverifikasi
 * status payment legacy in-flight yang dibuat sebelum credential per-business
 * (lihat verifyPakasirPaid). Payment baru selalu lewat credential tenant.
 */
export const pakasirAggregatorGateway = createPakasirGateway(null)
