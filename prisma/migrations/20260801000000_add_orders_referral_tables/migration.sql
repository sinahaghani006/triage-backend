CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plan_code" TEXT,
    "amount_toman" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "zarinpal_authority" TEXT,
    "zarinpal_ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_redemptions" (
    "id" TEXT NOT NULL,
    "referral_code_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "credited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_zarinpal_authority_key" ON "orders"("zarinpal_authority");
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE UNIQUE INDEX "referral_redemptions_invited_user_id_key" ON "referral_redemptions"("invited_user_id");
CREATE INDEX "referral_redemptions_referral_code_id_idx" ON "referral_redemptions"("referral_code_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;