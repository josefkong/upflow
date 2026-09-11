import { prisma } from "@/lib/prisma";
import { commercialLeadPresentationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

export async function sendCommercialLeadPresentationEmails(input: {
  eventId: string;
  recipients: Array<{ email: string; name: string }>;
  brandName: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: input.eventId }, select: { meeting_url: true } });
  const format = (date: Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
  const recipients = Array.from(
    new Map(
      input.recipients
        .filter((recipient) => recipient.email.trim())
        .map((recipient) => [recipient.email.trim().toLowerCase(), recipient]),
    ).values(),
  );
  await Promise.all(recipients.map(({ email, name }) => {
    const rendered = commercialLeadPresentationEmail({
      recipientName: name,
      brandName: input.brandName,
      startsAtLabel: format(input.startsAt),
      endsAtLabel: format(input.endsAt),
      meetingUrl: event?.meeting_url,
    });
    return sendEmail({ to: email, ...rendered, scope: "commercial-lead-presentation" });
  }));
}
