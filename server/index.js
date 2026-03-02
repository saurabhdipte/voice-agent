import express from "express";
import { google } from "googleapis";
import fs from "fs";

const app = express();
app.use(express.json());
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

app.get("/create", async (req, res) => {
  try {
    const event = {
      summary: "Test Meeting",
      start: {
        dateTime: "2026-03-01T15:00:00-05:00",
      },
      end: {
        dateTime: "2026-03-01T15:30:00-05:00",
      },
    };

    const response = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      requestBody: event,
    });

    res.json(response.data);
  } catch (err) {
    res.json({ error: err.message });
  }
});
app.post("/book", async (req, res) => {
  try {
    const { name, title, startISO, endISO } = req.body;

    if (!startISO || !endISO) {
      return res.status(400).json({ error: "startISO and endISO are required" });
    }

    const event = {
      summary: title?.trim() || "Scheduled Meeting",
      description: name ? `Booked via voice agent for: ${name}` : "Booked via voice agent",
      start: { dateTime: startISO },
      end: { dateTime: endISO },
    };

    const response = await calendar.events.insert({
      calendarId:
        process.env.CALENDAR_ID,
      requestBody: event,
    });

    return res.json({
      ok: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
      summary: response.data.summary,
      start: response.data.start?.dateTime,
      end: response.data.end?.dateTime,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/vapi/webhook", async (req, res) => {
  try {
    const message = req.body?.message;

    if (!message || message.type !== "tool-calls") {
      return res.json({ ok: true });
    }

    const toolCalls = message.toolCallList || [];
    const results = [];

    for (const call of toolCalls) {
      if (call.name !== "create_calendar_event") continue;

      const { name, title, startISO, endISO } = call.parameters || {};

      const event = {
        summary: title || "Scheduled Meeting",
        description: name ? `Booked for: ${name}` : "Booked via voice assistant",
        start: { dateTime: startISO },
        end: { dateTime: endISO },
      };

      const response = await calendar.events.insert({
        calendarId: process.env.CALENDAR_ID,
        requestBody: event,
      });

      results.push({
        toolCallId: call.id,
        name: call.name,
        result: JSON.stringify({
          ok: true,
          htmlLink: response.data.htmlLink,
        }),
      });
    }

    return res.json({ results });
  } catch (err) {
    return res.json({
      results: [
        {
          name: "create_calendar_event",
          result: JSON.stringify({ ok: false, error: err.message }),
        },
      ],
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});