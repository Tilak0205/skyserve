// routes/map.js
const express = require("express");
const turf = require("@turf/turf");

const router = express.Router();

// Calculate distance between two coordinates
router.post("/distance", (req, res) => {
  const { coordinates } = req.body; // Expected format: [{ lat, lng }, { lat, lng }]
  if (coordinates.length !== 2) {
    return res.status(400).json({ error: "Two coordinates are required." });
  }

  const from = turf.point([coordinates[0].lng, coordinates[0].lat]);
  const to = turf.point([coordinates[1].lng, coordinates[1].lat]);
  const options = { units: "kilometers" };

  const distance = turf.distance(from, to, options);
  res.json({ distance });
});

module.exports = router;
