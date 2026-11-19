// Step 7: send through Gmail. The "to" address is hardcoded to MY_EMAIL - never the prospect.

import nodemailer from 'nodemailer';

export function gmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.MY_EMAIL);
}

export function autoSendOn() {
  return String(process.env.AUTO_SEND || 'true').toLowerCase() !== 'false';
}

let transport;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s/g, '') },
    });
  }
  return transport;
}

export async function sendEmail({ subject, body, contact, company }) {
  if (!gmailConfigured()) throw new Error('Gmail is not set up: add GMAIL_USER, GMAIL_APP_PASSWORD and MY_EMAIL.');
  const footer = `\n\n--\nSprinto Outreach test send. Intended for: ${contact.first_name} ${contact.last_name || ''} (${contact.title}) <${contact.email}> at ${company.name}.`;
  const info = await getTransport().sendMail({
    from: `${process.env.SENDER_NAME || 'Rashmi'} (Sprinto) <${process.env.GMAIL_USER}>`,
    to: process.env.MY_EMAIL,
    subject,
    text: body + footer,
  });
  return { messageId: info.messageId, to: process.env.MY_EMAIL, at: new Date().toISOString() };
}
