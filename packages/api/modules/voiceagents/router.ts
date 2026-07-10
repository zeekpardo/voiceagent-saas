import { listAgentCalendars } from "./procedures/agent-calendars";
import { listAgentLiveTools } from "./procedures/agent-live-tools";
import {
	autoMapAgentSourceProcedure,
	getAgentSourceMapping,
	listContactFieldsProcedure,
	saveAgentSourceMappingProcedure,
} from "./procedures/agent-source-mapping";
import {
	attachAgentSource,
	detachAgentSource,
	listAgentSourcesProcedure,
} from "./procedures/agent-sources";
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from "./procedures/agents";
import { getCallEvents, getTranscript, listCalls } from "./procedures/calls";
import {
	discardDraft,
	getDraft,
	getVersion,
	listVersions,
	publishAgent,
	restoreVersion,
	saveDraft,
} from "./procedures/drafts";
import { saveFlow } from "./procedures/flow";
import { listNumbers, setNumberAgent } from "./procedures/numbers";
import {
	createPersonaProcedure,
	deletePersonaProcedure,
	getPersonaProcedure,
	listPersonasProcedure,
	updatePersonaProcedure,
} from "./procedures/personas";
import { createTestSession } from "./procedures/sessions";
import { createTool, deleteTool, listTools, setAgentTools } from "./procedures/tools";
import { getTriggerUrl } from "./procedures/trigger";

export const voiceagentsRouter = {
	agents: {
		list: listAgents,
		get: getAgent,
		create: createAgent,
		update: updateAgent,
		delete: deleteAgent,
		setTools: setAgentTools,
	},
	flow: {
		save: saveFlow,
	},
	draft: {
		save: saveDraft,
		get: getDraft,
		discard: discardDraft,
		publish: publishAgent,
	},
	versions: {
		list: listVersions,
		get: getVersion,
		restore: restoreVersion,
	},
	tools: {
		list: listTools,
		create: createTool,
		delete: deleteTool,
	},
	sessions: {
		create: createTestSession,
	},
	calls: {
		list: listCalls,
		transcript: getTranscript,
		events: getCallEvents,
	},
	numbers: {
		list: listNumbers,
		setAgent: setNumberAgent,
	},
	personas: {
		list: listPersonasProcedure,
		get: getPersonaProcedure,
		create: createPersonaProcedure,
		update: updatePersonaProcedure,
		delete: deletePersonaProcedure,
	},
	sources: {
		list: listAgentSourcesProcedure,
		attach: attachAgentSource,
		detach: detachAgentSource,
		autoMap: autoMapAgentSourceProcedure,
		getMapping: getAgentSourceMapping,
		saveMapping: saveAgentSourceMappingProcedure,
		contactFields: listContactFieldsProcedure,
	},
	liveTools: listAgentLiveTools,
	calendars: listAgentCalendars,
	triggerUrl: getTriggerUrl,
};
