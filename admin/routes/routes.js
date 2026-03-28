import express from "express";
import AdminController from "../authcontroller/Auth.js";
import adminMangement from '../adminMangement/adminManagement.js';
import usersMangement from '../users/user.js';
import AdminQr from '../AdminQr/qr.js';
import CreateUser from '../AdminQr/create_user/create-user-id.js'
const router = express.Router();

router.use("/admin", AdminController);
router.use('/admin', adminMangement);
router.use("/admin", usersMangement);
router.use("/admin", AdminQr);
router.use('/admin' , CreateUser);

export default router;