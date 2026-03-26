import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { name, company, email, size, current_system, problem } = req.body;

  try {
    // 🔌 Connect using your existing Vercel env vars
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // 📩 Email to YOU (license@attendr.com.au)
    await transporter.sendMail({
      from: `"Attendr Pilot" <${process.env.SMTP_USER}>`,
      to: "hello@attendr.com.au",
      subject: "New Pilot Application",
      text: `
New Attendr Pilot Application

Name: ${name}
Company: ${company}
Email: ${email}
Company Size: ${size}

Current System:
${current_system || "Not provided"}

Problem:
${problem || "Not provided"}
      `
    });

    // 📬 Auto-reply to THEM (this is 🔥 for conversions)
    await transporter.sendMail({
      from: `"Attendr" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "We’ve received your Attendr pilot application",
      text: `
Hi ${name},

Thanks for applying to the Attendr Founding Pilot Program.

We’ll review your application and get back to you shortly.

— Attendr
      `
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Email error:", error);
    return res.status(500).json({ error: "Email failed" });
  }
}