import { Resend } from "resend";

import { config } from "../config";
import type { SendEmailHandler } from "../types";

// The Resend client is constructed inside send() (not at module load) so a
// missing RESEND_API_KEY does not throw when this module is imported during
// `next build` — mirroring the Plunk provider. Sends still fail loudly at
// runtime if the key is unset.
export const send: SendEmailHandler = async ({
	to,
	from,
	subject,
	cc,
	bcc,
	replyTo,
	html,
	text,
}) => {
	const resend = new Resend(process.env.RESEND_API_KEY);
	await resend.emails.send({
		from: from ?? config.mailFrom,
		to: [to],
		cc,
		bcc,
		replyTo,
		subject,
		html,
		text,
	});
};
