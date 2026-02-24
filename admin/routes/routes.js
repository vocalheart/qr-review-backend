import express from "express";
import AdminController from "../authcontroller/Auth.js";

const router = express.Router();

router.use("/admin", AdminController);

export default router;