// Outbound mail, behind a seam.
//
// There is no email provider wired up yet, and the security-critical part of
// a reset — token generation, hashing, expiry, single use, invalidation — has
// nothing to do with delivery. So that part is built and tested now, and
// delivery is a function with one implementation you can swap.
//
// In development the link is written to the server log. That is genuinely
// useful (you can complete a reset locally with no provider) and genuinely
// unsafe in production, so a production deploy without a provider refuses to
// send rather than logging a working credential to stdout.

export type Mail = {
  to: string;
  subject: string;
  body: string;
};

export type MailResult =
  | { delivered: true; via: string }
  | { delivered: false; reason: string };

export async function sendMail(mail: Mail): Promise<MailResult> {
  // Swap point. A provider goes here — e.g.:
  //
  //   if (process.env.RESEND_API_KEY) {
  //     await resend.emails.send({ from, to: mail.to, subject, text: mail.body });
  //     return { delivered: true, via: "resend" };
  //   }
  //
  // Everything else in the reset flow stays as it is.

  if (process.env.NODE_ENV === "production") {
    return {
      delivered: false,
      reason:
        "No email provider is configured, so the reset link could not be sent.",
    };
  }

  console.log(
    `\n[groundwork] mail to ${mail.to}\n  ${mail.subject}\n${mail.body
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")}\n`
  );
  return { delivered: true, via: "server log (development only)" };
}

export function resetEmail(link: string, expiresInHours: number): Mail {
  return {
    to: "",
    subject: "Reset your Groundwork password",
    body: [
      "Someone asked to reset the password on this account.",
      "",
      `Open this link within ${expiresInHours} hour${expiresInHours === 1 ? "" : "s"}:`,
      link,
      "",
      "It works once, and only until it expires.",
      "",
      "If this wasn't you, nothing has changed and you can ignore this. Your",
      "entries were never accessible from this link — it only sets a new password.",
    ].join("\n"),
  };
}
