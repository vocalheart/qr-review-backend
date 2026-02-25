import express from "express";
import AdminController from "../authcontroller/Auth.js";
import adminMangement from '../adminMangement/adminManagement.js';
import usersMangement from '../users/user.js'
const router = express.Router();

router.use("/admin", AdminController);
router.use('/admin', adminMangement)
router.use("/admin", usersMangement)
export default router;