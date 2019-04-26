import { startWebSocketServer } from "@hediet/typed-json-rpc-websocket-server";
import {
	DisposableComponent,
	disposeOnReturn,
	dispose,
	DisposableLike,
	Disposable,
} from "@hediet/std/disposable";
import { TypedChannel, ConsoleRpcLogger } from "@hediet/typed-json-rpc";

export type ClientHandlerFn = (
	client: TypedChannel,
	onClosed: Promise<void>
) => DisposableLike;

interface Client {
	typedChannel: TypedChannel;
	onClosed: Promise<void>;
	disposables: Set<Disposable>;
}

interface Handler {
	handlerFn: ClientHandlerFn;
	disposables: Set<Disposable>;
}

function setAndDeleteOnDispose<T>(set: Set<T>, item: T): Disposable;
function setAndDeleteOnDispose<TKey, TValue>(
	set: Map<TKey, TValue>,
	key: TKey,
	item: TValue
): Disposable;
function setAndDeleteOnDispose(
	set: Set<any> | Map<any, any>,
	keyOrItem: any,
	item?: any
): Disposable {
	if (set instanceof Set) {
		set.add(keyOrItem);
		return Disposable.create(() => set.delete(keyOrItem));
	} else {
		set.set(keyOrItem, item);
		return Disposable.create(() => set.delete(keyOrItem));
	}
}

export class Server extends DisposableComponent {
	static instance: Server = new Server();

	public readonly port: number;
	private readonly handler = new Set<Handler>();
	private readonly clients = new Set<Client>();

	private register(client: Client, handler: Handler) {
		const disposeHandlerResult = Disposable.create(
			handler.handlerFn(client.typedChannel, client.onClosed)
		);
		let disposeLinks: Disposable;
		let disposeAll = {
			dispose: () => dispose([disposeHandlerResult, disposeLinks]),
		};
		disposeLinks = Disposable.create([
			setAndDeleteOnDispose(client.disposables, disposeAll),
			setAndDeleteOnDispose(handler.disposables, disposeAll),
		]);
	}

	public registerClientHandler(handlerFn: ClientHandlerFn): Disposable {
		return new DisposableComponent(track => {
			const handler: Handler = {
				handlerFn: handlerFn,
				disposables: new Set(),
			};
			track(setAndDeleteOnDispose(this.handler, handler));
			for (const client of this.clients) {
				this.register(client, handler);
			}
			track(handler.disposables);
		});
	}

	constructor() {
		super();
		const server = this.trackDisposable(
			startWebSocketServer({ port: 0 }, async stream =>
				disposeOnReturn(async track => {
					const typedChannel = TypedChannel.fromStream(
						stream,
						new ConsoleRpcLogger()
					);
					const client: Client = {
						typedChannel,
						onClosed: stream.onClosed,
						disposables: new Set(),
					};
					track(setAndDeleteOnDispose(this.clients, client));
					for (const handler of this.handler) {
						this.register(client, handler);
					}
					typedChannel.startListen();
					track(client.disposables);
					await stream.onClosed;
				})
			)
		);

		this.port = server.port;
	}
}
