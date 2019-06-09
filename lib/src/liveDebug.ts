import { TypedChannel } from "@hediet/typed-json-rpc";
import { WebSocketStream } from "@hediet/typed-json-rpc-websocket";
import { EventEmitter } from "@hediet/std/events";
import { disposeOnReturn } from "@hediet/std/disposable";

/**
 * @internal
 * Used from the vsode extension to make the debuggee connect to its RPC server.
 */
export interface LiveDebugApi {
	/**
	 * Connect requests that haven't been processed yet.
	 */
	pendingServers: { port: number }[];
	/**
	 * Instructs the debugee to connect to the live debug RPC server.
	 */
	connectTo: (port: number) => void;
}
/**
 * @internal
 * The source of the function is evaluated in the debug
 * session from the vscode extension.
 */
export function getLiveDebugApi(): LiveDebugApi {
	const obj = typeof window === "object" ? (window as any) : (global as any);
	const key = "@hediet/live-debug";
	let liveDebugApi: LiveDebugApi | undefined = obj[key];
	if (!liveDebugApi) {
		let pendingServers = new Array<{ port: number }>();
		obj[key] = liveDebugApi = {
			pendingServers,
			connectTo: (port: number) => pendingServers.push({ port }),
		};
	}
	return liveDebugApi;
}

initAndProcessLiveDebugApi();

function initAndProcessLiveDebugApi() {
	const api = getLiveDebugApi();
	const oldConnectTo = api.connectTo;
	api.connectTo = port => {
		connectTo(port);
		oldConnectTo(port);
	};
	for (const server of api.pendingServers) {
		connectTo(server.port);
	}
}

/**
 * A callback to register services accessible
 * and with the access to the debugger.
 */
export type ClientInitializer = (
	channel: TypedChannel,
	onClosed: Promise<void>
) => void;

const initializers = new Set<ClientInitializer>();
const onNewInitializer = new EventEmitter<{ initializer: ClientInitializer }>();

/**
 * Registers a debug service.
 * The initializer is called when a connection
 * to a debugger that supports live debug has been established.
 */
export function registerLiveDebug(initializer: ClientInitializer) {
	initializers.add(initializer);
	onNewInitializer.emit({ initializer });
}

async function connectTo(port: number) {
	const stream = await WebSocketStream.connectTo({
		port,
		host: "localhost",
	});

	const typedChannel = TypedChannel.fromStream(stream, undefined);

	for (const init of initializers) {
		init(typedChannel, stream.onClosed);
	}

	disposeOnReturn(async track => {
		track(
			onNewInitializer.sub(({ initializer }) => {
				initializer(typedChannel, stream.onClosed);
			})
		);
		typedChannel.startListen();

		await stream.onClosed;
	});
}
