const { zarinpalMerchantId, zarinpalCallbackUrl } = require("../config/env");
const AppError = require("../utils/AppError");

// Sandbox only for now (2026-08-01) -- swap to the production Zarinpal
// base URL here once a real merchant code is issued; nothing else changes.
const ZARINPAL_BASE_URL = "https://sandbox.zarinpal.com";
const ZARINPAL_STARTPAY_URL = `${ZARINPAL_BASE_URL}/pg/StartPay`;
const ZARINPAL_REQUEST_URL = `${ZARINPAL_BASE_URL}/pg/v4/payment/request.json`;
const ZARINPAL_VERIFY_URL = `${ZARINPAL_BASE_URL}/pg/v4/payment/verify.json`;

// Zarinpal amounts are in Rial; the rest of this project uses Toman.
function tomanToRial(amountToman) {
  return amountToman * 10;
}

async function requestPayment({ amountToman, description, orderId }) {
  const response = await fetch(ZARINPAL_REQUEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: zarinpalMerchantId,
      amount: tomanToRial(amountToman),
      description,
      callback_url: zarinpalCallbackUrl,
      metadata: { order_id: orderId },
    }),
  });
  const json = await response.json();

  if (!json?.data?.authority || json?.data?.code !== 100) {
    throw new AppError(
      `Zarinpal payment request failed: ${json?.errors?.message || "unknown error"}`,
      502,
      "ZARINPAL_REQUEST_FAILED",
    );
  }

  return {
    authority: json.data.authority,
    paymentUrl: `${ZARINPAL_STARTPAY_URL}/${json.data.authority}`,
  };
}

async function verifyPayment({ amountToman, authority }) {
  const response = await fetch(ZARINPAL_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: zarinpalMerchantId,
      amount: tomanToRial(amountToman),
      authority,
    }),
  });
  const json = await response.json();

  // Zarinpal: code 100 = first-time verify success, 101 = already verified
  // (treat both as success -- 101 just means we're re-checking).
  const success = json?.data?.code === 100 || json?.data?.code === 101;
  return {
    success,
    refId: json?.data?.ref_id ?? null,
    rawCode: json?.data?.code ?? null,
  };
}

module.exports = { requestPayment, verifyPayment, tomanToRial };