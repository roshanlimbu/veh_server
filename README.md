# Map Server

A simple map server with CSV-based authentication, JWT issuance, and WebSocket support.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm run dev
   # or
   npm start
   ```

## CSV Format

The `users.csv` file should be in the project root with the following columns:

```
username,password,device_id
student1,<bcrypt-hash>,device123
```

## REST API

### POST /login

Authenticate and receive a JWT token.

**Request Body:**

```
{
  "student_id": "student1",
  "device_id": "device123",
  "password": "yourpassword"
}
```

**Response:**

```
{
  "token": "<JWT token>"
}
```

## WebSocket

Connect to the WebSocket server using the JWT token:

```
ws://localhost:3000?token=<JWT token>
```

On successful connection, you'll receive a mock map data message.

---

**Note:**

- Change `JWT_SECRET` in `server.js` for production use.
- Use bcrypt to hash new passwords for the CSV file.
