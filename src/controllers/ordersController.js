const prisma = require("../config/prismaClient");
const AppError = require("../utils/AppError");
const { PLANS } = require("../config/plans");
const { requestPayment, verifyPayment } = require("../services/zarinpalService");
const { recordAudit } = require("../services/auditLogService");

// POST /orders -- start a plan purchase or a free-amount top-up.
// body: { type: "plan_purchase" | "topup", planCode?, amountToman? }
async function createOrder(req, res, next) {
  try {
    const { type, planCode, amountToman: requestedAmount } = req.body;

    let amountToman;
    if (type === "plan_purchase") {
      const plan = PLANS[planCode];
      if (!plan || !plan.price) {
        throw new AppError(`Unknown or free planCode: ${planCode}`, 400, "INVALID_PLAN");
      }
      amountToman = plan.price;
    } else if (type === "topup") {
      amountToman = Number(requestedAmount);
      if (!Number.isFinite(amountToman) || amountToman <= 0) {
        throw new AppError("amountToman must be a positive number for topup", 400, "INVALID_AMOUNT");
      }
    } else {
      throw new AppError('type must be "plan_purchase" or "topup"', 400, "INVALID_ORDER_TYPE");
    }

    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        type,
        planCode: type === "plan_purchase" ? planCode : null,
        amountToman,
        status: "pending",
      },
    });

    const { authority, paymentUrl } = await requestPayment({
      amountToman,
      description: type === "plan_purchase" ? `خرید پلن ${planCode}` : "شارژ کیف‌پول",
      orderId: order.id,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { zarinpalAuthority: authority },
    });

    return res.status(201).json({ order: { id: order.id, amountToman, status: "pending" }, paymentUrl });
  } catch (err) {
    return next(err);
  }
}

// POST /orders/verify -- Frontend calls this after the user lands back on
// its own callback page (with ?Authority=...&Status=... from Zarinpal).
// body: { authority: string }
async function verifyOrder(req, res, next) {
  try {
    const { authority } = req.body;
    if (!authority) {
      throw new AppError("authority is required", 400, "VALIDATION_ERROR");
    }

    const order = await prisma.order.findUnique({ where: { zarinpalAuthority: authority } });
    if (!order || order.userId !== req.user.id) {
      throw new AppError("Order not found for this authority", 404, "ORDER_NOT_FOUND");
    }

    if (order.status === "paid") {
      return res.status(200).json({ order: { id: order.id, status: "paid", refId: order.zarinpalRefId } });
    }

    const { success, refId } = await verifyPayment({ amountToman: order.amountToman, authority });

    if (!success) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "failed" } });
      throw new AppError("Payment verification failed", 402, "PAYMENT_VERIFICATION_FAILED");
    }

    const [, updatedOrder] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: req.user.id },
        data: { balance: { increment: order.amountToman } },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { status: "paid", zarinpalRefId: String(refId), paidAt: new Date() },
      }),
    ]);

    recordAudit({
      userId: req.user.id,
      action: "order_paid",
      entityType: "Order",
      entityId: order.id,
      metadata: { amountToman: order.amountToman, planCode: order.planCode, refId },
    });

    return res.status(200).json({ order: { id: updatedOrder.id, status: "paid", refId: updatedOrder.zarinpalRefId } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createOrder, verifyOrder };