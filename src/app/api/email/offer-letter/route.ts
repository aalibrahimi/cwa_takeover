// src/app/api/email/offer-letter/route.ts

import { Hono } from "hono";
import { Resend } from "resend";
import { handle } from "hono/vercel";
import { DEV_CORS_ORIGINS, PROD_CORS_ORIGINS } from "../corsConfig";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import OfferLetter from "@email/offer-letter";
import { validator } from "hono/validator";
import { createClient } from "redis";
import { HTTPException } from "hono/http-exception";

const RESNED_API_KEY = process.env.RESEND_API_KEY;

const app = new Hono().basePath("/api/email");

const redis = createClient({
  url: process.env.REDIS_URL,
});

if (process.env.NODE_ENV === "development") {
  app.use(
    "/*",
    cors({
      origin: DEV_CORS_ORIGINS,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "apikey",
        "timestamp",
        "Access-Control-Allow-Origin",
      ],
      allowMethods: ["POST", "OPTIONS"],
    }),
    // supabaseMiddleware()
  );
} else {
  app.use(
    "/*",
    cors({
      origin: PROD_CORS_ORIGINS,
      allowHeaders: ["Content-Type", "Authorization", "apikey", "timestamp"],
      allowMethods: ["POST", "OPTIONS"],
      maxAge: 600,
    }),
    // supabaseMiddleware()
  );
}

app.use(logger());

interface OfferLetterParams {
  /** Sender details */
  from: {
    /** Name of Sender */
    name: string;
    /** Email of Sender */
    email: string;
  };
  /** Recipient email *( when multiple: **separate by comma** )* */
  to: string;
  /** Email Subject */
  subject: string;
  /** Email's body content ( text ) */
  body: string;
  /** File to with email */
  attachment: {
    /** File's name with extension (e.g. my_file.pdf) */
    filename: string;
    /** File content sent as text */
    textContent: string;
  };
}

app.post(
  "/offer-letter",
  validator("header", async (value, c) => {
    const bearerToken = value["authorization"];
    // *This is a custom header created by us
    const timestamp = value["timestamp"];
    if (!redis.isOpen) {
      await redis.connect();
    }

    const cachedToken = await redis.json.get(`bearer:${timestamp}`);
    if (cachedToken === null) {
      throw new HTTPException(400, {
        message: "No valid token found",
      });
    }

    // Check if sent bearer token is valid
    if (cachedToken !== bearerToken) {
      throw new HTTPException(400, {
        message: "Invalid Bearer Token received",
      });
    }

    return { bearerToken };
  }),
  async (c) => {
    if (!RESNED_API_KEY) {
      console.error("No Resend key found");
      return c.json({ error: "No Resend Key found" }, 400);
    }
    const resend = new Resend(RESNED_API_KEY);
    const body: OfferLetterParams = await c.req.json();

    // *Parse emails that are separated by comma
    const emailTo = body.to.split(",");

    // *Possibly need to change method of sending/receiving file
    const encodedFile = Buffer.from(body.attachment.textContent).toString(
      "base64",
    );

    const { data, error } = await resend.emails.send({
      from: `${body.from.name} <${body.from.email}>`,
      to: emailTo,
      subject: body.subject,
      react: OfferLetter(body.body),
      attachments: [
        {
          filename: body.attachment.filename,
          content: encodedFile,
        },
      ],
    });

    if (error) {
      return c.json(error, 400);
    }

    return c.json(data);
  },
);

export const POST = handle(app);
export const OPTIONS = handle(app);
