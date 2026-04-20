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
const resend = new Resend();

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
      allowHeaders: ["Content-Type", "Authorization", "apikey"],
      allowMethods: ["POST", "OPTIONS"],
      maxAge: 600,
    }),
    // supabaseMiddleware()
  );
}

app.use(logger());

interface OfferLetterParams {
  from: {
    name: string;
    email: string;
  };
  to: string;
  subject: string;
  body: string;
}

app.post(
  "/offer-letter",
  validator("header", async (value, c) => {
    const bearerToken = value["bearer"];
    const timestamp = value["timestamp"];
    if (!redis.isOpen) {
      await redis.connect();
    }

    const cachedToken = await redis.json.get(`bearer:${timestamp}`)
    if (cachedToken === null) {
      throw new HTTPException(400, {
        message: "No valid token found"
      })
    }

    // Check if sent bearer token is valid
    if (cachedToken !== bearerToken) {
      throw new HTTPException(400, {
        message: "Invalid Bearer Token received"
      })
    }

    return { bearerToken };
  }),
  async (c) => {
    const body: OfferLetterParams = await c.req.json();

    // *Parse emails that are separated by comma
    const emailTo = body.to.split(",");

    const { data, error } = await resend.emails.send({
      from: `${body.from.name} <${body.from.email}>`,
      to: emailTo,
      subject: body.subject,
      react: OfferLetter(body.body),
    });

    if (error) {
      return c.json(error, 400);
    }

    return c.json(data);
  },
);

export const POST = handle(app);
export const OPTIONS = handle(app);
