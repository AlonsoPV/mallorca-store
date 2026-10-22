export function PaymentProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (provider === "PAYPAL") {
    return (
      <svg viewBox="0 0 124 33" className={className} role="img" aria-label="PayPal">
        <title>PayPal</title>
        <path
          fill="#003087"
          d="M12.5 2.1h7.3c4.4 0 7.4 2.2 7 6.7-.5 5.3-3.8 8.3-8.3 8.3H15l-1.2 7.6H8.3L12.5 2.1zm3.2 5.1-1.5 9.3h2.5c2.4 0 4.3-1.4 4.6-4.2.3-2.3-1.1-5.1-4.2-5.1h-1.4z"
        />
        <path
          fill="#0070E0"
          d="M35.2 2.1h7.3c4.4 0 7.4 2.2 7 6.7-.5 5.3-3.8 8.3-8.3 8.3h-3.5L36.5 24.7h-5.5L35.2 2.1zm3.2 5.1-1.5 9.3h2.5c2.4 0 4.3-1.4 4.6-4.2.3-2.3-1.1-5.1-4.2-5.1h-1.4z"
        />
        <path
          fill="#003087"
          d="M57.6 8.6c1.2-1.6 3-2.5 5.2-2.5 3.8 0 5.8 2.6 5.8 6.6 0 4.6-2.5 8.4-6.6 8.4-2 0-3.6-.8-4.6-2.3v8.5h-5.4V6.4h5.2l.4 2.2zm5.5 7.3c0-1.8-.8-3-2.3-3s-2.5 1.3-2.5 3 .9 3 2.4 3 2.4-1.2 2.4-3zM75 6.1c4.3 0 7.4 3.1 7.4 8.2S79.3 22.6 75 22.6s-7.5-3.2-7.5-8.3 3.2-8.2 7.5-8.2zm0 11.5c1.6 0 2.4-1.5 2.4-3.3s-.8-3.2-2.4-3.2-2.5 1.4-2.5 3.2.9 3.3 2.5 3.3zM87.8 13.4c.1 2.8 2.6 3.8 5 3.8 1.5 0 2.9-.3 4.1-.8v4c-1.3.6-3.1 1-5.1 1-5 0-8.6-3-8.6-8.2 0-4.9 3.4-8.3 8-8.3s7.3 3.2 7.3 8.3v1.2h-10.7zm5.5-4.3c-1.8 0-2.8 1.1-3 2.8h5.8c0-1.6-1-2.8-2.8-2.8zM107.6 6.4l-3.4 16.1h-5.5l3.4-16.1h5.5zm2.4-4.6c0 1.7-1.3 3-3 3s-3-1.3-3-3 1.3-3 3-3 3 1.3 3 3zM119.8 6.4c2.5 0 4.6 1.7 4.2 4.9l-1.9 11.2h-5.4l1.8-10.6c.1-1-.4-1.6-1.3-1.6-.9 0-1.6.5-1.9 1.6l-1.8 10.6h-5.5l3.4-16.1h5.1l-.4 2.1c.9-1.5 2.6-2.1 4.7-2.1z"
        />
      </svg>
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
