import express from "express";
import AdminController from "../authcontroller/Auth.js";
import adminMangement from '../adminMangement/adminManagement.js';
import usersMangement from '../users/user.js';
import AdminQr from '../AdminQr/qr.js';

const router = express.Router();

router.use("/admin", AdminController);
router.use('/admin', adminMangement);
router.use("/admin", usersMangement);
router.use("/admin", AdminQr);

export default router;