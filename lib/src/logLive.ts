import { TypedChannel } from "@hediet/typed-json-rpc";
import { registerLiveDebug } from ".";
import { contract, notificationContract } from "@hediet/typed-json-rpc";
import { type, string, Integer } from "io-ts";
import * as StackTracey from "stacktracey";

export const liveLogContract = contract({
	server: {
		logExpression: notificationContract({
			params: type({
				filename: string,
				lineNumber: Integer,
				value: string,
			}),
		}),
		logExpressionById: notificationContract({
			params: type({
				id: string,
				value: string,
			}),
		}),
	},
	client: {},
});

const servers = new Set<typeof liveLogContract.TServerInterface>();

registerLiveDebug(async (channel: TypedChannel, onClose: Promise<void>) => {
	const { server } = liveLogContract.getServer(channel, {});
	servers.add(server);
	onClose.then(() => {
		servers.delete(server);
	});
});

/**
 * Logs an expression and tracks the source using source maps.
 * Does only work well on NodeJS.
 */
export async function liveLog(expression: any): Promise<void> {
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
