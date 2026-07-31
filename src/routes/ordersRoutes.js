const express = require("express");
const authenticate = require("../middleware/authenticate");
const ordersController = require("../controllers/ordersController");

const router = express.Router();
router.use(authenticate);
router.post("/", ordersController.createOrder);
router.post("/verify", ordersController.verifyOrder);

module.exports = router;