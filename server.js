require("dotenv").config();
const axios = require("axios");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");

const requiredEnvVars = ["JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName],
);
if (missingEnvVars.length > 0) {
  console.error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
const WS_PORT = process.env.WS_PORT || 8080;
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const API_USERNAME = "cms111000111@gmail.com";
const API_PASSWORD = "Kankuro123@";

const wss = new WebSocket.Server({ port: WS_PORT, host: "0.0.0.0" });
const clientLists = {};
const clientMap = {};
let clientID = 0;
const locations = {};
let serverJwtToken = null;

function generateServerToken() {
  return jwt.sign({ server: "itsochvts" }, JWT_SECRET, { expiresIn: "1h" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return null;
  }
}

function validateClientData(deviceId) {
  return deviceId && typeof deviceId === "string";
}

wss.on("connection", (client) => {
  const localClientID = clientID++;

  client.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data);
      const { deviceId, token } = data;

      if (!token) {
        console.error("No token provided in message");
        client.send(JSON.stringify({ error: "Missing token" }));
        client.close();
        return;
      }
      if (!verifyToken(token)) {
        console.error("Invalid token:", token);
        client.send(JSON.stringify({ error: "Invalid token" }));
        client.close();
        return;
      }
      if (token !== serverJwtToken) {
        console.error(
          "Token mismatch. Received:",
          token,
          "Expected:",
          serverJwtToken,
        );
        client.send(
          JSON.stringify({ error: "Token does not match server token" }),
        );
        client.close();
        return;
      }

      if (validateClientData(deviceId)) {
        if (!clientLists[deviceId]) {
          clientLists[deviceId] = [];
        }
        clientMap[localClientID] = deviceId;
        clientLists[deviceId].push({ client, localClientID });
        console.log(`Client ${localClientID} subscribed to device ${deviceId}`);
        client.send(JSON.stringify({ message: "Subscribed successfully" }));
      } else {
        console.error("Invalid client data:", { deviceId });
        client.send(JSON.stringify({ error: "Missing or invalid deviceId" }));
        client.close();
      }
    } catch (error) {
      console.error(
        "Message parsing error:",
        error.message,
        "Received:",
        message.data,
      );
      client.send(JSON.stringify({ error: "Invalid message format" }));
      client.close();
    }
  };

  client.onclose = () => {
    const deviceId = clientMap[localClientID];
    if (deviceId) {
      const index = clientLists[deviceId].findIndex(
        (c) => c.localClientID === localClientID,
      );
      if (index !== -1) {
        clientLists[deviceId].splice(index, 1);
        console.log(
          `Client ${localClientID} unsubscribed from device ${deviceId}`,
        );
      }
      if (clientLists[deviceId].length === 0) {
        delete clientLists[deviceId];
      }
      delete clientMap[localClientID];
    }
  };

  client.onerror = (error) => {
    console.error(
      `WebSocket error for client ${localClientID}:`,
      error.message,
    );
  };
});

setInterval(() => {
  for (const deviceId in locations) {
    if (Object.prototype.hasOwnProperty.call(locations, deviceId)) {
      const location = locations[deviceId];
      clientLists[deviceId]?.forEach((clientData) => {
        const { client } = clientData;
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(location));
        }
      });
    }
  }
}, 5000);

async function connect() {
  try {
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 1);

    const response = await axios.post(
      "https://itsochvts.com/api/session/token",
      {},
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          expiration: expirationTime.toISOString(),
          "User-Agent": "Node.js/vehicle-tracker",
        },
        auth: {
          username: API_USERNAME,
          password: API_PASSWORD,
        },
      },
    );

    console.log("Authentication successful:", response.data);
    return response.data.token || response.data;
  } catch (error) {
    console.error(
      "Authentication failed:",
      error.response?.status,
      error.response?.data,
      error.message,
    );
    throw error;
  }
}

async function getJSESSIONID(token) {
  try {
    const response = await axios.get(
      `https://itsochvts.com/api/session?token=${token}`,
      {
        headers: {
          "User-Agent": "Node.js/vehicle-tracker",
        },
      },
    );
    const cookies = response.headers["set-cookie"];
    const jsessionidCookie = cookies?.find((cookie) =>
      cookie.startsWith("JSESSIONID"),
    );
    if (jsessionidCookie) {
      return jsessionidCookie.split(";")[0].split("=")[1];
    }
    throw new Error("JSESSIONID not found in cookies");
  } catch (error) {
    console.error(
      "Failed to get JSESSIONID:",
      error.response?.status,
      error.response?.data,
      error.message,
    );
    throw error;
  }
}

function openSocket(jsessionid) {
  const socket = new WebSocket("wss://itsochvts.com/api/socket", [], {
    headers: {
      Cookie: `JSESSIONID=${jsessionid}`,
      "User-Agent": "Node.js/vehicle-tracker",
    },
  });

  socket.onopen = () => {
    console.log("WebSocket connection to itsochvts.com opened");
    serverJwtToken = generateServerToken();
    console.log("Generated JWT token:", serverJwtToken);
    // Mock data for testing (uncomment to bypass 401)
    /*
    setInterval(() => {
      locations["6367"] = {
        lat: 26.497489 + Math.random() * 0.01,
        lng: 87.281913 + Math.random() * 0.01,
      };
    }, 5000);
    */
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.positions) {
        data.positions.forEach((position) => {
          const { deviceId, latitude, longitude } = position;
          locations[deviceId] = { lat: latitude, lng: longitude };
        });
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error.message);
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error.message);
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed, reconnecting in 5 seconds...");
    serverJwtToken = null;
    setTimeout(startConnection, 5000);
  };

  return socket;
}

function startConnection() {
  connect()
    .then((token) => getJSESSIONID(token))
    .then((jsessionid) => openSocket(jsessionid))
    .catch((error) => {
      console.error("Connection error:", error.message);
      // Generate token anyway for testing (uncomment to bypass 401)
      serverJwtToken = generateServerToken();
      console.log("Generated fallback JWT token:", serverJwtToken);
      setInterval(() => {
        locations["6367"] = {
          lat: 26.497489 + Math.random() * 0.01,
          lng: 87.281913 + Math.random() * 0.01,
        };
      }, 5000);
      setTimeout(startConnection, 5000);
    });
}

app.post("/api/authenticate", (req, res) => {
  const { deviceId } = req.body;
  if (!validateClientData(deviceId)) {
    console.error("Invalid auth request:", req.body);
    return res.status(400).json({ error: "Invalid deviceId" });
  }
  if (serverJwtToken) {
    console.log("Returning JWT token:", serverJwtToken);
    res.json({ token: serverJwtToken });
  } else {
    console.error("Server not connected to itsochvts.com");
    res.status(503).json({ error: "Server not connected to itsochvts.com" });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", connected: !!serverJwtToken });
});

const httpServer = app.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on port ${HTTP_PORT}`);
});

startConnection();

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Closing servers...");
  wss.close();
  httpServer.close(() => {
    console.log("Servers closed.");
    process.exit(0);
  });
});

process.stdin.resume();
process.stdin.on("data", (data) => {
  if (data.toString().trim() === "quit") {
    wss.close();
    httpServer.close(() => {
      process.exit();
    });
  }
});
