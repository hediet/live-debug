import {
	TypedChannel,
	ChannelFactory,
	StreamBasedChannel,
} from "@hediet/typed-json-rpc";
import { WebSocketStream } from "@hediet/typed-json-rpc-websocket";
import { EventEmitter } from "@hediet/std/events";
import { disposeOnReturn } from "@hediet/std/disposable";

export interface LiveDebugApi {
	pendingServers: { port: number }[];
	connectTo: (port: number) => void;
}

/**
 * A callback to register services accessible
 * and with the access to the debugger.
 */
export type ClientInitializer = (
	channel: TypedChannel,
	onClosed: Promise<void>
) => void;

/**
 * For internal use only.
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

function initAndProcessLiveDebugApi() {
	const api = getLiveDebugApi();
	api.connectTo = port => {
		connectTo(port);
	};
	for (const server of api.pendingServers) {
		api.connectTo(server.port);
	}
	api.pendingServers.length = 0;
}

initAndProcessLiveDebugApi();

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

	const channelFactory: ChannelFactory = {
		createChannel: listener => {
			const channel = new StreamBasedChannel(stream, listener, undefined);
			return channel;
		},
	};

	const typedChannel = new TypedChannel(channelFactory, undefined);

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
