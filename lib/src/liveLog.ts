import {
	TypedChannel,
	contract,
	notificationContract,
	types,
} from "@hediet/typed-json-rpc";
import { registerLiveDebug } from ".";
import * as StackTracey from "stacktracey";

export const liveLogContract = contract({
	server: {
		logExpression: notificationContract({
			params: types.type({
				filename: types.string,
				lineNumber: types.Integer,
				value: types.string,
			}),
		}),
		logExpressionById: notificationContract({
			params: types.type({
				id: types.string,
				value: types.string,
			}),
		}),
	},
	client: {},
});

const servers = new Set<typeof liveLogContract.TServerInterface>();

registerLiveDebug((channel: TypedChannel, onClose: Promise<void>) => {
	const { server } = liveLogContract.getServer(channel, {});
	channel.onListening.then(async () => {
		servers.add(server);
		await onClose;
		servers.delete(server);
	});
});

/**
 * Logs an expression and tracks the source using source maps.
 * Does only work well on NodeJS.
 * For TypeScript, you must have source maps enabled.
 */
export async function liveLog(expression: any): Promise<void> {
	StackTracey.resetCache();
	const tracey = new StackTracey();
	const parentFrame = tracey.withSources[1];
	const filename = parentFrame.file;
	const lineNumber = parentFrame.line - 1;

	for (const s of servers) {
		s.logExpression({
			filename,
			lineNumber,
			value: expression.toString(),
		});
	}
}

/**
 * Logs an expression and tracks the source using an unique id.
 */
export async function liveLogId(id: string, expression: any): Promise<void> {
	for (const s of servers) {
		s.logExpressionById({ id, value: expression.toString() });
	}
}
