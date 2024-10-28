<template>
  <div id="app">
    <!-- User Management -->
    <div v-if="!isAuthenticated" class="auth">
      <h2>{{ authMode === 'login' ? 'Login' : 'Sign Up' }}</h2>
      <form @submit.prevent="authMode === 'login' ? login() : signup()">
        <input v-model="authData.username" placeholder="Username" required />
        <input v-model="authData.password" type="password" placeholder="Password" required />
        <button type="submit">{{ authMode === 'login' ? 'Login' : 'Sign Up' }}</button>
      </form>
      <button @click="toggleAuthMode">{{ authMode === 'login' ? 'Switch to Sign Up' : 'Switch to Login' }}</button>
    </div>

    <!-- Map and Controls -->
    <div v-else>
      <div ref="mapContainer" class="map-container"></div>
      <div class="controls">
        <input type="file" @change="handleFileUpload" accept=".geojson,.kml,.tif" />
        <button @click="saveMarkers">Save Markers</button>
        <button @click="clearMarkers">Clear All Markers</button>
        <div v-if="totalDistance !== null" class="distance-info">
          Total Distance: {{ totalDistance.toFixed(2) }} km
        </div>
        <button @click="logout">Logout</button>
      </div>
    </div>
  </div>
</template>

<script>
import mapboxgl from "mapbox-gl";
import axios from "axios";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

export default {
  data() {
    return {
      map: null,
      draw: null,
      markers: [],
      lineCoordinates: [],
      lineLayerId: "line-layer",
      totalDistance: 0,
      authData: {
        username: "",
        password: "",
      },
      isAuthenticated: false,
      authMode: "login",
    };
  },
  mounted() {
    mapboxgl.accessToken = process.env.VUE_APP_MAPBOX_TOKEN;

    // Check if there is a token and initialize the map if the user is authenticated
    if (localStorage.getItem("token")) {
      this.isAuthenticated = true;
      this.initializeMapWithDelay();
    }
  },
  methods: {
    toggleAuthMode() {
      this.authMode = this.authMode === "login" ? "signup" : "login";
    },

    async signup() {
      try {
        await axios.post("http://localhost:3000/auth/signup", this.authData);
        alert("Signup successful! Please log in.");
        this.authMode = "login";
      } catch (error) {
        console.error("Signup failed:", error);
        alert("Signup failed. Please try again.");
      }
    },

    async login() {
      try {
        const response = await axios.post("http://localhost:3000/auth/login", this.authData);
        localStorage.setItem("token", response.data.token);
        this.isAuthenticated = true;
        this.initializeMapWithDelay();
      } catch (error) {
        console.error("Login failed:", error);
        alert("Login failed. Please check your credentials.");
      }
    },

    logout() {
      localStorage.removeItem("token");
      this.isAuthenticated = false;
      this.clearMarkers(); // Optional: reset the map on logout
    },

    // Delay map initialization to ensure the map container is available
    initializeMapWithDelay() {
      setTimeout(() => {
        this.initializeMap();
      }, 100); // Delay to allow DOM to render
    },

    initializeMap() {
      // Check if the map container is available
      if (!this.$refs.mapContainer) {
        console.error("Map container not found.");
        return;
      }

      console.log("Initializing map...");
      
      // Initialize Mapbox
      this.map = new mapboxgl.Map({
        container: this.$refs.mapContainer,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [0, 0],
        zoom: 2,
      });

      // Initialize Mapbox Draw for Shape Drawing
      // Initialize Mapbox Draw
      this.draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true, // Enables the polygon tool
          line_string: true, // Enables the line tool
          point: true, // Enables the point tool
          trash: true, // Enables the trash tool to delete shapes
        },
      });
      this.map.addControl(this.draw);

      this.map.on("draw.create", this.saveShapes);
      this.map.on("draw.update", this.saveShapes);

      this.map.on("draw.modechange", (e) => {
        if (e.mode === "draw_polygon") {
          this.map.off("click", this.addMarker); // Disable custom click event
        } else {
          this.map.on("click", this.addMarker); // Re-enable click event outside of draw mode
        }
      });
      this.map.on("mousemove", "uploadedDataLayer", this.showHoverInfo);

      console.log("Map initialized successfully");
    },

    async handleFileUpload(event) {
      const file = event.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await axios.post("http://localhost:3000/upload", formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        const geojsonData = await axios.get(response.data.filePath);
        this.map.addSource("uploadedData", {
          type: "geojson",
          data: geojsonData.data,
        });

        this.map.addLayer({
          id: "uploadedDataLayer",
          type: "fill",
          source: "uploadedData",
          paint: {
            "fill-color": "#888888",
            "fill-opacity": 0.5,
          },
        });
      } catch (error) {
        console.error("File upload failed:", error);
      }
    },

    saveShapes() {
      const shapes = this.draw.getAll();
      console.log("Shapes saved:", shapes);
      // Optionally save shapes to backend if needed
    },

    showHoverInfo(e) {
      const coordinates = e.lngLat;
      const properties = e.features[0].properties;

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(`<h3>${properties.name || "No Name"}</h3><p>${properties.description || "No description"}</p>`)
        .addTo(this.map);
    },

    async addMarker(e) {
      console.log("Map clicked at:", e.lngLat);

      // Create a new marker at the clicked position
      const marker = new mapboxgl.Marker({ draggable: true })
        .setLngLat(e.lngLat)
        .addTo(this.map);

      // Store the marker in an array with its coordinates
      this.markers.push({
        marker, // Store the actual marker object
        coordinates: [e.lngLat.lng, e.lngLat.lat], // Save the coordinates
      });

      // Log the marker position for debugging
      console.log("Marker added at:", e.lngLat);

      // Event listener for deleting marker on double-click
      marker.getElement().addEventListener("dblclick", () => {
        this.deleteMarker(marker);
      });

      // Event listener to update marker position after dragging
      marker.on("dragend", () => {
        this.updateMarkerPosition(marker);
      });
    },

    deleteMarker(markerInstance) {
      // Find the marker in the markers array and remove it from the map
      const markerIndex = this.markers.findIndex(m => m.marker === markerInstance);
      if (markerIndex !== -1) {
        this.markers[markerIndex].marker.remove(); // Remove the marker instance from the map
        this.markers.splice(markerIndex, 1); // Remove it from the array
        console.log("Marker deleted");

        // Optionally, update the line or total distance if needed
        this.updateLineAndDistance();
      }
    },


    updateLineAndDistance() {
      // Reset line coordinates from the updated markers
      this.lineCoordinates = this.markers.map(m => m.coordinates);
      
      // Recalculate distance if needed and update the line
      this.drawLine();
      this.calculateTotalDistance();
    },

    updateMarkerPosition(marker) {
      // Find the marker in the markers array and update its coordinates
      const markerData = this.markers.find(m => m.marker === marker);
      if (markerData) {
        const lngLat = marker.getLngLat();
        markerData.coordinates = [lngLat.lng, lngLat.lat];
        console.log("Updated marker position:", markerData.coordinates);
      }
    },

    async calculateSegmentDistance() {
      const coordinates = this.lineCoordinates;
      const from = coordinates[coordinates.length - 2];
      const to = coordinates[coordinates.length - 1];

      try {
        const response = await axios.post("http://localhost:3000/map/distance", {
          coordinates: [
            { lat: from[1], lng: from[0] },
            { lat: to[1], lng: to[0] },
          ],
        });
        const segmentDistance = response.data.distance;
        this.totalDistance += segmentDistance;
      } catch (error) {
        console.error("Distance measurement failed:", error);
      }
    },

    drawLine() {
      const coordinates = JSON.parse(JSON.stringify(this.lineCoordinates));

      if (this.map.getLayer(this.lineLayerId)) {
        this.map.getSource(this.lineLayerId).setData({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: coordinates,
          },
        });
      } else {
        this.map.addSource(this.lineLayerId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: coordinates,
            },
          },
        });

        this.map.addLayer({
          id: this.lineLayerId,
          type: "line",
          source: this.lineLayerId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ff0000",
            "line-width": 3,
          },
        });
      }
    },

    clearMarkers() {
      // Iterate over markers and remove the marker property from each
      this.markers.forEach(m => m.marker.remove());
      this.markers = []; // Clear the markers array
      this.lineCoordinates = []; // Reset line coordinates
      this.totalDistance = 0; // Reset total distance

      // Remove the line layer if it exists
      if (this.map.getLayer(this.lineLayerId)) {
        this.map.removeLayer(this.lineLayerId);
        this.map.removeSource(this.lineLayerId);
      }
    },

    saveMarkers() {
      // Save only the coordinates of each marker
      const markerCoordinates = this.markers.map(m => m.coordinates);
      console.log("Markers saved:", markerCoordinates);
      // Here you could send markerCoordinates to a backend if needed
    },
  },
};
</script>

<style>
.map-container {
  height: 100vh;
  width: 100%;
}

.controls {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: white;
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
}

.distance-info {
  margin-top: 10px;
  font-weight: bold;
}

.auth {
  display: flex;
  flex-direction: column;
  max-width: 300px;
  margin: auto;
}
</style>
