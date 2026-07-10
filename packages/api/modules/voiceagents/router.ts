import {
	attachAgentSource,
	detachAgentSource,
	listAgentSourcesProcedure,
} from "./procedures/agent-sources";
import {
	autoMapAgentSourceProcedure,
	getAgentSourceMapping,
	listContactFieldsProcedure,
	saveAgentSourceMappingProcedure,
} from "./procedures/agent-source-mapping";
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from "./procedures/agents";
import { listAgentCalendars } from "./procedures/agent-calendars";
import { listAgentLiveTools } from "./procedures/agent-live-tools";
import { getCallEvents, getTranscript, listCalls } from "./procedures/calls";
import { saveFlow } from "./procedures/flow";
import { listNumbers, setNumberAgent } from "./procedures/numbers";
import { createTestSession } from "./procedures/sessions";
import { getTriggerUrl } from "./procedures/trigger";
import { createTool, deleteTool, listTools, setAgentTools } from "./procedures/tools";

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
