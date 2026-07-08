import { protectedProcedure } from "../../../orpc/procedures";
import { listCrmProviders } from "../../crm/lib/resolve";

/** Registered CRM provider metadata — drives the "Add New Source" dialog. */
export const sourceProviders = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/providers",
		tags: ["Sources"],
		summary: "List available source (CRM) providers",
	})
	.handler(async () => ({ providers: listCrmProviders() }));
