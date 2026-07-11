import { connectSource } from "./procedures/connect";
import { matchContact } from "./procedures/contact-match";
import {
	createSourceCustomField,
	listSourceCalendars,
	listSourceCustomFields,
	listSourcePipelines,
	listSourceTags,
} from "./procedures/directory";
import { disconnectSourceProcedure } from "./procedures/disconnect";
import { listSourcesProcedure } from "./procedures/list";
import {
	listNumbersForSource,
	purchaseNumberForSource,
	releaseNumberForSource,
	searchAvailableNumbers,
} from "./procedures/numbers";
import { sourceOauthUrl } from "./procedures/oauth";
import { sourceProviders } from "./procedures/providers";
import { sourceUsage, usageSummary } from "./procedures/usage";

export const sourcesRouter = {
	list: listSourcesProcedure,
	providers: sourceProviders,
	connect: connectSource,
	oauthUrl: sourceOauthUrl,
	disconnect: disconnectSourceProcedure,
	tags: { list: listSourceTags },
	pipelines: { list: listSourcePipelines },
	calendars: { list: listSourceCalendars },
	customFields: {
		list: listSourceCustomFields,
		create: createSourceCustomField,
	},
	matchContact,
	numbers: {
		available: searchAvailableNumbers,
		purchase: purchaseNumberForSource,
		list: listNumbersForSource,
		release: releaseNumberForSource,
	},
	usage: sourceUsage,
	usageSummary,
};
