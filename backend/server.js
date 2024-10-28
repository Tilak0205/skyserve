const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');
const dotenv = require("dotenv");

const allowedOrigins = ['https://skyserve-kd9hflr4x-tilak0205s-projects.vercel.app/', 'http://localhost:8080'];


const corsOptions = {
  origin: allowedOrigins,
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
};

dotenv.config();
const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// Routes
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const mapRoutes = require("./routes/map");

app.use("/auth", authRoutes);
app.use("/upload", uploadRoutes);
app.use("/map", mapRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
