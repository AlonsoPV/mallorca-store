import paypalLogo from "@assets/pp_h_rgb_logo_tn.webp";

export function PaymentProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (provider === "PAYPAL") {
    return (
      <img
        src={paypalLogo}
        alt="PayPal"
        className={className}
        decoding="async"
      />
    );
  }
  if (provider === "MERCADO_PAGO" || provider === "ONLINE") {
    return (
      <svg viewBox="0 0 160 32" className={className} role="img" aria-label="Mercado Pago">
        <title>Mercado Pago</title>
        <rect width="32" height="32" rx="6" fill="#009EE3" />
        <path fill="#fff" d="M8.2 22.4 16 9.6l7.8 12.8H8.2zm3.4-2.2h9.2L16 13.4l-4.4 6.8z" />
        <text x="40" y="21" fill="#009EE3" fontFamily="Arial, Helvetica, sans-serif" fontSize="13" fontWeight="700">
          Mercado Pago
        </text>
      </svg>
    );
  }
  return null;
}

export function paymentProviderTitle(code: string) {
  if (code === "PAYPAL") return "PayPal";
  if (code === "MERCADO_PAGO" || code === "ONLINE") return "Mercado Pago";
  return null;
}
