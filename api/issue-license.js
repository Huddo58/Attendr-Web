import crypto from "crypto";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map Stripe PRICE IDs -> tier info
const PRICE_MAP = {
  [process.env.STRIPE_PRICE_STARTER]:  { tier: "Starter",  max_users: 50  },
  [process.env.STRIPE_PRICE_GROWTH]:   { tier: "Growth",   max_users: 150 },
  [process.env.STRIPE_PRICE_BUSINESS]: { tier: "Business", max_users: 300 }
};

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function plusOneYearISODate() {
  const issued = new Date();
  const expires = new Date(issued);
  expires.setFullYear(expires.getFullYear() + 1);

  return {
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString().split("T")[0]
  };
}

function signLicense(payload, privateKeyPem) {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64url(payloadJson);

  const keyObject = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem"
  });

  const signature = crypto.sign(
    null,
    Buffer.from(payloadB64),
    keyObject
  );

  const sigB64 = b64url(signature);

  return `${payloadB64}.${sigB64}`;
}

async function sendEmail({ to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: `Attendr Licensing <${process.env.SMTP_USER}>`,
    replyTo: "licensing@attendr.com.au",
    to,
    subject,
    text
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { org, instanceId, sessionId } = req.body || {};

    if (!org || !instanceId || !sessionId) {
      return res.status(400).json({
        error: "Missing org, instanceId, or sessionId."
      });
    }

    const instance_id = instanceId;
    const session_id = sessionId;

    // Verify Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session) {
      return res.status(400).json({ error: "Invalid session_id." });
    }

    if (session.payment_status !== "paid") {
      return res.status(402).json({
        error: "Payment not confirmed as paid."
      });
    }

    const email = session.customer_details?.email || session.customer_email;

    if (!email) {
      return res.status(400).json({
        error: "Stripe session missing customer email."
      });
    }

    // Determine purchased tier
    const items = await stripe.checkout.sessions.listLineItems(session_id, {
      limit: 10
    });

    const priceId = items?.data?.[0]?.price?.id;

    if (!priceId) {
      return res.status(400).json({
        error: "Could not determine purchased item."
      });
    }

    const tierInfo = PRICE_MAP[priceId];

    if (!tierInfo) {
      return res.status(400).json({
        error: "Unknown product price. Check PRICE_MAP."
      });
    }

    const { issued_at, expires_at } = plusOneYearISODate();

    // Build license payload
    const payload = {
      tier: tierInfo.tier,
      max_users: tierInfo.max_users,
      issued_at,
      expires_at,
      instance_id,
      email,
      org,
      stripe_invoice: session.id
    };

    // Load private key from Vercel env and convert \n back to real newlines
    const privateKey =
      process.env.LICENSE_PRIVATE_KEY_PEM?.replace(/\\n/g, "\n");

    if (!privateKey) {
      return res.status(500).json({
        error: "Server missing LICENSE_PRIVATE_KEY_PEM."
      });
    }

    // Sign license
    const licenseKey = signLicense(payload, privateKey);

    // Email license
    await sendEmail({
      to: email,
      subject: "Your Attendr License Key",
      text:
`Thanks for purchasing Attendr.

Organisation: ${org}
Tier: ${payload.tier}
User limit: ${payload.max_users}
Expires: ${payload.expires_at}

Instance ID:
${instance_id}

Stripe reference:
${session.id}

Your license key:
${licenseKey}

Paste this into Attendr: Admin → Settings → Licensing`
    });

    return res.status(200).json({ ok: true, email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Server error generating license."
    });
  }
}